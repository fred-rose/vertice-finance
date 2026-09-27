import { expect, test } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import { rawLocal, repositoryBundle, seedLocal } from "./helpers/localData";

let bundle: string;
test.beforeAll(async () => {
  bundle = await repositoryBundle();
});
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
  await page.goto("/favicon.svg");
  await page.evaluate((code) => (0, eval)(code), bundle);
});

test("load e backup leem cinco requests na mesma readonly e esperam complete", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  expect(
    await page.evaluate(async () => {
      const r = window.financeAudit.transactionRepository;
      const native = IDBDatabase.prototype.transaction,
        get = IDBObjectStore.prototype.get,
        count = IDBObjectStore.prototype.count,
        getAll = IDBObjectStore.prototype.getAll;
      const events: string[] = [],
        requests: string[] = [];
      let current: IDBTransaction;
      IDBDatabase.prototype.transaction = function (
        ...args: Parameters<typeof native>
      ) {
        const tx = native.apply(this, args);
        current = tx;
        events.push(tx.mode);
        tx.addEventListener("complete", () => events.push("complete"));
        return tx;
      };
      const observe = (store: IDBObjectStore, key: string) => {
        if (store.transaction !== current)
          throw new Error("different transaction");
        requests.push(`${store.name}:${key}`);
      };
      IDBObjectStore.prototype.get = function (...args) {
        observe(this, `get:${args[0]}`);
        return get.apply(this, args);
      };
      IDBObjectStore.prototype.count = function (...args) {
        observe(this, `count:${args[0]}`);
        return count.apply(this, args);
      };
      IDBObjectStore.prototype.getAll = function (...args) {
        observe(this, "all");
        return getAll.apply(this, args);
      };
      try {
        await r.load();
        events.push("load");
        await r.readForBackup();
        events.push("backup");
        return { events, requests };
      } finally {
        IDBDatabase.prototype.transaction = native;
        IDBObjectStore.prototype.get = get;
        IDBObjectStore.prototype.count = count;
        IDBObjectStore.prototype.getAll = getAll;
      }
    }),
  ).toEqual({
    events: ["readonly", "complete", "load", "readonly", "complete", "backup"],
    requests: Array(2)
      .fill([
        "transactions:all",
        "settings:get:personal",
        "settings:count:personal",
        "settings:get:__vertice_local_concurrency__",
        "settings:count:__vertice_local_concurrency__",
      ])
      .flat(),
  });
});

test("restore verifica também revision pós-commit sem compensação", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const result = await page.evaluate(async () => {
    const r = window.financeAudit.transactionRepository,
      safety = await r.readForBackup(),
      original = r.readForBackup;
    r.readForBackup = async () => {
      const persisted = await original();
      return { ...persisted, revision: persisted.revision + 1 };
    };
    let phase = "";
    try {
      await r.restore(safety.snapshot, safety);
    } catch (e) {
      phase = (e as { phase: string }).phase;
    } finally {
      r.readForBackup = original;
    }
    return { phase, current: await r.readForBackup(), safety };
  });
  expect(result.phase).toBe("verify");
  expect(result.current.snapshot).toEqual(result.safety.snapshot);
  expect(result.current.revision).toBe(1);
  expect((await rawLocal(page)).settings[0]).toEqual({
    protocol: 1,
    revision: 1,
  });
});

