import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { backupFixture } from "./helpers/backupFixture";
import {
  b2cBundle,
  migrateApp,
  seedLocal,
  rawDatabase,
} from "./helpers/b2cData";
let bundle: string;
test.beforeAll(async () => {
  bundle = await b2cBundle();
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
});
async function add(page: import("@playwright/test").Page, name = "B2c salvo") {
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  await page.getByLabel("Valor (R$)", { exact: true }).fill("123,45");
  await page.getByLabel("Descrição", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "Salvar transação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function exportJSON(page: import("@playwright/test").Page) {
  await page.goto("/#/configuracoes");
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Exportar dados completos (JSON)",
      exact: true,
    })
    .click();
  const d = await pending;
  return JSON.parse(await readFile((await d.path())!, "utf8"));
}
test("fresh App directly v4, save/reload/export v2, no v3 stage", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const native = indexedDB.open.bind(indexedDB);
    Object.assign(window, { versions: [] });
    indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
      (window as unknown as { versions: unknown[] }).versions.push(args[1]);
      return native(...args);
    }) as IDBFactory["open"];
  });
  await page.goto("/");
  await expect(page.locator(".welcome-panel")).toBeVisible();
  const raw = await rawDatabase(page);
  expect(raw.version).toBe(4);
  expect(raw.names).toHaveLength(5);
  expect(raw.transactions).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as unknown as { versions: unknown[] }).versions,
    ),
  ).not.toContain(3);
  await add(page);
  await page.reload();
  await expect(page.locator(".primary-metric")).toBeVisible();
  const json = await exportJSON(page);
  expect(json.version).toBe(2);
  expect(json.transactions[0].description).toBe("B2c salvo");
  expect(Object.keys(json).sort()).toEqual([
    "exportedAt",
    "settings",
    "transactions",
    "version",
  ]);
});
for (const version of [1, 2, 3])
  test(
    "App legacy " + version + " safety/confirm to4 raw+reload+writer",
    async ({ page }) => {
      const fixture = backupFixture();
      if (version === 1)
        fixture.transactions = fixture.transactions.map((row) => {
          const { accountId, categoryId, destinationAccountId, ...rest } = row;
          return {
            ...rest,
            account: accountId,
            category: categoryId,
            destinationAccount: destinationAccountId,
          } as never;
        });
      await seedLocal(page, {
        ...fixture,
        present: true,
        databaseVersion: version as 2,
        metadata: { protocol: 1, revision: 17 },
      });
      await page.goto("/");
      await expect(
        page.getByRole("heading", {
          name: "Atualização dos dados locais",
          exact: true,
        }),
      ).toBeVisible();
      expect((await rawDatabase(page)).version).toBe(3);
      expect(await page.locator(".primary-metric").count()).toBe(0);
      const before = await rawDatabase(page);
      const updating = page.getByRole("button", {
        name: "Atualizar dados locais",
        exact: true,
      });
      await expect(updating).toBeDisabled();
      await migrateApp(page);
      const after = await rawDatabase(page);
      expect(after.transactions).toEqual(before.transactions);
      expect(after.settings).toEqual(before.settings);
      expect(
        (after.scopedTransactions as { record: unknown }[]).map(
          (x) => x.record,
        ),
      ).toEqual(before.transactions);
      await add(page);
      await page.reload();
      expect((await rawDatabase(page)).version).toBe(4);
    },
  );
