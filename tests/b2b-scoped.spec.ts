import { expect, test } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import { seedLocal } from "./helpers/localData";
import {
  scopedBundle,
  install,
  promote,
  addB,
  rawDatabase,
} from "./helpers/scopedData";
let bundle: string;
test.beforeAll(async () => {
  bundle = await scopedBundle();
});
test.beforeEach(async ({ page }) => {
  await install(page, bundle);
});

test("fresh uniform bootstrap, empty archive, stable UUID and JSON v2", async ({
  page,
}) => {
  const first = await promote(page);
  expect(first.authority.sourceVersion).toBe(0);
  expect(first.read.revision).toBe(0);
  expect(first.read.snapshot.transactions).toEqual([]);
  expect(first.archive).toEqual({
    count: 0,
    revision: null,
    transactions: [],
    keys: [],
    settings: [],
  });
  const raw = await rawDatabase(page);
  expect(raw.names).toEqual([
    "scopedSettings",
    "scopedTransactions",
    "settings",
    "transactions",
    "workspaceMeta",
  ]);
  expect(raw["scopedTransactions.keyPath"]).toEqual([
    "workspaceId",
    "record.id",
  ]);
  const second = await page.evaluate(async () => {
    const manifest = await window.engine.open();
    const exported = JSON.parse(await window.repo.exportJSON());
    return { manifest, keys: Object.keys(exported).sort() };
  });
  expect(second.manifest).toEqual(first.authority);
  expect(second.keys).toEqual([
    "exportedAt",
    "settings",
    "transactions",
    "version",
  ]);
});

for (const revision of [0, 17, Number.MAX_SAFE_INTEGER])
  test(`migration v3 raw R=${revision}`, async ({ page }) => {
    const fixture = backupFixture();
    delete fixture.transactions[0].source;
    delete fixture.transactions[0].createdAt;
    Object.assign(fixture.transactions[0], {
      workspaceId: "financial-extra",
      mode: "raw",
      extra: { n: 1e-8 },
      optional: undefined,
    });
    fixture.settings.accounts[0].initialBalance = 1e-8;
    Object.assign(fixture.settings, { rawExtra: { zero: -0, value: 1e-8 } });
    await seedLocal(page, {
      ...fixture,
      present: true,
      metadata: { protocol: 1, revision },
    });
    const before = await rawDatabase(page),
      result = await promote(page),
      after = await rawDatabase(page);
    expect(result.authority.sourceVersion).toBe(3);
    expect(result.read.revision).toBe(revision);
    expect(result.read.snapshot.transactions).toEqual(before.transactions);
    expect(result.read.snapshot.settings).toEqual(fixture.settings);
    expect(after.transactions).toEqual(before.transactions);
    expect(after.settings).toEqual(before.settings);
    expect(after["settings.keys"]).toEqual(before["settings.keys"]);
    expect(result.read.snapshot.transactions[2]).not.toHaveProperty(
      "createdAt",
    );
  });

for (const version of [1, 2])
  test(`historical v${version} commits 3, closes, preflight, then 4`, async ({
    page,
  }) => {
    const fixture = backupFixture();
    if (version === 1)
      fixture.transactions = fixture.transactions.map((row) => {
        const { accountId, categoryId, destinationAccountId, ...rest } = row;
        return {
          ...rest,
          account: accountId,
          category: categoryId,
          destinationAccount: destinationAccountId,
          source: undefined,
          createdAt: undefined,
        } as never;
      });
    await seedLocal(page, {
      ...fixture,
      present: true,
      databaseVersion: version as 2,
    });
    const prepared = await page.evaluate(async () => {
      window.engine = window.scopedAudit.createScopedStorage();
      window.safety = await window.engine.preflight();
      return {
        revision: window.safety.revision,
        json: window.safety.safetyJSON,
      };
    });
    expect((await rawDatabase(page)).version).toBe(3);
    expect(prepared.revision).toBe(0);
    expect(JSON.parse(prepared.json!).version).toBe(2);
    const before = await rawDatabase(page);
    await page.evaluate(async () => {
      await window.engine.open(window.safety);
    });
    const after = await rawDatabase(page);
    expect(after.version).toBe(4);
    expect(after.transactions).toEqual(before.transactions);
    expect(after.settings).toEqual(before.settings);
    expect(
      (after.scopedTransactions as { record: unknown }[]).map(
        (row) => row.record,
      ),
    ).toEqual(before.transactions);
  });

