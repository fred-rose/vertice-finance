import { chromium, expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir, cpus, totalmem, platform, release } from "node:os";
import { join } from "node:path";
import { scopedBundle, install, rawDatabase } from "./helpers/scopedData";
let bundle: string;
test.beforeAll(async () => {
  bundle = await scopedBundle();
});
async function seedLarge(page: import("@playwright/test").Page, n: number) {
  await page.evaluate(
    (n) =>
      new Promise<void>((resolve, reject) => {
        const a = window.scopedAudit,
          request = indexedDB.open("vertice-finance", 3);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("transactions", { keyPath: "id" });
          request.result.createObjectStore("settings");
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(["transactions", "settings"], "readwrite");
          const settings = a.defaultSettings();
          settings.accounts[0].initialBalance = 1e-8;
          tx.objectStore("settings").add(settings, "personal");
          tx.objectStore("settings").add(
            { protocol: 1, revision: 17 },
            "__vertice_local_concurrency__",
          );
          tx.objectStore("settings").add({ extra: ["archive", 1e-8] }, "other");
          const base = a.transaction({ amount: 999999999 });
          delete base.source;
          delete base.createdAt;
          for (let i = 0; i < n; i++)
            tx.objectStore("transactions").add({
              ...base,
              id: String(i).padStart(6, "0"),
              extra: { raw: 1e-8, order: ["é", "日", i] },
            });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    n,
  );
}

for (const count of [1000, 10000, 90072])
  test(`performance + raw integrity ${count}, overflow is migratable`, async ({
    page,
    context,
    browser,
  }, info) => {
    test.setTimeout(240000);
    await install(page, bundle);
    await seedLarge(page, count);
    const cdp = await context.newCDPSession(page);
    const heapBefore = await cdp.send("Runtime.getHeapUsage");
    let peakObserved = heapBefore.usedSize;
    const monitor = setInterval(() => {
      void cdp
        .send("Runtime.getHeapUsage")
        .then((heap) => {
          peakObserved = Math.max(peakObserved, heap.usedSize);
        })
        .catch(() => {});
    }, 100);
    try {
      const metrics = await page.evaluate(async (count) => {
        const a = window.scopedAudit,
          engine = a.createScopedStorage();
        const before = await navigator.storage.estimate();
        let last = performance.now(),
          maxGap = 0,
          ticks = 0;
        const timer = setInterval(() => {
          const now = performance.now();
          maxGap = Math.max(maxGap, now - last);
          last = now;
          ticks++;
        }, 50);
        const start = performance.now(),
          safety = await engine.preflight(),
          preflight = performance.now() - start;
        let copyStart = 0,
          copyEnd = 0,
          verifyStart = 0,
          verifyEnd = 0,
          manifestEnd = 0,
          committed = 0,
          reopenStart = 0,
          reopened = 0;
        const add = IDBObjectStore.prototype.add,
          cursor = IDBObjectStore.prototype.openCursor,
          open = indexedDB.open.bind(indexedDB);
        let copied = 0,
          opens = 0;
        IDBObjectStore.prototype.add = function (...args) {
          if (this.name === "scopedTransactions")
            copyStart ||= performance.now();
          const r = add.apply(this, args);
          if (this.name === "scopedTransactions")
            r.addEventListener("success", () => {
              if (++copied === count) copyEnd = performance.now();
            });
          if (this.name === "workspaceMeta" && args[1] === "authority")
            r.addEventListener("success", () => {
              manifestEnd = performance.now();
            });
          return r;
        };
        IDBObjectStore.prototype.openCursor = function (...args) {
          if (this.name === "scopedTransactions")
            verifyStart = performance.now();
          const r = cursor.apply(this, args);
          if (this.name === "scopedTransactions")
            r.addEventListener("success", () => {
              if (!r.result) verifyEnd = performance.now();
            });
          return r;
        };
        indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
          const sequence = args[1] === 4 ? ++opens : 0;
          if (sequence === 2) reopenStart = performance.now();
          const r = open(...args);
          if (sequence === 1)
            r.addEventListener("upgradeneeded", () =>
              r.transaction!.addEventListener("complete", () => {
                committed = performance.now();
              }),
            );
          if (sequence === 2)
            r.addEventListener("success", () => {
              reopened = performance.now();
            });
          return r;
        }) as IDBFactory["open"];
        let manifest;
        const migrationStart = performance.now();
        try {
          manifest = await engine.open(safety);
        } finally {
          IDBObjectStore.prototype.add = add;
          IDBObjectStore.prototype.openCursor = cursor;
          indexedDB.open = open;
        }
        const totalOpen = performance.now() - migrationStart;
        const readStart = performance.now(),
          read = await engine.read(manifest!.defaultWorkspaceId),
          firstRead = performance.now() - readStart;
        const archive = await engine.archive();
        const integrity =
          a.sameRaw(read.snapshot, safety.snapshot) &&
          a.sameRaw(read.snapshot.transactions, archive.transactions) &&
          read.revision === 17 &&
          read.snapshot.transactions.length === count;
        const after = await navigator.storage.estimate();
        clearInterval(timer);
        engine.close();
        return {
          count,
          integrity,
          preflightMs: preflight,
          copyMs: copyEnd - copyStart,
          verifyMs: verifyEnd - verifyStart,
          commitMs: committed - manifestEnd,
          reopenMs: reopened - reopenStart,
          firstReadMs: firstRead,
          totalOpenMs: totalOpen,
          storageBefore: before,
          storageAfter: after,
          ticks,
          maxObservedMainThreadGapMs: maxGap,
          userAgent: navigator.userAgent,
        };
      }, count);
      expect(metrics.integrity).toBe(true);
      expect(metrics.copyMs).toBeGreaterThan(0);
      expect(metrics.verifyMs).toBeGreaterThan(0);
      expect(metrics.commitMs).toBeGreaterThanOrEqual(0);
      const heapAfter = await cdp.send("Runtime.getHeapUsage");
      const evidence = {
        ...metrics,
        heapBefore,
        heapAfter,
        peakSampledUsedHeapBytes: peakObserved,
        browser: browser.version(),
        machine: {
          cpu: cpus()[0].model,
          logicalCPUs: cpus().length,
          physicalMemoryBytes: totalmem(),
          platform: platform(),
          release: release(),
        },
        limits:
          "Sampled V8 heap, not physical RSS peak; storage estimate is approximate. No latency budget invented.",
      };
      console.log("B2B_PERFORMANCE " + JSON.stringify(evidence));
      await info.attach(`performance-${count}`, {
        body: JSON.stringify(evidence, null, 2),
        contentType: "application/json",
      });
    } finally {
      clearInterval(monitor);
      await cdp.detach();
    }
  });