test("sensibilidade: remover CAS somente do bundle isolado reproduz lost update", async ({
  page,
}) => {
  const guard =
    "if (current !== expectedRevision) throw new LocalConflictError();";
  expect(bundle.split(guard)).toHaveLength(2);
  const stale = await page.evaluate(async () => {
    const r = window.financeAudit.transactionRepository,
      stale = await r.load();
    await r.saveSettings(
      { ...stale.snapshot.settings, plannedIncome: 100 },
      stale.revision,
    );
    return stale;
  });
  expect(
    await page.evaluate(async (stale) => {
      try {
        await window.financeAudit.transactionRepository.saveSettings(
          stale.snapshot.settings,
          stale.revision,
        );
        return "accepted";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }, stale),
  ).toBe("stale-state");
  // No source file is mutated. The isolated page is destroyed after this test.
  await page.evaluate((code) => (0, eval)(code), bundle.replace(guard, ""));
  await page.evaluate(
    (stale) =>
      window.financeAudit.transactionRepository.saveSettings(
        stale.snapshot.settings,
        stale.revision,
      ),
    stale,
  );
  const corrupted = await page.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  expect(corrupted.snapshot.settings.plannedIncome).toBe(
    stale.snapshot.settings.plannedIncome,
  );
  expect(corrupted.revision).toBe(2);
});

for (const pair of [
  "save-save",
  "settings-settings",
  "delete-update",
  "import-save",
] as const) {
  test(`mesmo contexto, mesmo token: ${pair}`, async ({ page, context }) => {
    await seedLocal(page, { ...backupFixture(), present: true });
    const other = await context.newPage();
    await other.goto("/favicon.svg");
    await other.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
    await other.evaluate((code) => (0, eval)(code), bundle);
    const stale = await other.evaluate(() =>
      window.financeAudit.transactionRepository.load(),
    );
    const first = await page.evaluate(async (pair) => {
      const { transactionRepository: r, transaction } = window.financeAudit;
      const read = await r.load();
      if (pair === "settings-settings")
        return r.saveSettings(
          { ...read.snapshot.settings, plannedIncome: 7777 },
          read.revision,
        );
      if (pair === "delete-update") return r.remove("a-expense", read.revision);
      if (pair === "import-save")
        return r.import(
          [transaction({ id: "imported" })],
          false,
          read.revision,
        );
      return r.save(
        {
          ...read.snapshot.transactions.find((t) => t.id === "a-expense")!,
          amount: 777,
        },
        { kind: "update", expectedRevision: read.revision },
      );
    }, pair);
    expect(first.revision).toBe(stale.revision + 1);
    const before = await rawLocal(page);
    const code = await other.evaluate(
      async ({ pair, stale }) => {
        const { transactionRepository: r } = window.financeAudit;
        try {
          if (pair === "settings-settings")
            await r.saveSettings(
              { ...stale.snapshot.settings, plannedIncome: 9999 },
              stale.revision,
            );
          else
            await r.save(
              {
                ...stale.snapshot.transactions.find(
                  (t) => t.id === "a-expense",
                )!,
                amount: 999,
              },
              { kind: "update", expectedRevision: stale.revision },
            );
          return "accepted";
        } catch (e) {
          return (e as { code: string }).code;
        }
      },
      { pair, stale },
    );
    expect(code).toBe("stale-state");
    expect(await rawLocal(page)).toEqual(before);
  });
}

test("três clients concorrentes: um commit, dois conflitos", async ({
  page,
  context,
}) => {
  const clients = [page, await context.newPage(), await context.newPage()];
  for (const p of clients.slice(1)) {
    await p.goto("/favicon.svg");
    await p.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
    await p.evaluate((code) => (0, eval)(code), bundle);
  }
  const reads = await Promise.all(
    clients.map((p) =>
      p.evaluate(() => window.financeAudit.transactionRepository.load()),
    ),
  );
  const results = await Promise.all(
    clients.map((p, i) =>
      p.evaluate(
        async ({ revision, i }) => {
          const { transactionRepository: r, transaction } = window.financeAudit;
          try {
            await r.save(transaction({ id: `client-${i}` }), {
              kind: "create",
              expectedRevision: revision,
            });
            return "saved";
          } catch (e) {
            return (e as { code: string }).code;
          }
        },
        { revision: reads[i].revision, i },
      ),
    ),
  );
  expect(results.sort()).toEqual(["saved", "stale-state", "stale-state"]);
  const current = await page.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  expect(current.revision).toBe(1);
  expect(current.snapshot.transactions).toHaveLength(1);
});

test("dois BrowserContexts são controle negativo: IndexedDB isolado", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.evaluate(async () => {
    const h = window.financeAudit;
    await h.transactionRepository.save(h.transaction(), {
      kind: "create",
      expectedRevision: 0,
    });
  });
  const isolated = await browser.newContext();
  try {
    const p = await isolated.newPage();
    await p.goto(`${baseURL}/favicon.svg`);
    await p.evaluate((code) => (0, eval)(code), bundle);
    const read = await p.evaluate(() =>
      window.financeAudit.transactionRepository.load(),
    );
    expect(read.revision).toBe(0);
    expect(read.snapshot.transactions).toEqual([]);
  } finally {
    await isolated.close();
  }
});

