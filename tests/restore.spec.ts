import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { backupFixture } from "./helpers/backupFixture";
import {
  parseBackup,
  sameBackupSnapshot,
} from "../src/features/transactions/backup";
import type { FinanceSnapshot } from "../src/types/finance";

async function persisted(page: Page): Promise<FinanceSnapshot> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("vertice-finance", 2);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["transactions", "settings"]);
          const rows = tx.objectStore("transactions").getAll();
          const settings = tx.objectStore("settings").get("personal");
          tx.oncomplete = () => {
            db.close();
            resolve({ transactions: rows.result, settings: settings.result });
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}
async function openRestore(
  page: Page,
  content = JSON.stringify(backupFixture()),
) {
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(content),
  });
  return page.getByRole("dialog");
}
async function safetyDownload(page: Page) {
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar backup de segurança" })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^vertice-backup-pre-restore-[\dTZ.-]+\.json$/,
  );
  const path = await file.path();
  if (!path) throw new Error("Download indisponível");
  const backup = parseBackup(await readFile(path, "utf8"));
  await expect(
    page.getByRole("button", { name: "Restaurar este backup" }),
  ).toBeEnabled();
  return backup;
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/#/configuracoes");
  await expect(
    page.getByRole("button", { name: "Restaurar backup JSON" }),
  ).toBeVisible();
});

test("prévia, cópia entregue antes da confirmação, restore completo e reload", async ({
  page,
}) => {
  const before = await persisted(page);
  const dialog = await openRestore(page);
  await expect(
    dialog.getByRole("region", { name: "Prévia do backup" }),
  ).toContainText("3 transações · 2 contas · 7 categorias · 1 metas");
  await expect(dialog).toContainText("2026-09-10 a 2026-09-10");
  await expect(dialog).toContainText("2026-09-15T15:00:00.000Z");
  await expect(
    dialog.getByRole("button", { name: "Restaurar este backup" }),
  ).toBeDisabled();
  expect(await persisted(page)).toEqual(before);
  const safety = await safetyDownload(page);
  expect(sameBackupSnapshot(safety, before)).toBe(true);
  expect(await persisted(page)).toEqual(before);
  await dialog.getByRole("button", { name: "Restaurar este backup" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Backup restaurado e verificado" }),
  ).toBeVisible();
  expect(sameBackupSnapshot(await persisted(page), backupFixture())).toBe(true);
  await expect(
    page.getByLabel("Saldo inicial (R$)", { exact: true }).first(),
  ).toHaveValue("5000");
  await page.reload();
  expect(sameBackupSnapshot(await persisted(page), backupFixture())).toBe(true);
  // The existing exporter's actual download remains readable by the v2 reader.
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar dados completos (JSON)" })
    .click();
  const path = await (await downloading).path();
  expect(
    sameBackupSnapshot(
      parseBackup(await readFile(path!, "utf8")),
      backupFixture(),
    ),
  ).toBe(true);
});

for (const action of ["Cancelar", "Fechar", "Escape"] as const) {
  test(`${action} na prévia não escreve e restaura foco`, async ({ page }) => {
    const before = await persisted(page);
    const dialog = await openRestore(page);
    await expect(
      dialog.getByRole("heading", { name: "Prévia do backup" }),
    ).toBeVisible();
    if (action === "Escape") await page.keyboard.press("Escape");
    else
      await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Restaurar backup JSON", exact: true }),
    ).toBeFocused();
    expect(await persisted(page)).toEqual(before);
    await page.reload();
    expect(await persisted(page)).toEqual(before);
  });
}

