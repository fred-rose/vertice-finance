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

for (const fault of [
  "none",
  "sync-1",
  "sync-2",
  "sync-3",
  "sync-settings",
  "abort-1",
  "abort-2",
  "abort-3",
  "abort-settings",
  "constraint",
] as const) {
  test(`lifecycle observado: ${fault}`, async ({ page }, testInfo) => {
    const result = await page.evaluate(async (fault) => {
      const {
        transactionRepository: r,
        transaction,
        backupFixture,
      } = window.financeAudit;
      await r.save(transaction({ id: "previous" }), {
        kind: "create",
        expectedRevision: 0,
      });
      const before = await r.readForBackup();
      const events: string[] = [];
      const nativeTransaction = IDBDatabase.prototype.transaction;
      const nativeClear = IDBObjectStore.prototype.clear;
      const nativeAdd = IDBObjectStore.prototype.add;
      const nativePut = IDBObjectStore.prototype.put;
      const nativeGet = IDBObjectStore.prototype.get;
      const nativeGetAll = IDBObjectStore.prototype.getAll;
      let restoreTx: IDBTransaction | undefined;
      let adds = 0;
      let phase = "";
      let cause = "";
      let stores: string[] = [];
      let mode = "";
      IDBDatabase.prototype.transaction = function (
        ...args: Parameters<typeof nativeTransaction>
      ) {
        const tx = nativeTransaction.apply(this, args);
        if (args[1] === "readwrite" && !restoreTx) {
          restoreTx = tx;
          stores = Array.from(tx.objectStoreNames);
          mode = tx.mode;
          events.push("created");
          tx.addEventListener("complete", () => events.push("complete"));
          tx.addEventListener("error", (e) =>
            events.push(`error:${(e.target as IDBRequest).error?.name}`),
          );
          tx.addEventListener("abort", () => events.push("abort"));
        }
        return tx;
      };
      const observe = (
        store: IDBObjectStore,
        label: string,
        request: IDBRequest,
      ) => {
        if (store.transaction !== restoreTx)
          throw new Error("different transaction");
        events.push(`queued:${label}`);
        request.addEventListener("success", () => {
          events.push(`success:${label}`);
          if (fault === `abort-${label.replace("add-", "")}`)
            store.transaction.abort();
        });
        return request;
      };
      IDBObjectStore.prototype.getAll = function (...args) {
        const request = nativeGetAll.apply(this, args);
        if (this.transaction === restoreTx) observe(this, "rows", request);
        return request;
      };
      IDBObjectStore.prototype.get = function (...args) {
        const request = nativeGet.apply(this, args);
        if (this.transaction === restoreTx)
          observe(
            this,
            args[0] === "personal" ? "config" : "metadata",
            request,
          );
        return request;
      };
      IDBObjectStore.prototype.clear = function () {
        return observe(this, "clear", nativeClear.call(this));
      };
      IDBObjectStore.prototype.add = function (...args) {
        adds++;
        if (fault === `sync-${adds}`) throw new Error(`sync-${adds}`);
        if (fault === "constraint" && adds === 2)
          args[0] = { ...args[0], id: "z-income" };
        return observe(this, `add-${adds}`, nativeAdd.apply(this, args));
      };
      IDBObjectStore.prototype.put = function (...args) {
        if (fault === "sync-settings") throw new Error("sync-settings");
        return observe(
          this,
          args[1] === "personal" ? "settings" : "revision",
          nativePut.apply(this, args),
        );
      };
      try {
        await r.restore(backupFixture(), before).then(
          () => events.push("resolve"),
          (error) => {
            phase = error.phase;
            cause = error.cause?.cause?.name ?? error.cause?.message;
            events.push("reject");
          },
        );
      } finally {
        IDBDatabase.prototype.transaction = nativeTransaction;
        IDBObjectStore.prototype.clear = nativeClear;
        IDBObjectStore.prototype.add = nativeAdd;
        IDBObjectStore.prototype.put = nativePut;
        IDBObjectStore.prototype.get = nativeGet;
        IDBObjectStore.prototype.getAll = nativeGetAll;
      }
      return {
        events,
        stores,
        mode,
        phase,
        cause,
        before,
        after: await r.readForBackup(),
      };
    }, fault);
    await testInfo.attach("lifecycle", {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });
    expect(result.stores).toEqual(["settings", "transactions"]);
    expect(result.mode).toBe("readwrite");
    expect(result.events.slice(0, 7)).toEqual([
      "created",
      "queued:rows",
      "queued:config",
      "queued:metadata",
      "success:rows",
      "success:config",
      "success:metadata",
    ]);
    if (fault === "none") {
      expect(result.events).toEqual([
        "created",
        "queued:rows",
        "queued:config",
        "queued:metadata",
        "success:rows",
        "success:config",
        "success:metadata",
        "queued:clear",
        "queued:add-1",
        "queued:add-2",
        "queued:add-3",
        "queued:settings",
        "queued:revision",
        "success:clear",
        "success:add-1",
        "success:add-2",
        "success:add-3",
        "success:settings",
        "success:revision",
        "complete",
        "resolve",
      ]);
    } else {
      expect(result.phase).toBe("write");
      expect(result.events.slice(-2)).toEqual(["abort", "reject"]);
      expect(result.events).not.toContain("complete");
      if (fault.startsWith("abort") || fault === "constraint")
        expect(result.events).toContain("success:clear");
      if (fault === "constraint") {
        expect(result.events).toContain("error:ConstraintError");
        expect(result.cause).toBe("ConstraintError");
      }
      expect(result.after).toEqual(result.before);
      await page.reload();
      await page.evaluate((code) => (0, eval)(code), bundle);
      expect(
        await page.evaluate(() =>
          window.financeAudit.transactionRepository.readForBackup(),
        ),
      ).toEqual(result.before);
    }
  });
}

