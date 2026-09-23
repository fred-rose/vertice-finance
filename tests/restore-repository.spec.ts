import { expect, test } from "@playwright/test";
import { build } from "vite";
import { fileURLToPath } from "node:url";

declare global {
  interface Window {
    financeAudit: typeof import("./helpers/repositoryHarness");
  }
}
let bundle: string;
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL("./helpers/repositoryHarness.ts", import.meta.url),
        ),
        name: "financeAudit",
        formats: ["iife"],
      },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  if (!("output" in output)) throw new Error("Bundle indisponível");
  const chunk = output.output.find((item) => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("Bundle indisponível");
  bundle = chunk.code;
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
  await page.evaluate((code) => (0, eval)(code), bundle);
});

test("restore completo, equivalência financeira, IDs, metadados e reload", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      transaction,
      backupFixture,
      sameBackupSnapshot,
      accountBalance,
      summarize,
    } = window.financeAudit;
    await r.save(transaction({ id: "old" }));
    const backup = backupFixture();
    Object.assign(backup.transactions[0], { metadata: { preserved: true } });
    const restored = await r.restore(backup, await r.readForBackup());
    return {
      restored,
      equal: sameBackupSnapshot(backup, restored),
      balances: restored.settings.accounts.map((a) =>
        accountBalance(a, restored.transactions, "2026-09-15"),
      ),
      summary: summarize(restored.transactions),
    };
  });
  expect(result.equal).toBe(true);
  expect(result.balances).toEqual([5500, 3000]);
  expect(result.summary).toMatchObject({
    income: 2000,
    expenses: 500,
    balance: 1500,
  });
  await page.reload();
  await page.evaluate((code) => (0, eval)(code), bundle);
  expect(
    await page.evaluate(() => window.financeAudit.transactionRepository.load()),
  ).toEqual(result.restored);
});

test("snapshot equivalente pode ser restaurado duas vezes sem duplicar", async ({
  page,
}) => {
  expect(
    await page.evaluate(async () => {
      const {
        transactionRepository: r,
        backupFixture,
        sameBackupSnapshot,
      } = window.financeAudit;
      const backup = backupFixture();
      await r.restore(backup, await r.readForBackup());
      const before = await r.readForBackup();
      const after = await r.restore(backup, before);
      return (
        sameBackupSnapshot(before, after) && after.transactions.length === 3
      );
    }),
  ).toBe(true);
});

test("restaura snapshot vazio junto das configurações", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      backupFixture,
      transaction,
    } = window.financeAudit;
    await r.save(transaction());
    const backup = backupFixture();
    backup.transactions = [];
    return r.restore(backup, await r.readForBackup());
  });
  expect(result.transactions).toEqual([]);
  expect(result.settings.goals).toHaveLength(1);
});

test("datas futuras sobrevivem à releitura e reload; criação continua rejeitando futuro", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { transactionRepository: r, backupFixture } = window.financeAudit;
    const backup = backupFixture();
    backup.transactions[0].date = "2099-12-31";
    backup.settings.accounts[0].initialBalanceDate = "2099-01-01";
    const restored = await r.restore(backup, await r.readForBackup());
    let blocked = false;
    try {
      await r.save(backup.transactions[0]);
    } catch {
      blocked = true;
    }
    return { restored, blocked };
  });
  expect(result.blocked).toBe(true);
  await page.reload();
  await page.evaluate((code) => (0, eval)(code), bundle);
  expect(
    await page.evaluate(() => window.financeAudit.transactionRepository.load()),
  ).toEqual(result.restored);
});

for (const failure of [
  "before-clear",
  "sync-error",
  "quota",
  "constraint",
  "abort",
  "settings",
] as const) {
  test(`rollback integral e reload após falha ${failure}`, async ({ page }) => {
    const result = await page.evaluate(async (failure) => {
      const {
        transactionRepository: r,
        transaction,
        backupFixture,
        RestoreError,
      } = window.financeAudit;
      await r.save(transaction({ id: "previous" }));
      const before = await r.readForBackup();
      const clear = IDBObjectStore.prototype.clear;
      const add = IDBObjectStore.prototype.add;
      const put = IDBObjectStore.prototype.put;
      let calls = 0,
        phase = "",
        cause = "";
      IDBObjectStore.prototype.clear = function () {
        if (this.name === "transactions" && failure === "before-clear")
          throw new Error("injected-before-write");
        return clear.call(this);
      };
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name !== "transactions") return add.apply(this, args);
        calls++;
        if (calls === 2) {
          if (failure === "sync-error") throw new Error("injected-mid-write");
          if (failure === "quota")
            throw new DOMException("injected-quota", "QuotaExceededError");
          if (failure === "constraint")
            args[0] = { ...args[0], id: "z-income" };
        }
        const request = add.apply(this, args);
        if (calls === 2 && failure === "abort") this.transaction.abort();
        return request;
      };
      IDBObjectStore.prototype.put = function (...args) {
        if (this.name === "settings" && failure === "settings")
          throw new DOMException("injected-settings", "QuotaExceededError");
        return put.apply(this, args);
      };
      try {
        await r.restore(backupFixture(), before);
      } catch (e) {
        phase = e instanceof RestoreError ? e.phase : "unexpected";
        cause = ((e as Error).cause as Error)?.name;
      } finally {
        IDBObjectStore.prototype.clear = clear;
        IDBObjectStore.prototype.add = add;
        IDBObjectStore.prototype.put = put;
      }
      return { before, after: await r.load(), phase, cause, calls };
    }, failure);
    expect(result.phase).toBe("write");
    expect(result.after).toEqual(result.before);
    if (failure !== "before-clear")
      expect(result.calls).toBeGreaterThanOrEqual(2);
    await page.reload();
    await page.evaluate((code) => (0, eval)(code), bundle);
    expect(
      await page.evaluate(() =>
        window.financeAudit.transactionRepository.load(),
      ),
    ).toEqual(result.before);
  });
}