test("cancel without download never promotes; retry needs new confirmation", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const before = await rawDatabase(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Cancelar atualização", exact: true })
    .click();
  expect(await rawDatabase(page)).toEqual(before);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Atualizar dados locais", exact: true }),
  ).toBeDisabled();
  await migrateApp(page);
});
for (const failure of ["blob", "url", "click"])
  test(
    "migration download " + failure + " does not authorize",
    async ({ page }) => {
      await seedLocal(page, { ...backupFixture(), present: true });
      await page.goto("/");
      await expect(
        page.getByRole("heading", {
          name: "Atualização dos dados locais",
          exact: true,
        }),
      ).toBeVisible();
      await page.evaluate((f) => {
        if (f === "blob")
          Object.assign(window, {
            Blob: class {
              constructor() {
                throw Error("blob");
              }
            },
          });
        if (f === "url")
          URL.createObjectURL = () => {
            throw Error("url");
          };
        if (f === "click")
          HTMLAnchorElement.prototype.click = () => {
            throw Error("click");
          };
      }, failure);
      await page
        .getByRole("button", { name: "Baixar cópia de segurança", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText("bloqueada");
      await expect(
        page.getByRole("button", {
          name: "Atualizar dados locais",
          exact: true,
        }),
      ).toBeDisabled();
      expect((await rawDatabase(page)).version).toBe(3);
    },
  );
test("blocked App cancels late promotion; new preflight works", async ({
  page,
  context,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open("vertice-finance", 3);
        r.onsuccess = () => {
          window.blocker = r.result;
          window.blocker.onversionchange = () => {};
          resolve();
        };
      }),
  );
  await page.goto("/");
  const d = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar cópia de segurança", exact: true })
    .click();
  await d;
  await page.getByLabel("Confirmei que guardei a cópia de segurança").check();
  await page
    .getByRole("button", { name: "Atualizar dados locais", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("bloqueando");
  await other.evaluate(() => window.blocker.close());
  expect((await rawDatabase(page)).version).toBe(3);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await migrateApp(page);
});
test("stale safety from legacy write requires a new backup", async ({
  page,
  context,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  await page.goto("/");
  const d = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar cópia de segurança", exact: true })
    .click();
  await d;
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate((code) => (0, eval)(code), bundle);
  await other.evaluate(async () => {
    const a = window.b2cAudit,
      r = await a.transactionRepository.load();
    await a.transactionRepository.save(
      a.transaction({ id: "confirmed-after-safety" }),
      { kind: "create", expectedRevision: r.revision },
    );
    await a.closeLocalDatabaseForMigration?.();
  });
  await page.getByLabel("Confirmei que guardei a cópia de segurança").check();
  await page
    .getByRole("button", { name: "Atualizar dados locais", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("mudaram");
  expect((await rawDatabase(page)).version).toBe(3);
  await page
    .getByRole("button", { name: "Tentar novamente", exact: true })
    .click();
  await migrateApp(page);
  expect((await rawDatabase(page)).transactions).toHaveLength(4);
});
for (const corrupt of [
  "authority",
  "workspace",
  "settings",
  "index",
  "store",
  "future",
])
  test(
    "App invalid4 " + corrupt + " no dashboard/fallback/default",
    async ({ page }) => {
      await page.evaluate((code) => (0, eval)(code), bundle);
      await page.evaluate(async (corrupt) => {
        const a = window.b2cAudit,
          e = a.createScopedStorage(),
          m = await e.open(await e.preflight());
        const tx = e.scopedTransaction("readwrite");
        const done = a.transactionCompletion(tx).done;
        if (corrupt === "authority")
          tx.objectStore("workspaceMeta").put({}, "authority");
        if (corrupt === "workspace")
          tx.objectStore("workspaceMeta").delete(
            a.workspaceMetadataKey(m.defaultWorkspaceId),
          );
        if (corrupt === "settings")
          tx.objectStore("scopedSettings").delete(m.defaultWorkspaceId);
        await done;
        e.close();
        if (corrupt === "index" || corrupt === "store") {
          const r = indexedDB.open("vertice-finance", 5);
          await new Promise<void>((resolve, reject) => {
            r.onupgradeneeded = () => {
              if (corrupt === "store")
                r.result.deleteObjectStore("scopedSettings");
              else
                r.transaction!.objectStore("scopedTransactions").deleteIndex(
                  "byWorkspace",
                );
            };
            r.onsuccess = () => {
              r.result.close();
              resolve();
            };
            r.onerror = () => reject(r.error);
          });
        }
        if (corrupt === "future") {
          const r = indexedDB.open("vertice-finance", 5);
          await new Promise<void>((resolve) => {
            r.onsuccess = () => {
              r.result.close();
              resolve();
            };
          });
        }
      }, corrupt);
      const before = await rawDatabase(page);
      await page.goto("/");
      await expect(page.getByRole("alert")).toBeVisible();
      expect(
        await page
          .locator(".welcome-panel,.primary-metric,.transaction-table")
          .count(),
      ).toBe(0);
      expect(await rawDatabase(page)).toEqual(before);
    },
  );
test("MAX App readonly financial snapshot/export; no structural recovery", async ({
  page,
}) => {
  const fixture = backupFixture();
  fixture.transactions[0].source = "demo";
  await seedLocal(page, {
    ...fixture,
    present: true,
    metadata: { protocol: 1, revision: Number.MAX_SAFE_INTEGER },
  });
  await page.goto("/");
  await migrateApp(page);
  await expect(
    page.getByText("A revisão local atingiu seu limite.", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Adicionar transação", exact: true })
      .filter({ visible: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Remover demonstração", exact: true }),
  ).toBeDisabled();
  await page.goto("/#/transacoes");
  await expect(
    page.getByRole("button", { name: "Importar", exact: true }),
  ).toBeDisabled();
  for (const button of await page
    .getByRole("button", { name: /^(Editar |Excluir )/ })
    .all())
    await expect(button).toBeDisabled();
  const before = await rawDatabase(page);
  const json = await exportJSON(page);
  expect(json.transactions).toHaveLength(3);
  await expect(
    page.getByRole("button", { name: "Salvar configurações", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Restaurar backup JSON", exact: true }),
  ).toBeDisabled();
  expect(await rawDatabase(page)).toEqual(before);
  expect(await page.getByLabel("Inicialização dos dados locais").count()).toBe(
    0,
  );
});
test("two App tabs same Personal, scoped broadcast; no BC writer still safe", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".welcome-panel")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".welcome-panel")).toBeVisible();
  await add(page);
  await expect(other.locator(".primary-metric")).toBeVisible();
  await other.reload();
  expect((await rawDatabase(other)).workspaceMeta).toEqual(
    (await rawDatabase(page)).workspaceMeta,
  );
});
test("real App import CSV scoped and restore/export roundtrip", async ({
  page,
}) => {
  await page.goto("/#/transacoes");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "b2c.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Data;Valor;Descrição\n10/09/2026;-25,00;Import B2c"),
  });
  await page
    .getByRole("button", { name: "Importar 1 transações", exact: true })
    .click();
  await expect(
    page.getByText("1 transações importadas.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  const json = await exportJSON(page);
  expect(json.transactions[0].source).toBe("import");
  await page
    .getByRole("button", { name: "Restaurar backup JSON", exact: true })
    .click();
  await page.getByLabel("Arquivo de backup JSON v2").setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(json)),
  });
  const d = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar backup de segurança", exact: true })
    .click();
  await d;
  await page
    .getByRole("button", { name: "Restaurar este backup", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  expect((await exportJSON(page)).transactions).toEqual(json.transactions);
});

for (const corrupt of ["index4", "store4"])
  test(
    "committed v4 " + corrupt + " is invalid-layout without repair",
    async ({ page }) => {
      await page.evaluate((code) => (0, eval)(code), bundle);
      await page.evaluate(
        (c) =>
          new Promise<void>((resolve, reject) => {
            const a = window.b2cAudit,
              r = indexedDB.open("vertice-finance", 4),
              id = a.workspaceId("11111111-1111-4111-8111-111111111111");
            r.onupgradeneeded = () => {
              const db = r.result;
              db.createObjectStore("transactions", { keyPath: "id" });
              db.createObjectStore("settings");
              const facts = db.createObjectStore("scopedTransactions", {
                keyPath: ["workspaceId", "record.id"],
              });
              if (c !== "index4")
                facts.createIndex("byWorkspace", "workspaceId");
              if (c !== "store4") {
                const settings = db.createObjectStore("scopedSettings", {
                  keyPath: "workspaceId",
                });
                settings.add({ workspaceId: id, record: a.defaultSettings() });
              }
              const m = db.createObjectStore("workspaceMeta");
              m.add(
                {
                  layout: "scoped",
                  protocol: 1,
                  defaultWorkspaceId: id,
                  sourceVersion: 0,
                },
                "authority",
              );
              m.add({ workspaceId: id, mode: "personal", revision: 0 }, [
                "workspace",
                id,
              ]);
            };
            r.onsuccess = () => {
              r.result.close();
              resolve();
            };
            r.onerror = () => reject(r.error);
          }),
        corrupt,
      );
      const before = await rawDatabase(page);
      await page.goto("/");
      await expect(page.getByRole("alert")).toContainText("invalid-layout");
      expect(await page.locator(".welcome-panel,.primary-metric").count()).toBe(
        0,
      );
      expect(await rawDatabase(page)).toEqual(before);
    },
  );
test("App BC disabled still performs scoped writes/CAS and reads on focus", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(window, "BroadcastChannel", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".welcome-panel")).toBeVisible();
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".welcome-panel")).toBeVisible();
  await add(page);
  await expect(other.locator(".welcome-panel")).toBeVisible();
  await other.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(other.locator(".primary-metric")).toBeVisible();
  await add(other, "Sem BC");
  expect((await rawDatabase(page)).scopedTransactions).toHaveLength(2);
});
test("pending CSV parse invalidated by native versionchange preserves readonly draft and cannot write", async ({
  page,
  context,
}) => {
  await page.goto("/#/transacoes");
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      const value = await original.call(this);
      await new Promise<void>((resolve) => {
        Object.assign(window, { releaseImport: resolve });
      });
      return value;
    };
  });
  await page.getByLabel("Arquivo", { exact: true }).setInputFiles({
    name: "late.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Data;Valor;Descrição\n10/09/2026;-25;Late CSV"),
  });
  await expect(page.getByText("Processando sua planilha…")).toBeVisible();
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { releaseImport: unknown }).releaseImport ===
      "function",
  );
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("vertice-finance", 5);
        r.onsuccess = () => {
          r.result.close();
          resolve();
        };
        r.onerror = () => reject(r.error);
      }),
  );
  await expect(
    page.getByRole("textbox", { name: "Conteúdo não salvo: Importação" }),
  ).toContainText("late.csv");
  const before = await rawDatabase(other);
  await page.evaluate(() =>
    (window as unknown as { releaseImport: () => void }).releaseImport(),
  );
  await expect(
    page.getByRole("textbox", { name: "Conteúdo não salvo: Importação" }),
  ).toHaveAttribute("readonly", "");
  expect(
    await page
      .getByRole("button", { name: "Importar 1 transações", exact: true })
      .count(),
  ).toBe(0);
  expect(await rawDatabase(other)).toEqual(before);
});
test("two legacy App tabs converge on one committed UUID, other follows with explicit retry", async ({
  page,
  context,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  await page.goto("/");
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("heading", {
      name: "Atualização dos dados locais",
      exact: true,
    }),
  ).toBeVisible();
  await migrateApp(page);
  await other.reload();
  await expect(other.locator(".primary-metric")).toBeVisible();
  expect((await rawDatabase(other)).workspaceMeta).toEqual(
    (await rawDatabase(page)).workspaceMeta,
  );
});

