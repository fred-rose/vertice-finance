import { expect, test } from "./helpers/appTest";
import type { Page } from "@playwright/test";
import { build } from "vite";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { defaultSettings } from "../src/data/catalog";
import type { Transaction } from "../src/types/finance";
import { parseBackup } from "../src/features/transactions/backup";
import { rawLocal, seedLocal } from "./helpers/localData";
const row = (source?: Transaction["source"]): Transaction => ({
  id: "demo-unknown",
  type: "income",
  amount: 100,
  description: "Legado",
  date: "2026-09-10",
  accountId: "principal",
  categoryId: "income",
  recurring: false,
  ...(source ? { source } : {}),
});
async function start(page: Page, transactions: Transaction[]) {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
  await seedLocal(page, {
    present: true,
    settings: defaultSettings(),
    transactions,
  });
  await page.goto("/");
  await expect(page.locator(".primary-metric h2")).toBeVisible();
}
for (const source of [undefined, "manual", "import", "demo"] as const)
  test(
    "edição CAS real preserva source " +
      (source ?? "unknown") +
      " e createdAt ausente",
    async ({ page }) => {
      await start(page, [row(source)]);
      await page.getByRole("link", { name: "Transações", exact: true }).click();
      await page
        .getByRole("button", { name: "Editar Legado", exact: true })
        .click();
      await page
        .getByLabel("Descrição", { exact: true })
        .fill("Legado editado");
      await page.getByRole("button", { name: "Salvar transação" }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const raw = await rawLocal(page),
        stored = raw.transactions[0] as Transaction;
      expect(stored.description).toBe("Legado editado");
      expect(stored.source).toBe(source);
      expect(stored.createdAt).toBeUndefined();
      expect(
        raw.settings[raw.keys.indexOf("__vertice_local_concurrency__")],
      ).toEqual({ protocol: 1, revision: 1 });
      await page
        .getByRole("link", { name: "Configurações", exact: true })
        .click();
      const downloading = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Exportar dados completos (JSON)" })
        .click();
      const backup = parseBackup(
        await readFile((await (await downloading).path())!, "utf8"),
      );
      expect(backup.version).toBe(2);
      expect(backup.transactions[0].source).toBe(source);
      expect(Object.hasOwn(backup.transactions[0], "createdAt")).toBe(false);
      await page.reload();
      expect((await rawLocal(page)).transactions).toEqual(raw.transactions);
    },
  );
test("criação manual nova usa Instant real e data de caixa civil", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Adicionar primeira transação" })
    .click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("10,00");
  await page.getByLabel("Descrição", { exact: true }).fill("Nova manual");
  await page.getByRole("button", { name: "Salvar transação" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const stored = (await rawLocal(page)).transactions[0] as Transaction;
  expect(stored.source).toBe("manual");
  expect(stored.createdAt).toBe("2026-09-15T15:00:00.000Z");
  expect(stored.date).toBe("2026-09-15");
});
test("removeDemo não remove unknown pelo prefixo; timestamp explícito preservado", async ({
  page,
}) => {
  const unknown = { ...row(), createdAt: "2026-09-10T09:00:00-03:00" };
  await start(page, [unknown, { ...row("demo"), id: "real-demo" }]);
  await page.getByRole("button", { name: "Remover demonstração" }).click();
  await page
    .getByRole("button", { name: "Remover demonstração", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await rawLocal(page)).transactions).toEqual([unknown]);
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar Legado", exact: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill("Timestamp mantido");
  await page.getByRole("button", { name: "Salvar transação" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    ((await rawLocal(page)).transactions[0] as Transaction).createdAt,
  ).toBe(unknown.createdAt);
});
test("virada civil via focus recompõe métricas sem revision ou reset do draft", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-14T15:00:00Z"));
  await page.goto("/favicon.svg");
  const settings = defaultSettings();
  settings.accounts[0].initialBalance = 500;
  settings.accounts[0].initialBalanceDate = "2026-09-01";
  const rows = [
    { ...row(), date: "2026-09-14" },
    { ...row(), id: "tomorrow", date: "2026-09-15", amount: 200 },
  ];
  await seedLocal(page, { present: true, settings, transactions: rows });
  await page.goto("/");
  await expect(page.locator(".primary-metric h2")).toContainText("100,00");
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByLabel("Descrição", { exact: true }).fill("Draft retido");
  const before = await rawLocal(page);
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".primary-metric h2")).toContainText("300,00");
  await expect(page.getByLabel("Descrição", { exact: true })).toHaveValue(
    "Draft retido",
  );
  await expect(page.getByLabel("Data", { exact: true })).toHaveValue(
    "2026-09-14",
  );
  await expect(page.getByLabel("Data", { exact: true })).toHaveAttribute(
    "max",
    "2026-09-15",
  );
  expect(await rawLocal(page)).toEqual(before);
  await page.getByRole("button", { name: "Fechar" }).click();
  await expect(
    page.getByRole("button", { name: "Descartar e fechar" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuar editando" }).click();
  await expect(page.getByLabel("Descrição", { exact: true })).toHaveValue(
    "Draft retido",
  );
});
test("virada do ano libera navegação civil sem mudar mês escolhido", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-12-31T15:00:00Z"));
  await page.goto("/");
  await expect(page.locator(".month-selector span")).toContainText(
    "dezembro de 2026",
  );
  await expect(
    page.getByRole("button", { name: "Próximo mês" }),
  ).toBeDisabled();
  await page.clock.setFixedTime(new Date("2027-01-01T15:00:00Z"));
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByRole("button", { name: "Próximo mês" })).toBeEnabled();
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.locator(".month-selector span")).toContainText(
    "janeiro de 2027",
  );
  await expect(
    page.getByRole("button", { name: "Próximo mês" }),
  ).toBeDisabled();
});
for (const epoch of [false, true])
  test(
    "XLSX real serial/Date, epoch1904=" + epoch + ", source import",
    async ({ page }) => {
      const w = new ExcelJS.Workbook();
      w.properties.date1904 = epoch;
      const s = w.addWorksheet("Extrato");
      s.addRow(["Data", "Descrição", "Valor"]);
      s.addRow([epoch ? 44813 : 46275, "Serial", -100]);
      s.addRow([new Date("2026-09-10T00:00:00Z"), "Date", -50]);
      s.getCell("A3").numFmt = "yyyy-mm-dd";
      const buffer = Buffer.from(await w.xlsx.writeBuffer());
      await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
      await page.goto("/");
      await page.getByRole("button", { name: "Importar planilha" }).click();
      await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
        name: "epoch.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer,
      });
      await expect(
        page.getByRole("button", { name: "Importar 2 transações" }),
      ).toBeEnabled();
      await page.getByRole("button", { name: "Importar 2 transações" }).click();
      await expect(page.getByRole("status")).toContainText(
        "2 transações importadas",
      );
      const rows = (await rawLocal(page)).transactions as Transaction[];
      expect(rows.map((t) => t.date)).toEqual(["2026-09-10", "2026-09-10"]);
      expect(
        rows.every(
          (t) =>
            t.source === "import" && t.createdAt === "2026-09-15T15:00:00.000Z",
        ),
      ).toBe(true);
    },
  );