test("stale safety rejects a confirmed legacy write; new safety retains it", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  await page.evaluate(async () => {
    const a = window.scopedAudit;
    window.engine = a.createScopedStorage();
    window.safety = await window.engine.preflight();
    await a.transactionRepository.save(a.transaction({ id: "confirmed" }), {
      kind: "create",
      expectedRevision: 0,
    });
    await importClose();
    function importClose() {
      return new Promise<void>((resolve) => {
        const r = indexedDB.open("vertice-finance", 3);
        r.onsuccess = () => {
          r.result.close();
          resolve();
        };
      });
    }
  });
  const before = await rawDatabase(page);
  expect(
    await page.evaluate(async () => {
      try {
        await window.engine.open(window.safety);
        return "BAD";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }),
  ).toBe("stale-safety");
  expect(await rawDatabase(page)).toEqual(before);
  const retried = await promote(page);
  expect(retried.read.revision).toBe(1);
  expect(
    retried.read.snapshot.transactions.some((row) => row.id === "confirmed"),
  ).toBe(true);
});

test("nested keys real add/get/put/delete/index/cursor, Unicode and duplicate", async ({
  page,
}) => {
  await promote(page);
  await addB(page);
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit,
      idA = window.repo.handle.workspaceId,
      idB = window.repoB.handle.workspaceId;
    const row = a.transaction({ id: "000é 日本" });
    let tx = window.engine.scopedTransaction("readwrite"),
      done = a.transactionCompletion(tx).done;
    tx.objectStore("scopedTransactions").add(a.scopedEnvelope(idA, row));
    tx.objectStore("scopedTransactions").add(a.scopedEnvelope(idB, row));
    await done;
    tx = window.engine.scopedTransaction();
    done = a.transactionCompletion(tx).done;
    const get = tx.objectStore("scopedTransactions").get([idA, row.id]);
    const cursor = tx
      .objectStore("scopedTransactions")
      .index("byWorkspace")
      .openCursor(IDBKeyRange.only(idB));
    let primary: IDBValidKey | undefined;
    cursor.onsuccess = () => {
      primary = cursor.result?.primaryKey;
    };
    await done;
    const saved = get.result;
    tx = window.engine.scopedTransaction("readwrite");
    done = a.transactionCompletion(tx).done;
    tx.objectStore("scopedTransactions").put(
      a.scopedEnvelope(idA, { ...row, description: "updated" }),
    );
    await done;
    tx = window.engine.scopedTransaction("readwrite");
    done = a.transactionCompletion(tx).done;
    tx.objectStore("scopedTransactions").add(a.scopedEnvelope(idA, row));
    let duplicate = "";
    try {
      await done;
    } catch (e) {
      duplicate = ((e as Error).cause as DOMException).name;
    }
    tx = window.engine.scopedTransaction("readwrite");
    done = a.transactionCompletion(tx).done;
    tx.objectStore("scopedTransactions").delete([idA, row.id]);
    await done;
    return {
      saved,
      primary,
      duplicate,
      a: await window.repo.load(),
      b: await window.repoB.load(),
      idA,
      idB,
    };
  });
  expect(result.saved.record.id).toBe("000é 日本");
  expect(result.primary).toEqual([result.idB, "000é 日本"]);
  expect(result.duplicate).toBe("ConstraintError");
  expect(result.a.snapshot.transactions).toEqual([]);
  expect(result.b.snapshot.transactions[0].id).toBe("000é 日本");
});