for (const point of ["during-copy", "after-commit"])
  test(
    "App promotion " + point + " page teardown retains SAME origin base",
    async ({ page, context }) => {
      await seedLocal(page, { ...backupFixture(), present: true });
      const before = await rawDatabase(page);
      await page.goto("/");
      const d = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Baixar cópia de segurança", exact: true })
        .click();
      await d;
      await page
        .getByLabel("Confirmei que guardei a cópia de segurança")
        .check();
      if (point === "during-copy")
        await page.evaluate(() => {
          const add = IDBObjectStore.prototype.add;
          let held = false;
          IDBObjectStore.prototype.add = function (...args) {
            const r = add.apply(this, args);
            if (this.name === "scopedTransactions" && !held) {
              held = true;
              const tx = this.transaction;
              r.addEventListener("success", () => {
                document.documentElement.setAttribute("data-copy-held", "true");
                const keep = () => {
                  const q = tx.objectStore("settings").get("personal");
                  q.onsuccess = keep;
                };
                keep();
              });
            }
            return r;
          };
        });
      await page
        .getByRole("button", { name: "Atualizar dados locais", exact: true })
        .click();
      if (point === "during-copy")
        await page.waitForFunction(
          () =>
            document.documentElement.getAttribute("data-copy-held") === "true",
        );
      else await expect(page.locator(".primary-metric")).toBeVisible();
      await page.close();
      const reopened = await context.newPage();
      await reopened.goto("/favicon.svg");
      const after = await rawDatabase(reopened);
      expect(after.transactions).toEqual(before.transactions);
      expect(after.settings).toEqual(before.settings);
      expect(after.version).toBe(point === "during-copy" ? 3 : 4);
      await reopened.goto("/");
      if (point === "during-copy") await migrateApp(reopened);
      await expect(reopened.locator(".primary-metric")).toBeVisible();
      expect((await rawDatabase(reopened)).version).toBe(4);
    },
  );