for (const boundary of ["during-copy", "after-commit"] as const)
  test(`real context teardown ${boundary}, restart SAME persistent temporary profile`, async ({
    baseURL,
  }, info) => {
    test.setTimeout(120000);
    const profile = await mkdtemp(join(tmpdir(), "vertice-b2b-crash-"));
    let context = await chromium.launchPersistentContext(profile, {
      channel: "msedge",
      headless: true,
      baseURL,
    });
    let pending: Promise<unknown> | undefined;
    try {
      let page = await context.newPage();
      await install(page, bundle);
      await seedLarge(page, 10000);
      await page.evaluate(async () => {
        window.engine = window.scopedAudit.createScopedStorage();
        window.safety = await window.engine.preflight();
      });
      if (boundary === "during-copy") {
        await page.evaluate(() => {
          const add = IDBObjectStore.prototype.add;
          IDBObjectStore.prototype.add = function (...args) {
            const r = add.apply(this, args);
            if (this.name === "scopedTransactions")
              r.addEventListener("success", () => {
                if (
                  document.documentElement.getAttribute("data-crash-boundary")
                )
                  return;
                document.documentElement.setAttribute(
                  "data-crash-boundary",
                  "copy-request-success",
                );
                const tx = this.transaction;
                const keepAlive = () => {
                  const read = tx.objectStore("settings").get("personal");
                  read.onsuccess = keepAlive;
                };
                keepAlive();
              });
            return r;
          };
        });
        pending = page
          .evaluate(() => window.engine.open(window.safety))
          .catch(() => "context-closed");
        await page.waitForFunction(
          () =>
            document.documentElement.getAttribute("data-crash-boundary") ===
            "copy-request-success",
        );
      } else await page.evaluate(() => window.engine.open(window.safety));
      await context.close();
      await pending;
      context = await chromium.launchPersistentContext(profile, {
        channel: "msedge",
        headless: true,
        baseURL,
      });
      page = await context.newPage();
      await install(page, bundle);
      const raw = await rawDatabase(page);
      expect(raw.version).toBe(boundary === "during-copy" ? 3 : 4);
      expect(raw.transactions).toHaveLength(10000);
      expect((raw.settings as unknown[]).length).toBe(3);
      if (boundary === "during-copy")
        expect(raw.names).toEqual(["settings", "transactions"]);
      else {
        const check = await page.evaluate(async () => {
          const a = window.scopedAudit,
            engine = a.createScopedStorage(),
            manifest = await engine.open(),
            read = await engine.read(manifest.defaultWorkspaceId),
            archive = await engine.archive();
          engine.close();
          return {
            rawEqual: a.sameRaw(
              read.snapshot.transactions,
              archive.transactions,
            ),
            revision: read.revision,
            count: read.snapshot.transactions.length,
          };
        });
        expect(check).toEqual({ rawEqual: true, revision: 17, count: 10000 });
      }
      await info.attach("real-context-restart", {
        body: JSON.stringify({
          boundary,
          profile,
          restartedSameProfile: true,
          version: raw.version,
          count: 10000,
          limit:
            "Actual context teardown; no OS power-loss or physical disk failure simulated.",
        }),
        contentType: "application/json",
      });
    } finally {
      await context.close();
    }
  });
