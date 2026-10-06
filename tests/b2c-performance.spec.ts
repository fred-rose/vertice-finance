import { expect, test } from "@playwright/test";
import { cpus, totalmem, platform, release } from "node:os";
import { b2cBundle, rawDatabase } from "./helpers/b2cData";
let bundle: string;
test.beforeAll(async () => {
  bundle = await b2cBundle();
});
for (const count of [1000, 10000, 90072])
  test(
    "App integrated performance " + count + " (3 repetitions)",
    async ({ browser, baseURL }, info) => {
      test.setTimeout(300000);
      const runs = [];
      for (let run = 0; run < 3; run++) {
        const context = await browser.newContext({ baseURL });
        const page = await context.newPage();
        try {
          await page.clock.setFixedTime(new Date("2026-09-15T15:00:00Z"));
          await page.goto("/favicon.svg");
          await page.evaluate((code) => (0, eval)(code), bundle);
          await page.evaluate(
            (n) =>
              new Promise<void>((resolve, reject) => {
                const a = window.b2cAudit,
                  r = indexedDB.open("vertice-finance", 3);
                r.onupgradeneeded = () => {
                  const rows = r.result.createObjectStore("transactions", {
                      keyPath: "id",
                    }),
                    settings = r.result.createObjectStore("settings");
                  settings.add(a.defaultSettings(), "personal");
                  settings.add(
                    { protocol: 1, revision: 17 },
                    "__vertice_local_concurrency__",
                  );
                  const row = a.transaction({ amount: 123.45000001 });
                  delete row.source;
                  delete row.createdAt;
                  for (let i = 0; i < n; i++)
                    rows.add({
                      ...row,
                      id: String(i).padStart(6, "0"),
                      extra: { raw: 1e-8 },
                    });
                };
                r.onerror = () => reject(r.error);
                r.onsuccess = () => {
                  r.result.close();
                  resolve();
                };
              }),
            count,
          );
          await page.addInitScript(() => {
            const w = window as unknown as { metrics: Record<string, number> };
            w.metrics = { start: performance.now(), gap: 0 };
            // App mounts the financial shell only after bootstrap has validated ready.
            // DOM observations measure publication/render; they are not CPU profiler spans.
            const observer = new MutationObserver(() => {
              if (!w.metrics.ready && document.querySelector(".page-heading"))
                w.metrics.ready = performance.now();
              if (
                !w.metrics.financial &&
                document.querySelector(".primary-metric,.welcome-panel")
              )
                w.metrics.financial = performance.now();
            });
            observer.observe(document, { subtree: true, childList: true });
            let last = performance.now();
            setInterval(() => {
              const now = performance.now();
              w.metrics.gap = Math.max(w.metrics.gap, now - last);
              last = now;
            }, 50);
            const open = indexedDB.open.bind(indexedDB);
            indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
              const r = open(...args);
              if (args[1] === 4 && !w.metrics.engineStart) {
                w.metrics.engineStart = performance.now();
                r.addEventListener("success", () => {
                  w.metrics.committed = performance.now();
                });
              }
              return r;
            }) as IDBFactory["open"];
          });
          const cdp = await context.newCDPSession(page);
          let peak = 0;
          const monitor = setInterval(() => {
            void cdp
              .send("Runtime.getHeapUsage")
              .then((h) => {
                peak = Math.max(peak, h.usedSize);
              })
              .catch(() => {});
          }, 100);
          try {
            await page.goto("/");
            await expect(
              page.getByRole("heading", {
                name: "Atualização dos dados locais",
                exact: true,
              }),
            ).toBeVisible({ timeout: 120000 });
            const screen = await page.evaluate(() => {
              const m = (
                window as unknown as { metrics: Record<string, number> }
              ).metrics;
              m.screen = performance.now();
              return m.screen;
            });
            const download = page.waitForEvent("download");
            await page
              .getByRole("button", {
                name: "Baixar cópia de segurança",
                exact: true,
              })
              .click();
            await download;
            await page
              .getByLabel("Confirmei que guardei a cópia de segurança")
              .check();
            const promoted = await page.evaluate(() => performance.now());
            await page
              .getByRole("button", {
                name: "Atualizar dados locais",
                exact: true,
              })
              .click();
            await expect(page.locator(".page-heading")).toBeVisible({
              timeout: 120000,
            });
            await expect(
              page.getByText("Preparando sua visão financeira…"),
            ).toHaveCount(0, { timeout: 120000 });
            await expect(
              page.locator('[aria-label="Recuperação de dados locais"]'),
            ).toHaveCount(0);
            const metrics = await page.evaluate(() => ({
              ...(window as unknown as { metrics: Record<string, number> })
                .metrics,
              rendered: performance.now(),
            }));
            expect(Number.isFinite(metrics.ready)).toBe(true);
            expect(Number.isFinite(metrics.financial)).toBe(true);
            expect(metrics.financial).toBeGreaterThanOrEqual(metrics.ready);
            const raw = await rawDatabase(page);
            expect(raw.version).toBe(4);
            expect(raw.transactions).toHaveLength(count);
            expect(
              (raw.scopedTransactions as { record: unknown }[]).map(
                (r) => r.record,
              ),
            ).toEqual(raw.transactions);
            runs.push({
              run,
              startupToMigrationMs: screen - metrics.start,
              screenToRenderedMs: metrics.rendered - screen,
              promotionToRenderedMs: metrics.rendered - promoted,
              engineCommitMs: metrics.committed - metrics.engineStart,
              promotionToReadyMs: metrics.ready - promoted,
              readyToFinancialRenderMs: metrics.financial - metrics.ready,
              firstFinancialRenderMs: metrics.financial - metrics.start,
              afterCommitToRenderedMs: metrics.rendered - metrics.committed,
              peakSampledHeapBytes: peak,
              maxGapMs: metrics.gap,
            });
          } finally {
            clearInterval(monitor);
            await cdp.detach();
          }
        } finally {
          await context.close();
        }
      }
      const median = (key: keyof (typeof runs)[number]) =>
        runs.map((r) => r[key]).sort((a, b) => a - b)[1];
      const evidence = {
        count,
        runs,
        medianPromotionToRenderedMs: median("promotionToRenderedMs"),
        medianEngineCommitMs: median("engineCommitMs"),
        browser: browser.version(),
        machine: {
          cpu: cpus()[0].model,
          ram: totalmem(),
          platform: platform(),
          release: release(),
        },
        limits:
          "Includes UI scheduling and render; sampled V8 heap, not RSS; synthetic Edge desktop only. No interaction time budget promised.",
      };
      console.log("B2C_PERFORMANCE " + JSON.stringify(evidence));
      await info.attach("integrated-performance", {
        body: JSON.stringify(evidence, null, 2),
        contentType: "application/json",
      });
    },
  );
