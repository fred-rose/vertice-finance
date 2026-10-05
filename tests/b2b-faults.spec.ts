import { expect, test } from "@playwright/test";
import { seedLocal } from "./helpers/localData";
import { backupFixture } from "./helpers/backupFixture";
import {
  scopedBundle,
  install,
  rawDatabase,
  promote,
} from "./helpers/scopedData";
let bundle: string;
test.beforeAll(async () => {
  bundle = await scopedBundle();
});
test.beforeEach(async ({ page }) => {
  await install(page, bundle);
});
for (const boundary of [
  "create",
  "first-add",
  "middle-add",
  "last-add",
  "last-request-error",
  "uncaught-add-callback",
  "after-copy",
  "verify",
  "metadata",
  "authority",
  "quota",
  "reopen",
  "first-read",
] as const)
  test(`fault ${boundary}: restart coherent authority`, async ({ page }) => {
    await seedLocal(page, {
      ...backupFixture(),
      present: true,
      metadata: { protocol: 1, revision: 17 },
    });
    const before = await rawDatabase(page);
    const result = await page.evaluate(async (boundary) => {
      const a = window.scopedAudit;
      window.engine = a.createScopedStorage();
      window.safety = await window.engine.preflight();
      const create = IDBDatabase.prototype.createObjectStore,
        add = IDBObjectStore.prototype.add,
        cursor = IDBObjectStore.prototype.openCursor,
        count = IDBIndex.prototype.count,
        open = indexedDB.open.bind(indexedDB),
        get = IDBObjectStore.prototype.get;
      let n = 0,
        authority = false,
        upgraded = false;
      let first: unknown;
      IDBDatabase.prototype.createObjectStore = function (...args) {
        if (boundary === "create" && args[0] === "scopedTransactions")
          throw Error("BEFORE_CREATE");
        return create.apply(this, args);
      };
      IDBObjectStore.prototype.add = function (...args) {
        if (this.name === "scopedTransactions") {
          n++;
          first ??= args[0];
          if (
            (boundary === "first-add" && n === 1) ||
            (boundary === "middle-add" && n === 2) ||
            (boundary === "last-add" && n === 3)
          )
            throw Error("COPY_ADD");
          if (boundary === "last-request-error" && n === 3)
            return add.call(this, first);
          if (boundary === "quota" && n === 2)
            throw new DOMException("test quota", "QuotaExceededError");
        }
        if (this.name === "workspaceMeta") {
          if (
            boundary === "metadata" ||
            (boundary === "authority" && args[1] === "authority")
          )
            throw Error("METADATA");
          if (args[1] === "authority") authority = true;
        }
        const request = add.apply(this, args);
        if (
          this.name === "scopedTransactions" &&
          boundary === "uncaught-add-callback" &&
          n === 2
        )
          request.addEventListener("success", () => {
            throw Error("UNCAUGHT_REQUEST_EVENT");
          });
        return request;
      };
      IDBIndex.prototype.count = function (...args) {
        if (
          boundary === "after-copy" &&
          this.objectStore.name === "scopedTransactions"
        )
          throw Error("AFTER_COPY");
        return count.apply(this, args);
      };
      IDBObjectStore.prototype.openCursor = function (...args) {
        const request = cursor.apply(this, args);
        if (boundary === "verify" && this.name === "scopedTransactions")
          request.addEventListener("success", () => {
            if (request.result)
              request.result.value.record.extraTampered = true;
          });
        return request;
      };
      indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
        if (args[1] === 4) {
          if (upgraded && boundary === "reopen") throw Error("REOPEN");
          upgraded = true;
        }
        return open(...args);
      }) as IDBFactory["open"];
      IDBObjectStore.prototype.get = function (...args) {
        if (
          authority &&
          this.transaction.mode === "readonly" &&
          boundary === "first-read"
        )
          throw Error("FIRST_READ");
        return get.apply(this, args);
      };
      let error = "",
        cause = "";
      try {
        await window.engine.open(window.safety);
      } catch (e) {
        error = (e as { code: string }).code;
        cause = ((e as Error).cause as Error)?.name;
      } finally {
        IDBDatabase.prototype.createObjectStore = create;
        IDBObjectStore.prototype.add = add;
        IDBObjectStore.prototype.openCursor = cursor;
        IDBIndex.prototype.count = count;
        indexedDB.open = open;
        IDBObjectStore.prototype.get = get;
        window.engine.close();
      }
      return { error, cause, authority, n };
    }, boundary);
    expect(result.error).toBeTruthy();
    const committed = boundary === "reopen" || boundary === "first-read";
    await install(page, bundle);
    const after = await rawDatabase(page);
    if (!committed) {
      expect(after).toEqual(before);
      if (boundary === "quota") expect(result.error).toBe("quota");
    } else {
      expect(after.version).toBe(4);
      const read = await page.evaluate(async () => {
        window.engine = window.scopedAudit.createScopedStorage();
        const manifest = await window.engine.open();
        return window.engine.read(manifest.defaultWorkspaceId);
      });
      expect(read.revision).toBe(17);
      expect(read.snapshot.transactions).toEqual(before.transactions);
    }
  });