let harness: string;
test.beforeAll(async () => {
  const built = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL("./helpers/b1cHarness.ts", import.meta.url),
        ),
        name: "civilAudit",
        formats: ["iife"],
      },
    },
  });
  const result = Array.isArray(built) ? built[0] : built;
  if (!("output" in result)) throw new Error("Bundle indisponível");
  harness = result.output.find((c) => c.type === "chunk")!.code;
});
for (const timezoneId of ["America/Sao_Paulo", "UTC", "America/New_York"])
  test(
    "mesmo snapshot e corte sob máquina " + timezoneId,
    async ({ browser }) => {
      const context = await browser.newContext({ timezoneId });
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date("2040-01-01T00:00:00Z"));
      await page.goto("/");
      await page.addScriptTag({ content: harness });
      const result = await page.evaluate(() => {
        const api = (window as any).civilAudit;
        const rows = ["2026-09-01", "2026-09-07", "2026-09-15"].map(
          (date, i) => ({
            id: String(i),
            type: "expense",
            date,
            amount: 100,
            categoryId: "food",
            accountId: "principal",
            description: "Civil",
            recurring: false,
          }),
        );
        const period = api.civilMonth("2026-09"),
          today = api.civilDate("2026-09-15");
        return {
          projection: api.closingProjection(rows, period, today),
          comparison: api.comparablePeriods(rows, period, today).current.length,
          series: api
            .monthlyData(rows, period)
            .map((m: any) => [m.key, m.month, m.expenses]),
          capture: api.civilAt(
            api.instant("2026-01-01T01:00:00Z"),
            "America/Sao_Paulo",
          ),
        };
      });
      expect(result.projection).toBe(600);
      expect(result.comparison).toBe(3);
      expect(result.series).toEqual([
        ["2026-04", "abr", null],
        ["2026-05", "mai", null],
        ["2026-06", "jun", null],
        ["2026-07", "jul", null],
        ["2026-08", "ago", null],
        ["2026-09", "set", 300],
      ]);
      expect(result.capture).toBe("2025-12-31");
      await context.close();
    },
  );

test("restore A1 real mantém unknown, source explícito, timestamps raw e extras", async ({
  page,
}) => {
  await start(page, [row("manual")]);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  const original = [
    { ...row(), extra: { lossless: "000123" } },
    { ...row("import"), id: "import", createdAt: "2026-09-10T09:00:00-03:00" },
    { ...row("demo"), id: "demo", createdAt: "2026-09-10T12:00:00.000Z" },
  ];
  const backup = {
    version: 2,
    exportedAt: "2026-09-15T15:00:00Z",
    settings: defaultSettings(),
    transactions: original,
  };
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "unknown.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const dialog = page.getByRole("dialog"),
    downloading = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Baixar backup de segurança" })
    .click();
  await downloading;
  await expect(
    dialog.getByRole("button", { name: "Restaurar este backup" }),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Restaurar este backup" }).click();
  await expect(dialog).toHaveCount(0);
  const raw = await rawLocal(page),
    sorted = [...original].sort((a, b) => a.id.localeCompare(b.id));
  expect(raw.transactions).toEqual(sorted);
  expect(
    raw.settings[raw.keys.indexOf("__vertice_local_concurrency__")],
  ).toEqual({ protocol: 1, revision: 1 });
  await page.reload();
  expect((await rawLocal(page)).transactions).toEqual(sorted);
  const exportDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar dados completos (JSON)" })
    .click();
  const exported = parseBackup(
    await readFile((await (await exportDownload).path())!, "utf8"),
  );
  expect(exported.version).toBe(2);
  expect(exported.transactions).toEqual(sorted);
  const unknown = exported.transactions.find((t) => t.id === "demo-unknown")!;
  expect(Object.hasOwn(unknown, "source")).toBe(false);
  expect(Object.hasOwn(unknown, "createdAt")).toBe(false);
});
