import { expect, test } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import { seedLocal, rawDatabase, migrateApp } from "./helpers/b2cData";
import { oldBundle, oldArtifactDirectory } from "./helpers/scopedData";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
let old: string;
test.beforeAll(() => {
  old = oldBundle();
});
async function rejectedWriters(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const a = window.financeAudit,
      r = a.transactionRepository,
      s = a.backupFixture();
    const errors = [];
    const runs = [
      () => r.load(),
      () => r.save(a.transaction(), { kind: "create", expectedRevision: 0 }),
      () => r.remove(s.transactions[0].id, 0),
      () => r.import([a.transaction()], false, 0),
      () => r.saveSettings(s.settings, 0),
      () => r.removeDemo(0),
      () => r.restore(s, { snapshot: s, revision: 0 }),
    ];
    for (const run of runs) {
      try {
        await run();
        errors.push("BAD");
      } catch (error) {
        let e: unknown = error,
          found = false;
        for (let i = 0; e && typeof e === "object" && i < 8; i++) {
          if ((e as Error).name === "VersionError") found = true;
          e = (e as Error).cause;
        }
        errors.push(found ? "VersionError" : "OTHER");
      }
    }
    return errors;
  });
}
test("App B2c promotion fences actual 0157797 every writer, old tab and reload, BC absent", async ({
  page,
  context,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(window, "BroadcastChannel", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.goto("/favicon.svg");
  await seedLocal(page, { ...backupFixture(), present: true });
  const previous = await context.newPage();
  await previous.goto("/favicon.svg");
  await previous.evaluate((code) => (0, eval)(code), old);
  await previous.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  await page.goto("/");
  await migrateApp(page);
  const before = await rawDatabase(page);
  expect(await rejectedWriters(previous)).toEqual(
    Array(7).fill("VersionError"),
  );
  expect(await rawDatabase(page)).toEqual(before);
  await previous.reload();
  await previous.evaluate((code) => (0, eval)(code), old);
  expect(await rejectedWriters(previous)).toEqual(
    Array(7).fill("VersionError"),
  );
  expect(await rawDatabase(page)).toEqual(before);
});
test("actual historical SW/assets remain fenced after App B2c promotion and offline reload", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const oldDist = resolve(oldArtifactDirectory(), "dist"),
    newDist = resolve("dist");
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
  };
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url ?? "/", "http://localhost").pathname,
    );
    const newHTML = pathname === "/new.html";
    const relative =
      pathname === "/" ? "/index.html" : newHTML ? "/index.html" : pathname;
    const roots = newHTML ? [newDist] : [oldDist, newDist];
    for (const root of roots) {
      const file = resolve(root, "." + relative);
      if (
        (file.startsWith(root + "\\") || file.startsWith(root + "/")) &&
        existsSync(file)
      ) {
        res
          .writeHead(200, {
            "Content-Type": mime[extname(file)] ?? "application/octet-stream",
            "Service-Worker-Allowed": "/",
            "Cache-Control": "no-store",
          })
          .end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("server");
  const origin = "http://127.0.0.1:" + address.port;
  try {
    await context.addInitScript(() =>
      Object.defineProperty(window, "BroadcastChannel", {
        value: undefined,
        configurable: true,
      }),
    );
    await page.goto(origin + "/favicon.svg");
    await seedLocal(page, { ...backupFixture(), present: true });
    const previous = await context.newPage();
    await previous.goto(origin);
    await expect(
      previous.getByRole("heading", { name: "Visão geral.", exact: true }),
    ).toBeVisible();
    await previous.evaluate(() => navigator.serviceWorker.ready);
    await previous.reload();
    await expect
      .poll(() => previous.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await previous.evaluate((code) => (0, eval)(code), old);
    await previous.evaluate(() =>
      window.financeAudit.transactionRepository.load(),
    );
    await page.goto(origin + "/new.html");
    await migrateApp(page);
    const before = await rawDatabase(page);
    expect(await rejectedWriters(previous)).toEqual(
      Array(7).fill("VersionError"),
    );
    await context.setOffline(true);
    await previous.reload();
    await expect(
      previous.getByText("Não foi possível acessar os dados locais", {
        exact: false,
      }),
    ).toBeVisible();
    await previous.evaluate((code) => (0, eval)(code), old);
    expect(await rejectedWriters(previous)).toEqual(
      Array(7).fill("VersionError"),
    );
    await context.setOffline(false);
    expect(await rawDatabase(page)).toEqual(before);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