const writers = [
  "save",
  "remove",
  "import",
  "saveSettings",
  "removeDemo",
  "restore",
] as const;
for (const writer of writers)
  for (const failure of [false, true])
    test(`${writer} A preserves B + archive, ${failure ? "abort" : "commit"}`, async ({
      page,
    }) => {
      const fixture = backupFixture();
      fixture.transactions[0].source = "demo";
      await seedLocal(page, {
        ...fixture,
        present: true,
        metadata: { protocol: 1, revision: 5 },
      });
      await promote(page);
      const b = await addB(page);
      const archive = await page.evaluate(() => window.engine.archive());
      const result = await page.evaluate(
        async ({ writer, failure }) => {
          const a = window.scopedAudit,
            repo = window.repo,
            current = await repo.load();
          const command = {
            lease: repo.handle.lease,
            precondition: {
              workspaceId: current.workspaceId,
              expectedRevision: current.revision,
            },
          };
          const original = IDBObjectStore.prototype.put;
          if (failure)
            IDBObjectStore.prototype.put = function (...args) {
              if (this.name === "workspaceMeta")
                throw new DOMException("injected", "QuotaExceededError");
              return original.apply(this, args);
            };
          let error: string | undefined;
          try {
            if (writer === "save")
              await repo.save(
                { ...current.snapshot.transactions[0], description: "updated" },
                "update",
                command,
              );
            if (writer === "remove")
              await repo.remove(current.snapshot.transactions[0].id, command);
            if (writer === "import")
              await repo.import(
                [a.transaction({ id: "new-import" })],
                true,
                command,
              );
            if (writer === "saveSettings")
              await repo.saveSettings(
                { ...current.snapshot.settings, plannedIncome: 7 },
                command,
              );
            if (writer === "removeDemo") await repo.removeDemo(command);
            if (writer === "restore")
              await repo.restore(
                { settings: current.snapshot.settings, transactions: [] },
                current,
                command,
              );
          } catch (e) {
            error = (e as Error).name;
          } finally {
            IDBObjectStore.prototype.put = original;
          }
          return {
            before: current,
            after: await repo.load(),
            b: await window.repoB.load(),
            archive: await window.engine.archive(),
            error,
          };
        },
        { writer, failure },
      );
      expect(result.b).toEqual(b);
      expect(result.archive).toEqual(archive);
      if (failure) {
        expect(result.error).toBeTruthy();
        expect(result.after).toEqual(result.before);
      } else {
        expect(result.error).toBeUndefined();
        expect(result.after.revision).toBe(6);
      }
    });

for (const writer of writers)
  test(`MAX migrates readonly/export; ${writer} rejects`, async ({ page }) => {
    await seedLocal(page, {
      ...backupFixture(),
      present: true,
      metadata: { protocol: 1, revision: Number.MAX_SAFE_INTEGER },
    });
    await promote(page);
    const before = await rawDatabase(page);
    const error = await page.evaluate(async (writer) => {
      const a = window.scopedAudit,
        repo = window.repo,
        current = await repo.load();
      const command = {
        lease: repo.handle.lease,
        precondition: {
          workspaceId: current.workspaceId,
          expectedRevision: current.revision,
        },
      };
      JSON.parse(await repo.exportJSON());
      try {
        if (writer === "save")
          await repo.save(a.transaction({ id: "new" }), "create", command);
        if (writer === "remove")
          await repo.remove(current.snapshot.transactions[0].id, command);
        if (writer === "import") await repo.import([], true, command);
        if (writer === "saveSettings")
          await repo.saveSettings(current.snapshot.settings, command);
        if (writer === "removeDemo") await repo.removeDemo(command);
        if (writer === "restore")
          await repo.restore(current.snapshot, current, command);
        return "BAD";
      } catch (e) {
        return (
          (e as { code?: string; cause?: { code: string } }).code ??
          (e as { cause: { code: string } }).cause.code
        );
      }
    }, writer);
    expect(error).toBe("revision-exhausted");
    expect(await rawDatabase(page)).toEqual(before);
  });

test("CAS races, independent same revisions, scope/lease mismatch, no-op semantics", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  await promote(page);
  await addB(page);
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit,
      repo = window.repo,
      b = window.repoB,
      before = await repo.load();
    const command = {
      lease: repo.handle.lease,
      precondition: { workspaceId: before.workspaceId, expectedRevision: 0 },
    };
    const races = await Promise.allSettled([
      repo.import([], true, command),
      repo.removeDemo(command),
    ]);
    const wrong = await Promise.allSettled([
      b.import([], true, command),
      repo.import([], true, {
        ...command,
        precondition: {
          workspaceId: b.handle.workspaceId,
          expectedRevision: 0,
        },
      }),
    ]);
    await b.import([], true, {
      lease: b.handle.lease,
      precondition: { workspaceId: b.handle.workspaceId, expectedRevision: 0 },
    });
    const staleHandle = repo.handle;
    staleHandle.dispose();
    const newRepo = a.createScopedTransactionRepository(
      window.engine,
      a.createScopedHandle(before.workspaceId),
    );
    const oldLease = await Promise.allSettled([
      newRepo.import([], true, {
        lease: staleHandle.lease,
        precondition: { workspaceId: before.workspaceId, expectedRevision: 1 },
      }),
    ]);
    return {
      races: races.map((x) => x.status),
      wrong: wrong.map((x) => x.status),
      oldLease: oldLease[0].status,
      a: await newRepo.load(),
      b: await b.load(),
    };
  });
  expect(result.races.sort()).toEqual(["fulfilled", "rejected"]);
  expect(result.wrong).toEqual(["rejected", "rejected"]);
  expect(result.oldLease).toBe("rejected");
  expect(result.a.revision).toBe(1);
  expect(result.b.revision).toBe(1);
});

