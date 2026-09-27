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

for (const stage of ["before-download", "after-download"] as const) {
  test(`duas abas: escrita ${stage} invalida a precondição`, async ({
    page,
    context,
  }) => {
    const other = await context.newPage();
    await other.goto("/favicon.svg");
    await other.evaluate((code) => (0, eval)(code), bundle);
    const safety = await page.evaluate(() =>
      window.financeAudit.transactionRepository.readForBackup(),
    );
    if (stage === "after-download") {
      await page.evaluate(
        (safety) => window.financeAudit.serializeBackup(safety.snapshot),
        safety,
      );
    }
    await other.evaluate(async () => {
      const { transactionRepository: r, transaction } = window.financeAudit;
      await r.save(transaction({ id: "other-tab", amount: 432.1 }), {
        kind: "create",
        expectedRevision: 0,
      });
    });
    if (stage === "before-download") {
      await page.evaluate(
        (safety) => window.financeAudit.serializeBackup(safety.snapshot),
        safety,
      );
    }
    const result = await page.evaluate(async (safety) => {
      const { transactionRepository: r, backupFixture } = window.financeAudit;
      let phase = "";
      let clears = 0;
      const clear = IDBObjectStore.prototype.clear;
      IDBObjectStore.prototype.clear = function () {
        clears++;
        return clear.call(this);
      };
      try {
        await r.restore(backupFixture(), safety);
      } catch (e) {
        phase = (e as { phase: string }).phase;
      } finally {
        IDBObjectStore.prototype.clear = clear;
      }
      return { phase, clears, after: await r.readForBackup() };
    }, safety);
    expect(result.phase).toBe("changed");
    expect(result.clears).toBe(0);
    expect(result.after.snapshot.transactions.map((t) => t.id)).toEqual([
      "other-tab",
    ]);
    expect(result.after.snapshot.transactions[0].amount).toBe(432.1);
  });
}

test("conexão concorrente enfileirada durante restore só grava após commit e é detectada na verificação", async ({
  page,
}, testInfo) => {
  const result = await page.evaluate(async () => {
    const {
      transactionRepository: r,
      backupFixture,
      transaction,
    } = window.financeAudit;
    const safety = await r.readForBackup();
    const open = indexedDB.open("vertice-finance", 3);
    const db = await new Promise<IDBDatabase>((resolve) => {
      open.onsuccess = () => resolve(open.result);
    });
    const clear = IDBObjectStore.prototype.clear;
    const events: string[] = [];
    let pending!: Promise<void>;
    IDBObjectStore.prototype.clear = function () {
      const request = clear.call(this);
      this.transaction.addEventListener("complete", () =>
        events.push("restore-complete"),
      );
      const tx = db.transaction("transactions", "readwrite");
      tx.objectStore("transactions").put(transaction({ id: "queued-other" }));
      pending = new Promise<void>((resolve) => {
        tx.oncomplete = () => {
          events.push("other-complete");
          resolve();
        };
      });
      return request;
    };
    let phase = "";
    try {
      await r.restore(backupFixture(), safety);
    } catch (e) {
      phase = (e as { phase: string }).phase;
    } finally {
      IDBObjectStore.prototype.clear = clear;
    }
    await pending;
    db.close();
    return {
      phase,
      events,
      ids: (await r.readForBackup()).snapshot.transactions.map((t) => t.id),
    };
  });
  await testInfo.attach("queued-writer", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
  expect(result.events).toEqual(["restore-complete", "other-complete"]);
  expect(result.phase).toBe("verify");
  expect(result.ids.sort()).toEqual([
    "a-expense",
    "queued-other",
    "t-transfer",
    "z-income",
  ]);
});

test("A2b: settings antigas conflitam após restore verificado", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto("/favicon.svg");
  await other.evaluate((code) => (0, eval)(code), bundle);
  const stale = await other.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  await page.evaluate(async () => {
    const { transactionRepository: r, backupFixture } = window.financeAudit;
    await r.restore(backupFixture(), await r.readForBackup());
  });
  const code = await other.evaluate(async (stale) => {
    try {
      await window.financeAudit.transactionRepository.saveSettings(
        stale.snapshot.settings,
        stale.revision,
      );
      return "accepted";
    } catch (e) {
      return (e as { code: string }).code;
    }
  }, stale);
  expect(code).toBe("stale-state");
  const current = await page.evaluate(() =>
    window.financeAudit.transactionRepository.readForBackup(),
  );
  expect(current.snapshot.settings).not.toEqual(stale.snapshot.settings);
  expect(current.revision).toBe(stale.revision + 1);
  expect(current.snapshot.transactions).toHaveLength(3);
});

test("campos JSON adicionais sobrevivem ao IndexedDB, load e reload", async ({
  page,
}) => {
  const expected = await page.evaluate(async () => {
    const { transactionRepository: r, backupFixture } = window.financeAudit;
    const backup = backupFixture();
    Object.assign(backup.settings, {
      meta: { nested: [false, 0, null, "text"] },
    });
    for (const collection of [
      backup.settings.accounts,
      backup.settings.categories,
      backup.settings.goals,
      backup.settings.fixedExpenses,
      backup.transactions,
    ]) {
      for (const row of collection)
        Object.assign(row, { extra: { original: row.id, array: [1, 2] } });
    }
    delete backup.transactions[0].source;
    delete backup.transactions[0].createdAt;
    backup.transactions[0].description = "  espaço preservado  ";
    const restored = await r.restore(backup, await r.readForBackup());
    return restored;
  });
  await page.reload();
  await page.evaluate((code) => (0, eval)(code), bundle);
  expect(
    await page.evaluate(() =>
      window.financeAudit.transactionRepository.readForBackup(),
    ),
  ).toEqual(expected);
});
