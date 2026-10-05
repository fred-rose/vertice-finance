import { expect, test } from "@playwright/test";
import { backupFixture } from "./helpers/backupFixture";
import { seedLocal } from "./helpers/localData";
import {
  scopedBundle,
  oldBundle,
  oldArtifactDirectory,
  install,
  promote,
  rawDatabase,
} from "./helpers/scopedData";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createServer } from "node:http";
let bundle: string, historical: string;
test.beforeAll(async () => {
  bundle = await scopedBundle();
  historical = oldBundle();
});

test("real B1 0157797 all writer paths + reload fenced with BC disabled", async ({
  page,
  context,
}, info) => {
  await context.addInitScript(() => {
    Object.defineProperty(window, "BroadcastChannel", {
      value: undefined,
      configurable: true,
    });
  });
  await install(page, bundle);
  await seedLocal(page, {
    ...backupFixture(),
    present: true,
    metadata: { protocol: 1, revision: 17 },
  });
  const old = await context.newPage();
  await old.goto(new URL("/favicon.svg", page.url()).href);
  await old.evaluate((code) => (0, eval)(code), historical);
  const cached = await old.evaluate(() =>
    window.financeAudit.transactionRepository.load(),
  );
  expect(cached.revision).toBe(17);
  const checkpoint = oldArtifactDirectory();
  await info.attach("old-artifact", {
    body: readFileSync(checkpoint + "/artifact-evidence.json"),
    contentType: "application/json",
  });
  const promoted = await promote(page),
    before = await rawDatabase(page);
  const result = await old.evaluate(async (cached) => {
    const a = window.financeAudit,
      repo = a.transactionRepository;
    const operations = [
      () => repo.load(),
      () =>
        repo.save(a.transaction({ id: "old-write" }), {
          kind: "create",
          expectedRevision: cached.revision,
        }),
      () => repo.remove(cached.snapshot.transactions[0].id, cached.revision),
      () =>
        repo.import(
          [a.transaction({ id: "old-import" })],
          false,
          cached.revision,
        ),
      () => repo.saveSettings(cached.snapshot.settings, cached.revision),
      () => repo.removeDemo(cached.revision),
      () => repo.restore(cached.snapshot, cached),
    ];
    const outcomes = [];
    for (const run of operations) {
      try {
        await run();
        outcomes.push({ status: "BAD", causes: [] });
      } catch (error) {
        const causes: string[] = [];
        let e: unknown = error;
        for (let n = 0; e && typeof e === "object" && n < 8; n++) {
          causes.push((e as Error).name);
          e = (e as Error).cause;
        }
        outcomes.push({ status: "rejected", causes });
      }
    }
    return {
      outcomes,
      bc: typeof BroadcastChannel,
      explicitVersion: new Promise<string>((resolve) => {
        const r = indexedDB.open("vertice-finance", 3);
        r.onerror = () => resolve(r.error!.name);
        r.onsuccess = () => {
          r.result.close();
          resolve("BAD");
        };
      }),
    };
  }, cached);
  expect(result.bc).toBe("undefined");
  expect(result.outcomes).toHaveLength(7);
  for (const outcome of result.outcomes) {
    expect(outcome.status).toBe("rejected");
    expect(outcome.causes).toContain("VersionError");
  }
  expect(await rawDatabase(page)).toEqual(before);
  expect(promoted.authority.sourceVersion).toBe(3);
  await old.reload();
  await old.evaluate((code) => (0, eval)(code), historical);
  expect(
    await old.evaluate(async () => {
      try {
        await window.financeAudit.transactionRepository.load();
        return "BAD";
      } catch (e) {
        let cause: unknown = e;
        while (cause && typeof cause === "object") {
          if ((cause as Error).name === "VersionError") return "VersionError";
          cause = (cause as Error).cause;
        }
        return "OTHER";
      }
    }),
  ).toBe("VersionError");
  expect(await rawDatabase(page)).toEqual(before);
});