test("disposed while RW waits: lease rechecked before first mutation", async ({
  page,
}) => {
  await promote(page);
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit,
      repo = window.repo,
      tx = window.engine.scopedTransaction("readwrite");
    const done = a.transactionCompletion(tx).done;
    let release = false;
    const keep = () => {
      const request = tx.objectStore("workspaceMeta").get("authority");
      request.onsuccess = () => {
        if (!release) keep();
      };
    };
    keep();
    const write = repo.save(a.transaction(), "create", {
      lease: repo.handle.lease,
      precondition: {
        workspaceId: repo.handle.workspaceId,
        expectedRevision: 0,
      },
    });
    repo.handle.dispose();
    release = true;
    await done;
    const result = await Promise.allSettled([write]);
    return {
      status: result[0].status,
      read: await window.engine.read(repo.handle.workspaceId),
    };
  });
  expect(result.status).toBe("rejected");
  expect(result.read.revision).toBe(0);
  expect(result.read.snapshot.transactions).toEqual([]);
});

test("restore safety scope mismatch, post-commit verify error without compensation", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  await promote(page);
  await addB(page);
  const before = await rawDatabase(page);
  expect(
    await page.evaluate(async () => {
      const repo = window.repo,
        a = await repo.load(),
        b = await window.repoB.load();
      try {
        await repo.restore(a.snapshot, b, {
          lease: repo.handle.lease,
          precondition: {
            workspaceId: a.workspaceId,
            expectedRevision: a.revision,
          },
        });
        return "BAD";
      } catch (e) {
        return (e as { phase: string }).phase;
      }
    }),
  ).toBe("prepare");
  expect(await rawDatabase(page)).toEqual(before);
  const result = await page.evaluate(async () => {
    const repo = window.repo,
      current = await repo.load(),
      b = await window.repoB.load();
    const get = IDBObjectStore.prototype.get;
    let writes = 0;
    const writeTransactions = new Set<IDBTransaction>();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === "workspaceMeta") {
        writeTransactions.add(this.transaction);
        writes = writeTransactions.size;
      }
      return put.apply(this, args);
    };
    IDBObjectStore.prototype.get = function (...args) {
      if (writes && this.transaction.mode === "readonly")
        throw Error("POST_COMMIT_READ");
      return get.apply(this, args);
    };
    let phase = "";
    try {
      await repo.restore(
        { transactions: [], settings: current.snapshot.settings },
        current,
        {
          lease: repo.handle.lease,
          precondition: {
            workspaceId: current.workspaceId,
            expectedRevision: current.revision,
          },
        },
      );
    } catch (e) {
      phase = (e as { phase: string }).phase;
    } finally {
      IDBObjectStore.prototype.get = get;
      IDBObjectStore.prototype.put = put;
    }
    return {
      phase,
      writes,
      a: await repo.load(),
      beforeB: b,
      afterB: await window.repoB.load(),
    };
  });
  expect(result.phase).toBe("verify");
  expect(result.writes).toBe(1);
  expect(result.a.revision).toBe(1);
  expect(result.a.restoreRevision).toBe(1);
  expect(result.a.snapshot.transactions).toEqual([]);
  expect(result.afterB).toEqual(result.beforeB);
});

test("blocked cancels, five-second late release never promotes; retry works", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const before = await rawDatabase(page);
  const error = await page.evaluate(async () => {
    const a = window.scopedAudit;
    window.engine = a.createScopedStorage();
    window.safety = await window.engine.preflight();
    await new Promise<void>((resolve) => {
      const r = indexedDB.open("vertice-finance", 3);
      r.onsuccess = () => {
        window.blocker = r.result;
        window.blocker.onversionchange = () => {};
        resolve();
      };
    });
    try {
      await window.engine.open(window.safety);
      return "BAD";
    } catch (e) {
      return (e as { code: string }).code;
    }
  });
  expect(error).toBe("blocked");
  await page.waitForTimeout(5000);
  await page.evaluate(() => window.blocker.close());
  expect(await rawDatabase(page)).toEqual(before);
  const retry = await promote(page);
  expect(retry.authority.sourceVersion).toBe(3);
});