test("autocommit: await externo perde a transaction", async ({
  page,
}, testInfo) => {
  const result = await page.evaluate(async () => {
    const { transactionRepository: r, transaction } = window.financeAudit;
    await r.save(transaction({ id: "before" }), {
      kind: "create",
      expectedRevision: 0,
    });
    const request = indexedDB.open("vertice-finance", 3);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    const events: string[] = [];
    const tx = db.transaction("transactions", "readwrite");
    const store = tx.objectStore("transactions");
    const committed = new Promise<void>((resolve) => {
      tx.oncomplete = () => {
        events.push("complete");
        resolve();
      };
    });
    store.clear();
    // Controlled mutation in an isolated experiment, never in production.
    await committed;
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      store.add(transaction({ id: "after" }));
    } catch (e) {
      events.push((e as Error).name);
    }
    db.close();
    return { events, rows: (await r.readForBackup()).snapshot.transactions };
  });
  await testInfo.attach("autocommit", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect(result.events).toEqual(["complete", "TransactionInactiveError"]);
  expect(result.rows).toEqual([]);
});

test("regressão: verificação não pode fabricar settings ausentes após commit", async ({
  page,
}, testInfo) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      transaction,
      defaultSettings,
    } = window.financeAudit;
    await r.save(transaction({ id: "previous" }), {
      kind: "create",
      expectedRevision: 0,
    });
    const before = await r.readForBackup();
    const open = indexedDB.open("vertice-finance", 3);
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const nativePut = IDBObjectStore.prototype.put;
    const events: string[] = [];
    let removed!: Promise<void>;
    IDBObjectStore.prototype.put = function (...args) {
      const request = nativePut.apply(this, args);
      if (this.name === "settings" && args[1] === "personal") {
        this.transaction.addEventListener("complete", () =>
          events.push("restore-complete"),
        );
        // A second real connection queues this write behind restore and before load.
        const writer = db.transaction("settings", "readwrite");
        writer.objectStore("settings").delete("personal");
        removed = new Promise<void>((resolve) => {
          writer.oncomplete = () => {
            events.push("settings-deleted");
            resolve();
          };
        });
      }
      return request;
    };
    let phase = "resolved";
    try {
      await r.restore(
        {
          settings: defaultSettings(),
          transactions: [transaction({ id: "restored" })],
        },
        before,
      );
      events.push("public-resolved");
    } catch (e) {
      phase = (e as { phase: string }).phase;
    } finally {
      IDBObjectStore.prototype.put = nativePut;
    }
    await removed;
    const raw = await new Promise<unknown>((resolve) => {
      const tx = db.transaction("settings");
      const get = tx.objectStore("settings").get("personal");
      tx.oncomplete = () => resolve(get.result ?? null);
    });
    db.close();
    let safetyBlocked = false;
    try {
      await r.readForBackup();
    } catch {
      safetyBlocked = true;
    }
    return { phase, events, raw, safetyBlocked };
  });
  await testInfo.attach("missing-settings", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect(result.raw).toBeNull();
  expect(result.safetyBlocked).toBe(true);
  expect(result.phase, JSON.stringify(result)).toBe("verify");
});

