import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { defaultSettings } from "../src/data/catalog";
import type { Transaction } from "../src/types/finance";
import {
  parseBackup,
  validateBackupSnapshot,
} from "../src/features/transactions/backup";
import { rawLocal, seedLocal } from "./helpers/localData";
import { backupFixture } from "./helpers/backupFixture";

const unavailable = "Cálculo monetário indisponível.";
async function exported(page: Page) {
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar dados completos (JSON)" })
    .click();
  const download = await downloading,
    path = await download.path();
  return parseBackup(await readFile(path!, "utf8"));
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
});

test("overflow real de snapshot válido mantém lista, edição CAS e exportações sem recovery", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const settings = defaultSettings();
  const transactions: Transaction[] = [];
  let remaining = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  while (remaining > 0n) {
    const cents = remaining > 99999999900n ? 99999999900n : remaining;
    transactions.push({
      id: `money-${String(transactions.length).padStart(6, "0")}`,
      type: "income",
      categoryId: "income",
      accountId: "principal",
      amount: Number(cents) / 100,
      date: "2026-09-10",
      description: `Movimento ${transactions.length}`,
      recurring: false,
      source: "manual",
      createdAt: "2026-09-10T12:00:00Z",
    });
    remaining -= cents;
  }
  expect(validateBackupSnapshot({ settings, transactions }).transactions).toBe(
    transactions,
  );
  await seedLocal(page, { present: true, settings, transactions });
  await page.goto("/");
  await expect(
    page.getByRole("status").filter({ hasText: unavailable }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Recuperação de dados locais" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".primary-metric,.insights-section,.recharts-wrapper"),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("button", { name: "Adicionar transação", exact: true })
      .filter({ visible: true }),
  ).toBeEnabled();
  await expect(page.locator("table tbody tr")).toHaveCount(5);
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await expect(page.locator(".filter-summary")).toContainText(unavailable);
  await expect(page.locator("table tbody tr")).toHaveCount(20);
  const csvDownloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const csv = await readFile((await (await csvDownloading).path())!, "utf8");
  expect(csv.split("\r\n")).toHaveLength(transactions.length + 1);
  await page
    .getByRole("button", { name: /^Editar Movimento/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Descrição", { exact: true })
    .fill("Editável durante overflow");
  await dialog.getByRole("button", { name: "Salvar transação" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".filter-summary")).toContainText(unavailable);
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await expect(
    page.locator(".form-note").filter({ hasText: unavailable }),
  ).toHaveCount(1);
  const backup = await exported(page);
  expect(backup.version).toBe(2);
  expect(backup.transactions).toHaveLength(transactions.length);
  const edited = backup.transactions.find(
    (t) => t.description === "Editável durante overflow",
  )!;
  const original = transactions.find((t) => t.id === edited.id)!;
  expect(edited).toEqual({
    ...original,
    description: "Editável durante overflow",
  });
  expect(backup.settings).toEqual(settings);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Recuperação de dados locais" }),
  ).toHaveCount(0);
  const state = await page.evaluate(
    () =>
      new Promise<{ count: number; revision: number; version: number }>(
        (resolve, reject) => {
          const open = indexedDB.open("vertice-finance");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result,
              tx = db.transaction(["transactions", "settings"]);
            const count = tx.objectStore("transactions").count(),
              meta = tx
                .objectStore("settings")
                .get("__vertice_local_concurrency__");
            tx.oncomplete = () => {
              resolve({
                count: count.result,
                revision: meta.result.revision,
                version: db.version,
              });
              db.close();
            };
            tx.onabort = () => {
              db.close();
              reject(tx.error);
            };
          };
        },
      ),
  );
  expect(state).toEqual({
    count: transactions.length,
    revision: 1,
    version: 3,
  });
  expect(errors).toEqual([]);
});