for (const identical of [false, true])
  for (const writer of [
    "save",
    "import",
    "settings",
    "remove",
    "demo",
    "restore",
  ] as const) {
    test(`restore ${identical ? "idêntico" : "diferente"} invalida ${writer} antigo sem alterar JSON v2`, async ({
      page,
      context,
    }) => {
      await seedLocal(page, { ...backupFixture(), present: true });
      const other = await context.newPage();
      await other.goto("/favicon.svg");
      await other.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
      await other.evaluate((code) => (0, eval)(code), bundle);
      const stale = await other.evaluate(() =>
        window.financeAudit.transactionRepository.readForBackup(),
      );
      const json = await page.evaluate(async (identical) => {
        const h = window.financeAudit,
          read = await h.transactionRepository.readForBackup();
        const target = structuredClone(read.snapshot);
        if (!identical) target.settings.plannedIncome += 100;
        const restored = await h.transactionRepository.restore(target, read);
        return {
          before: h.serializeBackup(read.snapshot),
          after: h.serializeBackup(restored.snapshot),
          revision: restored.revision,
        };
      }, identical);
      expect(json.revision).toBe(stale.revision + 1);
      if (identical)
        expect(JSON.parse(json.after)).toEqual(JSON.parse(json.before));
      else expect(JSON.parse(json.after)).not.toEqual(JSON.parse(json.before));
      expect(JSON.parse(json.after).version).toBe(2);
      expect(json.after).not.toContain("revision");
      expect(json.after).not.toContain("protocol");
      const before = await rawLocal(page);
      expect(
        await other.evaluate(
          async ({ writer, stale }) => {
            const { transactionRepository: r, transaction } =
              window.financeAudit;
            try {
              if (writer === "save")
                await r.save(transaction(), {
                  kind: "create",
                  expectedRevision: stale.revision,
                });
              if (writer === "import")
                await r.import([transaction()], false, stale.revision);
              if (writer === "settings")
                await r.saveSettings(stale.snapshot.settings, stale.revision);
              if (writer === "remove")
                await r.remove("a-expense", stale.revision);
              if (writer === "demo") await r.removeDemo(stale.revision);
              if (writer === "restore") await r.restore(stale.snapshot, stale);
              return "accepted";
            } catch (e) {
              return (
                (e as { code?: string; phase?: string }).code ??
                (e as { phase: string }).phase
              );
            }
          },
          { writer, stale },
        ),
      ).toBe(writer === "restore" ? "changed" : "stale-state");
      expect(await rawLocal(page)).toEqual(before);
    });
  }

for (const writer of ["settings", "import", "demo"] as const) {
  test(`no-op ${writer} consome token uma vez`, async ({ page }) => {
    await seedLocal(page, { ...backupFixture(), present: true });
    const before = await rawLocal(page);
    const result = await page.evaluate(async (writer) => {
      const r = window.financeAudit.transactionRepository,
        read = await r.load();
      const run = () =>
        writer === "settings"
          ? r.saveSettings(read.snapshot.settings, read.revision)
          : writer === "import"
            ? r.import(read.snapshot.transactions, true, read.revision)
            : r.removeDemo(read.revision);
      const receipt = await run();
      let code = "";
      try {
        await run();
      } catch (e) {
        code = (e as { code: string }).code;
      }
      return { receipt, code, read: await r.load() };
    }, writer);
    expect(result.receipt.revision).toBe(1);
    expect(result.code).toBe("stale-state");
    const after = await rawLocal(page);
    expect(after.transactions).toEqual(before.transactions);
    expect(after.settings.slice(1)).toEqual(before.settings.slice(1));
  });
}

test("create existente/update ausente/delete ausente não consomem revisão", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const before = await rawLocal(page);
  expect(
    await page.evaluate(async () => {
      const { transactionRepository: r, transaction } = window.financeAudit,
        read = await r.load(),
        codes = [];
      for (const op of [
        () =>
          r.save(read.snapshot.transactions[0], {
            kind: "create",
            expectedRevision: read.revision,
          }),
        () =>
          r.save(transaction({ id: "missing" }), {
            kind: "update",
            expectedRevision: read.revision,
          }),
        () => r.remove("missing", read.revision),
      ]) {
        try {
          await op();
          codes.push("accepted");
        } catch (e) {
          codes.push((e as { code: string }).code);
        }
      }
      return codes;
    }),
  ).toEqual(["stale-state", "stale-state", "stale-state"]);
  expect(await rawLocal(page)).toEqual(before);
});