test("real historical App/assets/service worker keeps v3 fence after offline reload", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const checkpoint = oldArtifactDirectory();
  const dist = resolve(checkpoint, "dist");
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
    const target = resolve(
      dist,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (
      (!target.startsWith(dist + "\\") && !target.startsWith(dist + "/")) ||
      !existsSync(target)
    ) {
      response.writeHead(404).end();
      return;
    }
    const mime: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webmanifest": "application/manifest+json",
    };
    response
      .writeHead(200, {
        "Content-Type": mime[extname(target)] ?? "application/octet-stream",
        "Service-Worker-Allowed": "/",
        "Cache-Control": "no-store",
      })
      .end(readFileSync(target));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("old-server");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await context.addInitScript(() => {
      Object.defineProperty(window, "BroadcastChannel", {
        value: undefined,
        configurable: true,
      });
    });
    await page.goto(origin + "/favicon.svg");
    await page.evaluate((code) => (0, eval)(code), bundle);
    await seedLocal(page, { ...backupFixture(), present: true });
    const old = await context.newPage();
    await old.goto(origin);
    await expect(
      old.getByRole("heading", { name: "Visão geral.", exact: true }),
    ).toBeVisible();
    await old.evaluate(() => navigator.serviceWorker.ready);
    await old.reload();
    await expect
      .poll(() => old.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    const workerURL = await old.evaluate(
      () => navigator.serviceWorker.controller!.scriptURL,
    );
    expect(workerURL.endsWith("/sw.js")).toBe(true);
    await promote(page);
    const before = await rawDatabase(page);
    await context.setOffline(true);
    await old.reload();
    await expect(
      old.getByText("Não foi possível acessar os dados locais", {
        exact: false,
      }),
    ).toBeVisible();
    await old.evaluate((code) => (0, eval)(code), historical);
    expect(
      await old.evaluate(async () => {
        try {
          await window.financeAudit.transactionRepository.removeDemo(0);
          return "BAD";
        } catch {
          return "rejected";
        }
      }),
    ).toBe("rejected");
    await context.setOffline(false);
    expect(await rawDatabase(page)).toEqual(before);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("in-flight old RW drains before exclusive upgrade, stale safety aborts, confirmed row survives retry", async ({
  page,
}) => {
  await install(page, bundle);
  await seedLocal(page, { ...backupFixture(), present: true });
  const result = await page.evaluate(async () => {
    const a = window.scopedAudit,
      engine = a.createScopedStorage(),
      safety = await engine.preflight();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("vertice-finance", 3);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => resolve(r.result);
    });
    db.onversionchange = () => db.close();
    const tx = db.transaction(["transactions", "settings"], "readwrite");
    const done = a.transactionCompletion(tx).done;
    tx.objectStore("transactions").add(
      a.transaction({ id: "confirmed-inflight" }),
    );
    tx.objectStore("settings").put(
      { protocol: 1, revision: 1 },
      "__vertice_local_concurrency__",
    );
    let release = false;
    const keep = () => {
      const r = tx.objectStore("settings").get("personal");
      r.onsuccess = () => {
        if (!release) keep();
      };
    };
    keep();
    const request = engine.open(safety).catch((e) => e.code as string);
    await new Promise((resolve) => setTimeout(resolve, 50));
    release = true;
    await done;
    const failed = await request;
    const next = await engine.preflight(),
      manifest = await engine.open(next);
    const read = await engine.read(manifest.defaultWorkspaceId);
    let closed = "";
    try {
      db.transaction("transactions", "readwrite");
    } catch (e) {
      closed = (e as Error).name;
    }
    engine.close();
    return { failed, read, closed };
  });
  expect(result.failed).toBe("stale-safety");
  expect(result.read.revision).toBe(1);
  expect(
    result.read.snapshot.transactions.some(
      (row) => row.id === "confirmed-inflight",
    ),
  ).toBe(true);
  expect(result.closed).toBe("InvalidStateError");
});

test("sensitivity: versionless historical bundle ONLY in memory bypasses fence and archive detector catches it", async ({
  page,
  context,
}) => {
  await install(page, bundle);
  await seedLocal(page, { ...backupFixture(), present: true });
  await promote(page);
  const originalOpen =
    'indexedDB.open("vertice-finance", LOCAL_DATABASE_VERSION)';
  expect(historical.split(originalOpen)).toHaveLength(2);
  const sabotaged = historical.replace(
    originalOpen,
    'indexedDB.open("vertice-finance")',
  );
  const before = await rawDatabase(page),
    client = await context.newPage();
  await client.goto(new URL("/favicon.svg", page.url()).href);
  await client.evaluate((code) => (0, eval)(code), sabotaged);
  await client.evaluate(async () => {
    const a = window.financeAudit,
      read = await a.transactionRepository.load();
    await a.transactionRepository.save(
      a.transaction({ id: "arbitrary-versionless" }),
      { kind: "create", expectedRevision: read.revision },
    );
  });
  const after = await rawDatabase(page);
  expect(after.transactions).not.toEqual(before.transactions);
  expect(after.settings).not.toEqual(before.settings);
  expect(after.scopedTransactions).toEqual(before.scopedTransactions);
  expect(after.workspaceMeta).toEqual(before.workspaceMeta);
  expect(after.version).toBe(4);
});