test("copy success barrier + full raw verify precede both metadata requests", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const sequence = await page.evaluate(async () => {
    const events: string[] = [],
      add = IDBObjectStore.prototype.add,
      cursor = IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "workspaceMeta") events.push("metadata-enqueue");
      const r = add.apply(this, args);
      if (this.name === "scopedTransactions" || this.name === "scopedSettings")
        r.addEventListener("success", () => events.push("copy-success"));
      return r;
    };
    IDBObjectStore.prototype.openCursor = function (...args) {
      if (this.name === "scopedTransactions") events.push("verify-start");
      const r = cursor.apply(this, args);
      if (this.name === "scopedTransactions")
        r.addEventListener("success", () => {
          if (!r.result) events.push("verify-complete");
        });
      return r;
    };
    try {
      const engine = window.scopedAudit.createScopedStorage();
      await engine.open(await engine.preflight());
      engine.close();
    } finally {
      IDBObjectStore.prototype.add = add;
      IDBObjectStore.prototype.openCursor = cursor;
    }
    return events;
  });
  expect(sequence.filter((x) => x === "copy-success")).toHaveLength(4);
  expect(sequence.indexOf("verify-start")).toBeGreaterThan(
    sequence.lastIndexOf("copy-success"),
  );
  expect(sequence.indexOf("metadata-enqueue")).toBeGreaterThan(
    sequence.indexOf("verify-complete"),
  );
});

test("new retry identity survives abandoned request errors", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit;
    window.engine = a.createScopedStorage();
    window.safety = await window.engine.preflight();
    await new Promise<void>((resolve) => {
      const r = indexedDB.open("vertice-finance", 3);
      r.onsuccess = () => {
        window.blocker = r.result;
        resolve();
      };
    });
    let blocked = "";
    try {
      await window.engine.open(window.safety);
    } catch (e) {
      blocked = (e as { code: string }).code;
    }
    const retry = window.engine.open(window.safety);
    window.blocker.close();
    const manifest = await retry;
    return {
      blocked,
      manifest,
      read: await window.engine.read(manifest.defaultWorkspaceId),
    };
  });
  expect(result.blocked).toBe("blocked");
  expect(result.read.revision).toBe(0);
});

test("invalid v4 layout (still version 4) never repairs from valid archive", async ({
  page,
}) => {
  const fixture = backupFixture();
  await seedLocal(page, { ...fixture, present: true });
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("vertice-finance", 4);
        r.onupgradeneeded = () => {
          const db = r.result;
          db.createObjectStore("scopedTransactions", {
            keyPath: ["workspaceId", "transactionId"],
          });
          db.createObjectStore("scopedSettings", { keyPath: "workspaceId" });
          db.createObjectStore("workspaceMeta");
        };
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          r.result.close();
          resolve();
        };
      }),
  );
  const before = await rawDatabase(page);
  expect(
    await page.evaluate(async () => {
      window.engine = window.scopedAudit.createScopedStorage();
      try {
        await window.engine.open();
        return "BAD";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }),
  ).toBe("invalid-layout");
  expect(await rawDatabase(page)).toEqual(before);
  expect((await page.evaluate(() => window.engine.archive())).count).toBe(3);
});

test("source invalid preflight preserves version/data instead of fabricating defaults", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: false });
  const before = await rawDatabase(page);
  expect(
    await page.evaluate(async () => {
      try {
        await window.scopedAudit.createScopedStorage().preflight();
        return "BAD";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }),
  ).toBe("invalid-snapshot");
  expect(await rawDatabase(page)).toEqual(before);
});

test("cancelled late success closes its result without caching; explicit retry succeeds", async ({
  page,
}) => {
  await promote(page);
  const before = await rawDatabase(page);
  const result = await page.evaluate(async () => {
    const previous = await window.repo.load();
    const opening = window.engine.open();
    window.engine.cancel();
    let error = "",
      readError = "";
    try {
      await opening;
    } catch (e) {
      error = (e as { code: string }).code;
    }
    try {
      await window.engine.read(previous.workspaceId);
    } catch (e) {
      readError = (e as { code: string }).code;
    }
    const retry = await window.engine.open();
    return { error, readError, retry, previous };
  });
  expect(result.error).toBe("migration-aborted");
  expect(result.readError).toBe("closed");
  expect(result.retry.defaultWorkspaceId).toBe(result.previous.workspaceId);
  expect(await rawDatabase(page)).toEqual(before);
});

test("cancel during copy callbacks aborts before verify/authority", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const before = await rawDatabase(page);
  const result = await page.evaluate(async () => {
    window.engine = window.scopedAudit.createScopedStorage();
    window.safety = await window.engine.preflight();
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      const request = add.apply(this, args);
      if (this.name === "scopedTransactions")
        request.addEventListener("success", () => window.engine.cancel());
      return request;
    };
    try {
      await window.engine.open(window.safety);
      return "BAD";
    } catch (e) {
      return (e as { code: string }).code;
    } finally {
      IDBObjectStore.prototype.add = add;
    }
  });
  expect(result).toBe("migration-aborted");
  expect(await rawDatabase(page)).toEqual(before);
});