test("App cancel with queued native open never promotes on late release", async ({
  page,
  context,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open("vertice-finance", 3);
        r.onsuccess = () => {
          window.blocker = r.result;
          window.blocker.onversionchange = () => {};
          resolve();
        };
      }),
  );
  await page.goto("/");
  const d = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar cópia de segurança", exact: true })
    .click();
  await d;
  await page.getByLabel("Confirmei que guardei a cópia de segurança").check();
  await page
    .getByRole("button", { name: "Atualizar dados locais", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("bloqueando");
  await other.evaluate(() => window.blocker.close());
  await page.waitForTimeout(200);
  expect((await rawDatabase(page)).version).toBe(3);
});

test("real browser coordinator dirty guard requires a new safety after resolving work", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  await page.evaluate((code) => (0, eval)(code), bundle);
  const result = await page.evaluate(async () => {
    const a = window.b2cAudit,
      boot = a.createStorageBootstrap(),
      lease = {};
    a.workRegistry.register("synthetic-draft", lease, "editor", {
      busy: false,
      hasUnsavedWork: true,
      invalidated: false,
    });
    await boot.start();
    const blocked = boot.getState().status;
    a.workRegistry.remove("synthetic-draft", lease);
    await boot.start();
    boot.downloadSafety(() => {});
    a.workRegistry.register("synthetic-draft", lease, "editor", {
      busy: false,
      hasUnsavedWork: true,
      invalidated: false,
    });
    await boot.promote(true);
    const dirty = boot.getState().status;
    a.workRegistry.remove("synthetic-draft", lease);
    await boot.start();
    await boot.promote(true);
    const oldConsent = boot.getState().status;
    boot.dispose();
    return { blocked, dirty, oldConsent };
  });
  expect(result).toEqual({
    blocked: "recovery",
    dirty: "recovery",
    oldConsent: "recovery",
  });
  expect((await rawDatabase(page)).version).toBe(3);
  await page.goto("/");
  await migrateApp(page);
});
test("BC disabled external restore invalidates an actual editor draft on focus", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(window, "BroadcastChannel", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/");
  await expect(page.locator(".welcome-panel")).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar transação", exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Draft preservado sem BC");
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate((code) => (0, eval)(code), bundle);
  await other.evaluate(async () => {
    const a = window.b2cAudit,
      e = a.createScopedStorage(),
      m = await e.open(),
      r = a.bindWorkspaceRepository(
        e,
        a.createScopedHandle(m.defaultWorkspaceId),
      ),
      s = await r.readForBackup();
    await r.restore(s.snapshot, s);
    r.handle.dispose();
    e.close();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("textbox", { name: "Conteúdo não salvo: Transação" }),
  ).toContainText("Draft preservado sem BC");
  await expect(
    page.getByRole("textbox", { name: "Conteúdo não salvo: Transação" }),
  ).toHaveAttribute("readonly", "");
  expect(
    await page
      .getByRole("button", { name: "Salvar transação", exact: true })
      .count(),
  ).toBe(0);
});

test("captured scoped JSON export reports download failure without writing", async ({
  page,
}) => {
  await page.goto("/#/configuracoes");
  await expect(
    page.getByRole("button", {
      name: "Exportar dados completos (JSON)",
      exact: true,
    }),
  ).toBeVisible();
  const before = await rawDatabase(page);
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw Error("synthetic download failure");
    };
  });
  await page
    .getByRole("button", {
      name: "Exportar dados completos (JSON)",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível preparar ou iniciar o download",
  );
  expect(await rawDatabase(page)).toEqual(before);
});