test("two eligible concurrent migrations publish exactly one default", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit,
      first = a.createScopedStorage(),
      second = a.createScopedStorage();
    const [p1, p2] = await Promise.all([first.preflight(), second.preflight()]);
    const [one, two] = await Promise.all([first.open(p1), second.open(p2)]);
    const reads = await Promise.all([
      first.read(one.defaultWorkspaceId),
      second.read(two.defaultWorkspaceId),
    ]);
    first.close();
    second.close();
    return { one, two, reads };
  });
  expect(result.one).toEqual(result.two);
  expect(result.reads[0]).toEqual(result.reads[1]);
  expect((await rawDatabase(page))["workspaceMeta.keys"]).toHaveLength(2);
});

test("writer committed between migration and reopen is retained; archive is never recopied", async ({
  page,
}) => {
  await seedLocal(page, {
    ...backupFixture(),
    present: true,
    metadata: { protocol: 1, revision: 17 },
  });
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit,
      engine = a.createScopedStorage(),
      safety = await engine.preflight(),
      open = indexedDB.open.bind(indexedDB);
    let injected = false;
    indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
      const request = open(...args);
      if (args[1] === 4 && !injected) {
        injected = true;
        request.addEventListener("success", () => {
          const tx = request.result.transaction(
            ["workspaceMeta", "scopedTransactions"],
            "readwrite",
          );
          const manifest = tx.objectStore("workspaceMeta").get("authority");
          manifest.onsuccess = () => {
            const id = manifest.result.defaultWorkspaceId;
            tx.objectStore("scopedTransactions").add(
              a.scopedEnvelope(id, a.transaction({ id: "new-v4-writer" })),
            );
            tx.objectStore("workspaceMeta").put(
              { workspaceId: id, mode: "personal", revision: 18 },
              a.workspaceMetadataKey(id),
            );
          };
        });
      }
      return request;
    }) as IDBFactory["open"];
    let manifest;
    try {
      manifest = await engine.open(safety);
    } finally {
      indexedDB.open = open;
    }
    const first = await engine.read(manifest!.defaultWorkspaceId);
    await engine.open();
    const second = await engine.read(manifest!.defaultWorkspaceId);
    const archive = await engine.archive();
    engine.close();
    return { first, second, archive };
  });
  expect(result.first).toEqual(result.second);
  expect(result.first.revision).toBe(18);
  expect(
    result.first.snapshot.transactions.some(
      (row) => row.id === "new-v4-writer",
    ),
  ).toBe(true);
  expect(result.archive.count).toBe(3);
  expect(result.archive.revision).toBe(17);
});

test("reopen rejects rollback revision or raw discrepancy at initial R", async ({
  page,
}) => {
  await seedLocal(page, {
    ...backupFixture(),
    present: true,
    metadata: { protocol: 1, revision: 17 },
  });
  await promote(page);
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit,
      id = window.repo.handle.workspaceId;
    let tx = window.engine.scopedTransaction("readwrite"),
      done = a.transactionCompletion(tx).done;
    tx.objectStore("workspaceMeta").put(
      { workspaceId: id, mode: "personal", revision: 16 },
      a.workspaceMetadataKey(id),
    );
    await done;
    let low = "";
    try {
      await window.engine.open();
    } catch (e) {
      low = (e as { code: string }).code;
    }
    const request = indexedDB.open("vertice-finance", 4);
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
    tx = request.result.transaction(
      ["workspaceMeta", "scopedTransactions"],
      "readwrite",
    );
    done = a.transactionCompletion(tx).done;
    tx.objectStore("workspaceMeta").put(
      { workspaceId: id, mode: "personal", revision: 17 },
      a.workspaceMetadataKey(id),
    );
    tx.objectStore("scopedTransactions").put(
      a.scopedEnvelope(
        id,
        a.transaction({ id: "a-expense", description: "tampered" }),
      ),
    );
    await done;
    request.result.close();
    let mismatch = "";
    try {
      await window.engine.open();
    } catch (e) {
      mismatch = (e as { code: string }).code;
    }
    return { low, mismatch };
  });
  expect(result).toEqual({
    low: "invalid-snapshot",
    mismatch: "invalid-snapshot",
  });
});