test("missing store in committed v4 is classified as invalid layout, not silently recreated", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("vertice-finance", 4);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          r.result.close();
          resolve();
        };
      }),
  );
  const before = await rawDatabase(page);
  expect(
    await page.evaluate(async () => {
      try {
        await window.scopedAudit.createScopedStorage().open();
        return "BAD";
      } catch (e) {
        return (e as { code: string }).code;
      }
    }),
  ).toBe("invalid-layout");
  expect(await rawDatabase(page)).toEqual(before);
});

for (const fault of [
  "financial-row",
  "legacy-index",
  "auto-increment",
] as const)
  test(`preflight rejects ${fault} without promoting or normalizing`, async ({
    page,
  }) => {
    await page.evaluate(
      (fault) =>
        new Promise<void>((resolve, reject) => {
          const a = window.scopedAudit,
            r = indexedDB.open("vertice-finance", 3);
          r.onupgradeneeded = () => {
            const store = r.result.createObjectStore("transactions", {
              keyPath: "id",
              autoIncrement: fault === "auto-increment",
            });
            if (fault === "legacy-index")
              store.createIndex("unexpected", "date");
            const settings = r.result.createObjectStore("settings");
            settings.add(a.defaultSettings(), "personal");
            settings.add(
              { protocol: 1, revision: 0 },
              "__vertice_local_concurrency__",
            );
            store.add(
              a.transaction({
                id: "invalid",
                amount: fault === "financial-row" ? 0 : 1,
              }),
            );
          };
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            r.result.close();
            resolve();
          };
        }),
      fault,
    );
    const before = await rawDatabase(page);
    expect(
      await page.evaluate(async () => {
        try {
          await window.scopedAudit.createScopedStorage().preflight();
          return "BAD";
        } catch (e) {
          return (e as { code: string }).code;
        }
      }),
    ).toBe(fault === "financial-row" ? "invalid-snapshot" : "invalid-layout");
    expect(await rawDatabase(page)).toEqual(before);
  });

test("sensitivity: removing ONLY restore cursor range in isolated harness makes B preservation detector fail", async ({
  page,
}) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  await promote(page);
  const { addB } = await import("./helpers/scopedData");
  const b = await addB(page);
  const after = await page.evaluate(async () => {
    const current = await window.repo.load(),
      openCursor = IDBIndex.prototype.openCursor;
    IDBIndex.prototype.openCursor = function (...args) {
      if (
        this.name === "byWorkspace" &&
        this.objectStore.transaction.mode === "readwrite"
      )
        return openCursor.call(this);
      return openCursor.apply(this, args);
    };
    try {
      await window.repo.restore(
        { transactions: [], settings: current.snapshot.settings },
        current,
        {
          lease: window.repo.handle.lease,
          precondition: {
            workspaceId: current.workspaceId,
            expectedRevision: current.revision,
          },
        },
      );
    } finally {
      IDBIndex.prototype.openCursor = openCursor;
    }
    return window.repoB.load();
  });
  expect(after).not.toEqual(b);
  expect(after.snapshot.transactions).toEqual([]);
  expect(after.revision).toBe(b.revision);
});

test("backup safety file is observed, re-read, restored into an isolated context", async ({
  page,
  browser,
}, info) => {
  await seedLocal(page, { ...backupFixture(), present: true });
  const before = await rawDatabase(page);
  const pending = page.waitForEvent("download");
  await page.evaluate(async () => {
    window.engine = window.scopedAudit.createScopedStorage();
    window.safety = await window.engine.preflight();
    const url = URL.createObjectURL(
      new Blob([window.safety.safetyJSON!], { type: "application/json" }),
    );
    const link = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "a",
    ) as HTMLAnchorElement;
    link.href = url;
    link.download = "safety-v2.json";
    document.documentElement.append(link);
    link.click();
  });
  const download = await pending,
    file = info.outputPath("safety-v2.json");
  await download.saveAs(file);
  const { readFile } = await import("node:fs/promises");
  const json = await readFile(file, "utf8");
  const origin = new URL(page.url()).origin,
    context = await browser.newContext({ baseURL: origin });
  try {
    const target = await context.newPage();
    await install(target, bundle);
    await target.goto(origin + "/favicon.svg");
    await target.evaluate((code) => (0, eval)(code), bundle);
    await promote(target);
    const restored = await target.evaluate(async (json) => {
      const a = window.scopedAudit,
        current = await window.repo.load();
      return window.repo.restore(a.parseBackup(json), current, {
        lease: window.repo.handle.lease,
        precondition: {
          workspaceId: current.workspaceId,
          expectedRevision: current.revision,
        },
      });
    }, json);
    expect(restored.snapshot.settings).toEqual(JSON.parse(json).settings);
    expect(restored.snapshot.transactions).toEqual(
      JSON.parse(json).transactions,
    );
    expect(await rawDatabase(page)).toEqual(before);
  } finally {
    await context.close();
  }
});