test("regressão: JSON com overflow em campo adicional deve falhar antes de substituir", async ({
  page,
}, testInfo) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      backupFixture,
      parseBackup,
      serializeBackup,
    } = window.financeAudit;
    const before = await r.readForBackup();
    const json = JSON.stringify(backupFixture()).replace(
      '"plannedIncome":3000',
      '"metadata":{"external":1e400},"plannedIncome":3000',
    );
    let accepted = false;
    let exportable = false;
    try {
      const parsed = parseBackup(json);
      await r.restore(parsed, before);
      accepted = true;
      try {
        serializeBackup((await r.readForBackup()).snapshot);
        exportable = true;
      } catch {
        /* Capture recovery failure. */
      }
    } catch {
      /* Expected structural rejection. */
    }
    return { accepted, exportable };
  });
  await testInfo.attach("numeric-overflow", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect(result.accepted, JSON.stringify(result)).toBe(false);
});

for (const token of ["1e400", "-1e400"]) {
  test(`amount ${token} é rejeitado antes de abrir transaction ou limpar dados`, async ({
    page,
  }) => {
    const result = await page.evaluate(async (token) => {
      const {
        transactionRepository: r,
        transaction,
        backupFixture,
        parseBackup,
      } = window.financeAudit;
      await r.save(transaction({ id: "preserved" }), {
        kind: "create",
        expectedRevision: 0,
      });
      const before = await r.readForBackup();
      const json = JSON.stringify(backupFixture()).replace(
        '"amount":2000',
        `"amount":${token}`,
      );
      const injected = !Number.isFinite(
        JSON.parse(json).transactions[0].amount,
      );
      const nativeTransaction = IDBDatabase.prototype.transaction;
      const nativeClear = IDBObjectStore.prototype.clear;
      let opened = 0,
        clears = 0,
        error = "";
      IDBDatabase.prototype.transaction = function (
        ...args: Parameters<typeof nativeTransaction>
      ) {
        opened++;
        return nativeTransaction.apply(this, args);
      };
      IDBObjectStore.prototype.clear = function () {
        clears++;
        return nativeClear.call(this);
      };
      try {
        await r.restore(parseBackup(json), before);
      } catch (cause) {
        error = (cause as Error).name;
      } finally {
        IDBDatabase.prototype.transaction = nativeTransaction;
        IDBObjectStore.prototype.clear = nativeClear;
      }
      return {
        injected,
        opened,
        clears,
        error,
        before,
        after: await r.readForBackup(),
      };
    }, token);
    expect(result.injected).toBe(true);
    expect(result.error).toBe("BackupValidationError");
    expect(result.opened).toBe(0);
    expect(result.clears).toBe(0);
    expect(result.after).toEqual(result.before);
  });
}

test("metadata finita permanece reexportável após persistência e reload", async ({
  page,
}) => {
  const expected = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      backupFixture,
      parseBackup,
    } = window.financeAudit;
    const backup = backupFixture();
    const metadata = {
      provider: "manual",
      confidence: 0.75,
      nested: { enabled: true, count: 2 },
    };
    Object.assign(backup.settings, { metadata });
    Object.assign(backup.transactions[0], { metadata });
    const parsed = parseBackup(JSON.stringify(backup));
    await r.restore(parsed, await r.readForBackup());
    return { settings: parsed.settings, transactions: parsed.transactions };
  });
  await page.reload();
  await page.evaluate((code) => (0, eval)(code), bundle);
  const actual = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      serializeBackup,
      parseBackup,
    } = window.financeAudit;
    const persisted = await r.readForBackup();
    const reexported = parseBackup(serializeBackup(persisted.snapshot));
    return {
      settings: reexported.settings,
      transactions: reexported.transactions,
    };
  });
  expect(actual.settings).toEqual(expected.settings);
  expect(actual.transactions.sort((a, b) => a.id.localeCompare(b.id))).toEqual(
    expected.transactions.sort((a, b) => a.id.localeCompare(b.id)),
  );
});