test("create/update existence, import dedup is scope local, references cannot borrow B", async ({
  page,
}) => {
  await promote(page);
  await addB(page);
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit,
      repo = window.repo,
      b = window.repoB;
    const cmd = (r: typeof repo, n: number) => ({
      lease: r.handle.lease,
      precondition: { workspaceId: r.handle.workspaceId, expectedRevision: n },
    });
    const row = a.transaction({ id: "shared-import" });
    await b.save(row, "create", cmd(b, 0));
    const imported = await repo.import([row, row], true, cmd(repo, 0));
    const errors = await Promise.allSettled([
      repo.save(row, "create", cmd(repo, 1)),
      repo.save({ ...row, id: "missing" }, "update", cmd(repo, 1)),
      repo.remove("missing", cmd(repo, 1)),
    ]);
    const beforeB = await b.load();
    const settings = structuredClone(beforeB.snapshot.settings);
    settings.accounts.push({
      ...settings.accounts[0],
      id: "only-B",
      name: "Only B",
    });
    await b.saveSettings(settings, cmd(b, 1));
    const badReference = await Promise.allSettled([
      repo.save(
        { ...row, id: "cross-reference", accountId: "only-B" },
        "create",
        cmd(repo, 1),
      ),
    ]);
    const badSettings = structuredClone((await repo.load()).snapshot.settings);
    badSettings.accounts = badSettings.accounts.filter(
      (x) => x.id !== "principal",
    );
    const settingsError = await Promise.allSettled([
      repo.saveSettings(badSettings, cmd(repo, 1)),
    ]);
    return {
      imported,
      errors: errors.map((x) => x.status),
      badReference: badReference[0].status,
      settingsError: settingsError[0].status,
      final: await repo.load(),
      b: await b.load(),
    };
  });
  expect(result.imported.count).toBe(1);
  expect(result.errors).toEqual(["rejected", "rejected", "rejected"]);
  expect(result.badReference).toBe("rejected");
  expect(result.settingsError).toBe("rejected");
  expect(result.final.revision).toBe(1);
  expect(result.b.revision).toBe(2);
  expect(result.b.snapshot.transactions[0].id).toBe("shared-import");
});

for (const corrupt of [
  "authority",
  "workspace",
  "settings",
  "layout",
  "future",
] as const)
  test(`recovery ${corrupt}: fail closed, archive diagnostics only`, async ({
    page,
  }) => {
    await seedLocal(page, { ...backupFixture(), present: true });
    await promote(page);
    await page.evaluate(async (corrupt) => {
      const a = window.scopedAudit,
        id = window.repo.handle.workspaceId;
      if (corrupt === "layout" || corrupt === "future") {
        window.engine.close();
        await new Promise<void>((resolve, reject) => {
          const r = indexedDB.open("vertice-finance", 5);
          r.onupgradeneeded = () => {
            if (corrupt === "layout")
              r.result.deleteObjectStore("scopedSettings");
          };
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            r.result.close();
            resolve();
          };
        });
        return;
      }
      const tx = window.engine.scopedTransaction("readwrite"),
        done = a.transactionCompletion(tx).done;
      if (corrupt === "authority")
        tx.objectStore("workspaceMeta").put(
          { layout: "scoped", protocol: 2 },
          "authority",
        );
      if (corrupt === "workspace")
        tx.objectStore("workspaceMeta").delete(a.workspaceMetadataKey(id));
      if (corrupt === "settings") tx.objectStore("scopedSettings").delete(id);
      await done;
      window.engine.close();
    }, corrupt);
    const before = await rawDatabase(page);
    const error = await page.evaluate(async () => {
      try {
        await window.engine.open();
        return "BAD";
      } catch (e) {
        return (e as { code: string }).code;
      }
    });
    expect(error).toBe(
      corrupt === "authority"
        ? "invalid-authority"
        : corrupt === "workspace"
          ? "missing-workspace"
          : corrupt === "settings"
            ? "invalid-scoped-settings"
            : "unsupported-version",
    );
    expect(await rawDatabase(page)).toEqual(before);
    if (corrupt !== "layout" && corrupt !== "future")
      expect((await page.evaluate(() => window.engine.archive())).count).toBe(
        3,
      );
  });