test("cancelar após download e trocar arquivo descartam apenas o draft de restore", async ({
  page,
}) => {
  const before = await persisted(page);
  const dialog = await openRestore(page);
  await safetyDownload(page);
  await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "other.json",
    mimeType: "text/plain",
    buffer: Buffer.from(
      JSON.stringify({ ...backupFixture(), transactions: [] }),
    ),
  });
  await expect(dialog).toContainText("Sem transações neste backup");
  await expect(
    dialog.getByRole("button", { name: "Restaurar este backup" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  expect(await persisted(page)).toEqual(before);
});

for (const invalid of [
  "json",
  "version",
  "reference",
  "duplicate",
  "date",
] as const) {
  test(`arquivo inválido ${invalid} nunca altera o banco`, async ({ page }) => {
    const before = await persisted(page);
    const backup = backupFixture();
    if (invalid === "reference") backup.transactions[2].accountId = "missing";
    if (invalid === "duplicate")
      backup.transactions[0].id = backup.transactions[1].id;
    if (invalid === "date") backup.transactions[0].date = "2026-02-31";
    const content =
      invalid === "json"
        ? "{"
        : JSON.stringify(
            invalid === "version" ? { ...backup, version: 3 } : backup,
          );
    const dialog = await openRestore(page, content);
    await expect(dialog.getByRole("alert")).toContainText(
      invalid === "version" ? "Versão incompatível" : "Arquivo inválido",
    );
    await expect(
      dialog.getByRole("button", { name: "Restaurar este backup" }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("button", { name: "Baixar backup de segurança" }),
    ).toBeDisabled();
    expect(await persisted(page)).toEqual(before);
  });
}

for (const failure of ["download", "read", "serialization"] as const) {
  test(`falha ${failure} na cópia de segurança bloqueia confirmação`, async ({
    page,
  }) => {
    const before = await persisted(page);
    const dialog = await openRestore(page);
    await page.evaluate((failure) => {
      if (failure === "download")
        HTMLAnchorElement.prototype.click = () => {
          throw new Error("injected-download");
        };
      if (failure === "read") {
        const get = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function (...args) {
          const request = get.apply(this, args);
          if (this.name === "settings") this.transaction.abort();
          return request;
        };
      }
      if (failure === "serialization") {
        const original = JSON.stringify;
        JSON.stringify = (value) => {
          if (value && value.version === 2)
            throw new Error("injected-serialization");
          return original(value);
        };
      }
    }, failure);
    await dialog
      .getByRole("button", { name: "Baixar backup de segurança" })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "A restauração está bloqueada",
    );
    await expect(
      dialog.getByRole("button", { name: "Restaurar este backup" }),
    ).toBeDisabled();
    await page.reload();
    expect(await persisted(page)).toEqual(before);
  });
}

test("erro do repository após clear mostra mensagem útil e mantém estado após reload", async ({
  page,
}) => {
  const before = await persisted(page);
  const dialog = await openRestore(page);
  await safetyDownload(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    let calls = 0;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "transactions" && ++calls === 2)
        throw new DOMException("injected-private-detail", "QuotaExceededError");
      return original.apply(this, args);
    };
  });
  await dialog.getByRole("button", { name: "Restaurar este backup" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "dados anteriores foram preservados",
  );
  await expect(dialog.getByRole("alert")).not.toContainText(
    "injected-private-detail",
  );
  expect(await persisted(page)).toEqual(before);
  await page.reload();
  expect(await persisted(page)).toEqual(before);
});

test("alteração entre download e confirmação exige uma nova cópia", async ({
  page,
}) => {
  const dialog = await openRestore(page);
  await safetyDownload(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("vertice-finance", 2);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("settings", "readwrite");
          const s = tx.objectStore("settings");
          const read = s.get("personal");
          read.onsuccess = () =>
            s.put({ ...read.result, plannedIncome: 444 }, "personal");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
  );
  const before = await persisted(page);
  await dialog.getByRole("button", { name: "Restaurar este backup" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Os dados mudaram");
  await expect(
    dialog.getByRole("button", { name: "Restaurar este backup" }),
  ).toBeDisabled();
  expect(await persisted(page)).toEqual(before);
});

test("divergência pós-commit é crítica e não dispara segunda escrita", async ({
  page,
}) => {
  const dialog = await openRestore(page);
  await safetyDownload(page);
  await page.evaluate(() => {
    const clear = IDBObjectStore.prototype.clear;
    const getAll = IDBObjectStore.prototype.getAll;
    let replacementStarted = false;
    IDBObjectStore.prototype.clear = function () {
      const result = clear.call(this);
      // The precondition reads were already queued before clear. The next
      // getAll belongs to verification; avoid relying on complete listener order.
      replacementStarted = true;
      return result;
    };
    IDBObjectStore.prototype.getAll = function (...args) {
      const request = getAll.apply(this, args);
      if (replacementStarted && this.name === "transactions") {
        request.addEventListener("success", () => {
          const rows = structuredClone(request.result);
          rows[0].amount += 1;
          Object.defineProperty(request, "result", { value: rows });
        });
        IDBObjectStore.prototype.getAll = getAll;
      }
      return request;
    };
  });
  await dialog.getByRole("button", { name: "Restaurar este backup" }).click();
  await expect(dialog.getByRole("alert")).toContainText("A gravação ocorreu");
  await expect(dialog.getByRole("alert")).toContainText("recuperação manual");
  await expect(
    dialog.getByRole("button", { name: "Restaurar este backup" }),
  ).toHaveCount(0);
  expect(sameBackupSnapshot(await persisted(page), backupFixture())).toBe(true);
  await page.reload();
  expect(sameBackupSnapshot(await persisted(page), backupFixture())).toBe(true);
});

test("outra aba atualiza settings após restore e o diálogo funciona em 320 px", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const other = await context.newPage();
  await other.goto("/#/configuracoes");
  await expect(
    other.getByLabel("Saldo inicial (R$)", { exact: true }).first(),
  ).toHaveValue("0");
  const dialog = await openRestore(page);
  await expect(
    dialog.getByRole("heading", { name: "Prévia do backup" }),
  ).toBeVisible();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await safetyDownload(page);
  await dialog.getByRole("button", { name: "Restaurar este backup" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    other.getByLabel("Saldo inicial (R$)", { exact: true }).first(),
  ).toHaveValue("5000");
  expect(sameBackupSnapshot(await persisted(other), backupFixture())).toBe(
    true,
  );
});