test("subcentavo raw em conta/fixa/meta permite JSON v2 e restore real sem zerar", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const backup = backupFixture();
  backup.settings.accounts[0].initialBalance = 1e-8;
  backup.settings.fixedExpenses[0].amount = 1e-8;
  backup.settings.goals[0].targetAmount = 1e-8;
  Object.assign(backup.settings, { historicalNote: "preservar raw" });
  validateBackupSnapshot(backup);
  await seedLocal(page, {
    present: true,
    settings: backup.settings,
    transactions: backup.transactions,
  });
  const before = await rawLocal(page);
  await page.goto("/");
  await expect(
    page.getByRole("status").filter({ hasText: unavailable }),
  ).toBeVisible();
  await expect(page.locator(".primary-metric,.insights-section")).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Configurações", exact: true }).click();
  await page.getByText("Renda e compromissos fixos", { exact: false }).click();
  await page.getByText("Metas pessoais", { exact: false }).click();
  await expect(
    page.locator(".form-note").filter({ hasText: unavailable }),
  ).toHaveCount(3);
  expect(await rawLocal(page)).toEqual(before);
  const downloaded = await exported(page);
  expect(downloaded.settings).toEqual(backup.settings);
  expect(downloaded.transactions).toEqual(before.transactions);
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "raw.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(downloaded)),
  });
  await expect(
    dialog.getByRole("region", { name: "Prévia do backup" }),
  ).toBeVisible();
  const safety = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Baixar backup de segurança" })
    .click();
  const safetyBackup = parseBackup(
    await readFile((await (await safety).path())!, "utf8"),
  );
  expect(safetyBackup.settings).toEqual(backup.settings);
  await dialog.getByRole("button", { name: "Restaurar este backup" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  const after = await rawLocal(page);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.settings[after.keys.indexOf("personal")]).toEqual(
    backup.settings,
  );
  expect(
    after.settings[after.keys.indexOf("__vertice_local_concurrency__")],
  ).toEqual({ protocol: 1, revision: 1 });
  await expect(
    page.getByRole("region", { name: "Recuperação de dados locais" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("rascunho monetário inválido permanece editável e protegido pelo guard A2c", async ({
  page,
}) => {
  const backup = backupFixture();
  await seedLocal(page, {
    present: true,
    settings: backup.settings,
    transactions: backup.transactions,
  });
  const before = await rawLocal(page);
  await page.goto("/#/configuracoes");
  await page.getByText("Renda e compromissos fixos", { exact: false }).click();
  await page
    .getByLabel("Renda mensal prevista (R$)", { exact: true })
    .fill("1.001");
  await expect(
    page.locator(".form-note").filter({ hasText: unavailable }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Transações", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Continuar editando" })
    .click();
  await expect(
    page.getByLabel("Renda mensal prevista (R$)", { exact: true }),
  ).toHaveValue("1.001");
  await page.getByLabel("Renda mensal prevista (R$)", { exact: true }).fill("");
  await expect(
    page.locator(".form-note").filter({ hasText: unavailable }),
  ).toBeVisible();
  expect(await rawLocal(page)).toEqual(before);
});

test("erro isolado no saldo da conta não substitui resumo mensal válido por zero", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const backup = backupFixture();
  backup.settings.accounts[0].initialBalance = 1e-8;
  backup.settings.lowBalanceThreshold = 0;
  await seedLocal(page, {
    present: true,
    settings: backup.settings,
    transactions: backup.transactions,
  });
  const before = await rawLocal(page);
  await page.goto("/");
  await expect(page.locator(".primary-metric h2")).toContainText("1.500,00");
  await page.locator(".accounts-overview summary").click();
  await expect(page.locator(".account-grid>div").first()).toContainText(
    unavailable,
  );
  await expect(page.locator(".account-grid>div").nth(1)).toContainText(
    "3.000,00",
  );
  await expect(
    page.getByRole("region", { name: "Recuperação de dados locais" }),
  ).toHaveCount(0);
  expect(await rawLocal(page)).toEqual(before);
  expect(errors).toEqual([]);
});
