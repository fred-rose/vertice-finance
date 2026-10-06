import { expect, test } from "@playwright/test";
import { build } from "vite";
import { fileURLToPath } from "node:url";
declare global {
  interface Window {
    sessions: typeof import("./helpers/sessionHarness");
    driver: Awaited<
      ReturnType<typeof import("./helpers/sessionHarness").startSessionHarness>
    >;
    oldFinance: Window["driver"]["finance"];
  }
}
let bundle: string;
test.beforeAll(async () => {
  const r = await build({
    configFile: false,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL("./helpers/sessionHarness.tsx", import.meta.url),
        ),
        name: "sessions",
        formats: ["iife"],
      },
    },
  });
  const o = Array.isArray(r) ? r[0] : r;
  if (!("output" in o)) throw Error("build");
  const c = o.output.find((c) => c.type === "chunk");
  if (!c || c.type !== "chunk") throw Error("build");
  bundle = c.code;
});
test.beforeEach(async ({ page }) => {
  await page.route("**/b2c-session.html", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: '<html><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto("/b2c-session.html");
  await page.evaluate((code) => (0, eval)(code), bundle);
  await page.evaluate(async () => {
    window.driver = await window.sessions.startSessionHarness();
  });
  await expect(page.getByTestId("session-view")).not.toHaveText("loading");
});
test("A→B→A same revision rejects original hook callback and lease", async ({
  page,
}) => {
  const before = await page.evaluate(async () => ({
    a: await window.driver.raw(window.driver.a),
    b: await window.driver.raw(window.driver.b),
  }));
  await page.evaluate(() => {
    window.oldFinance = window.driver.finance;
    window.driver.switchTo(window.driver.b);
  });
  await expect(page.getByTestId("session-view")).toHaveText("12345");
  await page.evaluate(() => window.driver.switchTo(window.driver.a));
  await expect(page.getByTestId("session-view")).not.toHaveText("12345");
  expect(
    await page.evaluate(async () => {
      try {
        await window.oldFinance.importTransactions([], true, 0);
        return "BAD";
      } catch {
        return "rejected";
      }
    }),
  ).toBe("rejected");
  const after = await page.evaluate(async () => ({
    a: await window.driver.raw(window.driver.a),
    b: await window.driver.raw(window.driver.b),
  }));
  expect(after).toEqual(before);
});
test("focus response A1 released after B→A cannot publish snapshot/error into A2", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.driver.delayNext();
    window.dispatchEvent(new Event("focus"));
  });
  await expect
    .poll(() => page.evaluate(() => window.driver.waiting))
    .toBe(true);
  await page.evaluate(() => window.driver.switchTo(window.driver.b));
  await expect(page.getByTestId("session-view")).toHaveText("12345");
  await page.evaluate(() => window.driver.switchTo(window.driver.a));
  await expect(page.getByTestId("session-view")).not.toHaveText("loading");
  const before = await page.getByTestId("session-view").textContent();
  await page.evaluate(() => window.driver.release());
  await expect(page.getByTestId("session-view")).toHaveText(before!);
  expect(await page.evaluate(() => window.driver.finance.error)).toBeNull();
});
test("BC B changed/restored never reloads or invalidates A; matching focus reads authority", async ({
  page,
}) => {
  const reads = await page.evaluate(() => window.driver.reads);
  await page.evaluate(() => {
    const b = new BroadcastChannel("vertice-updates");
    b.postMessage({ workspaceId: window.driver.b, type: "changed" });
    b.postMessage({ workspaceId: window.driver.b, type: "restored" });
    b.close();
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.driver.reads)).toBe(reads);
  expect(await page.evaluate(() => window.driver.repo.handle.active)).toBe(
    true,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect
    .poll(() => page.evaluate(() => window.driver.reads))
    .toBeGreaterThan(reads);
});
test("restore A rotates lease while B financial state stays identical", async ({
  page,
}) => {
  const before = await page.evaluate(() => window.driver.raw(window.driver.b));
  await page.evaluate(async () => {
    window.oldFinance = window.driver.finance;
    const r = await window.oldFinance.readForBackup();
    await window.oldFinance.restoreBackup(r.snapshot, r);
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.driver.finance.repository.handle !==
          window.oldFinance.repository.handle,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => window.oldFinance.repository.handle.active),
  ).toBe(false);
  expect(await page.evaluate(() => window.driver.raw(window.driver.b))).toEqual(
    before,
  );
  await expect(page.getByTestId("session-view")).not.toHaveText("loading");
});

test("focus detects external restore with BC disabled and revokes the old captured lease", async ({
  page,
}) => {
  const before = await page.evaluate(() => window.driver.raw(window.driver.b));
  await page.evaluate(async () => {
    window.oldFinance = window.driver.finance;
    const r = await window.sessions.restoreExternally(window.driver.a);
    if (!r.restoreRevision) throw Error("missing restore receipt");
    window.dispatchEvent(new Event("focus"));
  });
  await expect
    .poll(() => page.evaluate(() => window.oldFinance.repository.handle.active))
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.driver.finance.repository.handle !==
          window.oldFinance.repository.handle,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(async () => {
      try {
        await window.oldFinance.importTransactions([], true, 1);
        return "BAD";
      } catch {
        return "rejected";
      }
    }),
  ).toBe("rejected");
  expect(await page.evaluate(() => window.driver.raw(window.driver.b))).toEqual(
    before,
  );
});