for (const fault of [
  "before",
  "between",
  "import-middle",
  "metadata-request",
  "abort-after-metadata",
] as const) {
  test(`atomicidade ${fault}: dados e revision revertem juntos`, async ({
    page,
  }) => {
    await seedLocal(page, { ...backupFixture(), present: true });
    const before = await rawLocal(page);
    const result = await page.evaluate(async (fault) => {
      const { transactionRepository: r, transaction } = window.financeAudit,
        read = await r.load();
      const add = IDBObjectStore.prototype.add,
        put = IDBObjectStore.prototype.put;
      let calls = 0,
        metadataCalls = 0;
      IDBObjectStore.prototype.add = function (...args) {
        if (
          this.name === "transactions" &&
          ++calls === (fault === "before" ? 1 : 2) &&
          (fault === "before" || fault === "import-middle")
        )
          throw new DOMException("injected", "QuotaExceededError");
        return add.apply(this, args);
      };
      IDBObjectStore.prototype.put = function (...args) {
        if (args[1] === "__vertice_local_concurrency__") {
          metadataCalls++;
          if (fault === "between")
            throw new DOMException("injected", "QuotaExceededError");
          if (fault === "metadata-request") return this.add(args[0], args[1]);
          const req = put.apply(this, args);
          if (fault === "abort-after-metadata")
            req.addEventListener("success", () => this.transaction.abort());
          return req;
        }
        return put.apply(this, args);
      };
      let rejected = false;
      try {
        await r.import(
          [transaction({ id: "one" }), transaction({ id: "two" })],
          false,
          read.revision,
        );
      } catch {
        rejected = true;
      } finally {
        IDBObjectStore.prototype.add = add;
        IDBObjectStore.prototype.put = put;
      }
      return { rejected, calls, metadataCalls };
    }, fault);
    expect(result.rejected).toBe(true);
    expect(result.calls).toBe(fault === "before" ? 1 : 2);
    expect(result.metadataCalls).toBe(
      fault === "before" || fault === "import-middle" ? 0 : 1,
    );
    expect(await rawLocal(page)).toEqual(before);
  });
}

test("overflow rejeita os seis writers antes de qualquer escrita", async ({
  page,
}) => {
  await seedLocal(page, {
    ...backupFixture(),
    present: true,
    metadata: { protocol: 1, revision: Number.MAX_SAFE_INTEGER },
  });
  const before = await rawLocal(page);
  expect(
    await page.evaluate(async () => {
      const { transactionRepository: r, transaction } = window.financeAudit,
        read = await r.load();
      let writes = 0,
        rejected = 0;
      const methods = ["add", "put", "delete", "clear"] as const;
      const originals = methods.map((key) => IDBObjectStore.prototype[key]);
      methods.forEach((key, i) => {
        Object.defineProperty(IDBObjectStore.prototype, key, {
          value: function (this: IDBObjectStore, ...args: unknown[]) {
            writes++;
            return Reflect.apply(originals[i], this, args);
          },
          configurable: true,
          writable: true,
        });
      });
      try {
        for (const run of [
          () =>
            r.save(transaction(), {
              kind: "create",
              expectedRevision: read.revision,
            }),
          () => r.import([], true, read.revision),
          () => r.saveSettings(read.snapshot.settings, read.revision),
          () => r.remove("a-expense", read.revision),
          () => r.removeDemo(read.revision),
          () => r.restore(read.snapshot, read),
        ]) {
          try {
            await run();
          } catch {
            rejected++;
          }
        }
      } finally {
        methods.forEach((key, i) =>
          Object.defineProperty(IDBObjectStore.prototype, key, {
            value: originals[i],
            configurable: true,
            writable: true,
          }),
        );
      }
      return { writes, rejected };
    }),
  ).toEqual({ writes: 0, rejected: 6 });
  expect(await rawLocal(page)).toEqual(before);
});

test("token omitido é rejeitado pelos seis writers sem consulta implícita", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const before = await rawLocal(page);
  expect(
    await page.evaluate(async () => {
      const {
        transactionRepository: r,
        transaction,
        backupFixture,
      } = window.financeAudit;
      let opened = 0,
        rejected = 0;
      const native = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (
        ...args: Parameters<typeof native>
      ) {
        opened++;
        return native.apply(this, args);
      };
      try {
        for (const [name, args] of [
          ["save", [transaction(), { kind: "create" }]],
          ["import", [[], true]],
          ["saveSettings", [backupFixture().settings]],
          ["remove", ["a-expense"]],
          ["removeDemo", []],
          ["restore", [backupFixture(), { snapshot: backupFixture() }]],
        ] as const) {
          try {
            await Reflect.apply(r[name], r, args);
          } catch {
            rejected++;
          }
        }
      } finally {
        IDBDatabase.prototype.transaction = native;
      }
      return { opened, rejected };
    }),
  ).toEqual({ opened: 0, rejected: 6 });
  expect(await rawLocal(page)).toEqual(before);
});