test("snapshot inválido e exceção síncrona na preparação nunca limpam stores", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      transaction,
      backupFixture,
      RestoreError,
    } = window.financeAudit;
    await r.save(transaction({ id: "preserved" }));
    const before = await r.readForBackup();
    const invalid = backupFixture();
    invalid.transactions[0].accountId = "missing";
    const clear = IDBObjectStore.prototype.clear;
    let writes = 0;
    IDBObjectStore.prototype.clear = function () {
      writes++;
      return clear.call(this);
    };
    const phases = [];
    try {
      try {
        await r.restore(invalid, before);
      } catch (e) {
        phases.push((e as InstanceType<typeof RestoreError>).phase);
      }
      const clone = window.structuredClone;
      window.structuredClone = () => {
        throw new Error("injected-preparation");
      };
      try {
        await r.restore(backupFixture(), before);
      } catch (e) {
        phases.push((e as InstanceType<typeof RestoreError>).phase);
      } finally {
        window.structuredClone = clone;
      }
    } finally {
      IDBObjectStore.prototype.clear = clear;
    }
    return { phases, writes, before, after: await r.load() };
  });
  expect(result.phases).toEqual(["prepare", "prepare"]);
  expect(result.writes).toBe(0);
  expect(result.after).toEqual(result.before);
});

test("mudança após cópia de segurança bloqueia substituição dentro da transação", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      transaction,
      backupFixture,
      RestoreError,
    } = window.financeAudit;
    const safety = await r.readForBackup();
    await r.save(transaction({ id: "after-download" }));
    const before = await r.load();
    let phase = "";
    try {
      await r.restore(backupFixture(), safety);
    } catch (e) {
      phase = (e as InstanceType<typeof RestoreError>).phase;
    }
    return { phase, before, after: await r.load() };
  });
  expect(result.phase).toBe("changed");
  expect(result.after).toEqual(result.before);
});

for (const failure of ["mismatch", "read-error"] as const) {
  test(`verificação pós-commit ${failure}: detecta sem segunda escrita`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (failure) => {
      const {
        transactionRepository: r,
        transaction,
        backupFixture,
        sameBackupSnapshot,
        RestoreError,
      } = window.financeAudit;
      await r.save(transaction({ id: "old" }));
      const safety = await r.readForBackup();
      const originalRead = r.readForBackup;
      const clear = IDBObjectStore.prototype.clear;
      let writes = 0,
        phase = "";
      IDBObjectStore.prototype.clear = function () {
        writes++;
        return clear.call(this);
      };
      r.readForBackup = async () => {
        if (failure === "read-error") throw new Error("injected-read");
        const persisted = await originalRead();
        persisted.transactions[0].amount += 1;
        return persisted;
      };
      const backup = backupFixture();
      try {
        await r.restore(backup, safety);
      } catch (e) {
        phase = (e as InstanceType<typeof RestoreError>).phase;
      } finally {
        r.readForBackup = originalRead;
        IDBObjectStore.prototype.clear = clear;
      }
      const persisted = await r.load();
      return {
        phase,
        writes,
        persisted,
        complete: sameBackupSnapshot(backup, persisted),
      };
    }, failure);
    expect(result.phase).toBe("verify");
    expect(result.writes).toBe(1);
    expect(result.complete).toBe(true);
    await page.reload();
    await page.evaluate((code) => (0, eval)(code), bundle);
    expect(
      await page.evaluate(() =>
        window.financeAudit.transactionRepository.load(),
      ),
    ).toEqual(result.persisted);
  });
}

for (const missing of [true, false]) {
  test(`base parcialmente inválida (${missing ? "settings ausente" : "settings inválido"}) bloqueia backup e restore sem piorar estado`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (missing) => {
      const {
        transactionRepository: r,
        transaction,
        backupFixture,
      } = window.financeAudit;
      await r.save(transaction({ id: "preserved" }));
      const safety = await r.readForBackup();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("vertice-finance", 2);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("settings", "readwrite");
        const s = tx.objectStore("settings");
        if (missing) s.delete("personal");
        else s.put({}, "personal");
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      let backupBlocked = false,
        restoreBlocked = false;
      try {
        await r.readForBackup();
      } catch {
        backupBlocked = true;
      }
      try {
        await r.restore(backupFixture(), safety);
      } catch {
        restoreBlocked = true;
      }
      const raw = await new Promise((resolve, reject) => {
        const tx = db.transaction(["settings", "transactions"]);
        const settings = tx.objectStore("settings").get("personal");
        const rows = tx.objectStore("transactions").getAll();
        tx.oncomplete = () =>
          resolve({
            settings: settings.result ?? null,
            ids: rows.result.map((r: { id: string }) => r.id),
          });
        tx.onabort = () => reject(tx.error);
      });
      db.close();
      return { backupBlocked, restoreBlocked, raw };
    }, missing);
    expect(result.backupBlocked).toBe(true);
    expect(result.restoreBlocked).toBe(true);
    expect(result.raw).toEqual({
      settings: missing ? null : {},
      ids: ["preserved"],
    });
  });
}
