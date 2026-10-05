import { build } from "vite";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import type * as api from "./scopedHarness";
import type {
  ScopedRead,
  ScopedStorage,
} from "../../src/services/scopedStorage";
import type { createScopedTransactionRepository } from "../../src/services/scopedTransactionRepository";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
declare global {
  interface Window {
    scopedAudit: typeof api;
    engine: ScopedStorage;
    repo: ReturnType<typeof createScopedTransactionRepository>;
    repoB: ReturnType<typeof createScopedTransactionRepository>;
    safety: Awaited<ReturnType<ScopedStorage["preflight"]>>;
    lastRead: ScopedRead;
    blocker: IDBDatabase;
  }
}
export async function scopedBundle() {
  const built = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL("./scopedHarness.ts", import.meta.url)),
        name: "scopedAudit",
        formats: ["iife"],
      },
    },
  });
  const result = Array.isArray(built) ? built[0] : built;
  if (!("output" in result)) throw Error("bundle");
  const chunk = result.output.find((c) => c.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw Error("bundle");
  return chunk.code;
}
export function oldArtifactDirectory() {
  const path = process.env.B2B_OLD_ARTIFACT;
  if (!path)
    throw Error(
      "Run node tests/helpers/buildHistoricalB2b.mjs and set B2B_OLD_ARTIFACT to its temporary output directory before E2E.",
    );
  return path;
}
export function oldBundle() {
  const path = oldArtifactDirectory();
  const code = readFileSync(path + "/old-writer.js", "utf8");
  const evidence = JSON.parse(
    readFileSync(path + "/artifact-evidence.json", "utf8"),
  );
  const sha = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");
  if (
    evidence.commit !== "0157797478ac27c8339444b604caaefd9e22dc95" ||
    sha(code) !== evidence.bundleSHA256 ||
    sha(readFileSync(path + "/package-lock.json")) !== evidence.lockfileSHA256
  )
    throw Error(
      "Invalid historical artifact. Run node tests/helpers/buildHistoricalB2b.mjs, then set B2B_OLD_ARTIFACT.",
    );
  return code;
}
export async function install(page: Page, bundle: string) {
  await page.goto("/favicon.svg");
  await page.evaluate((code) => (0, eval)(code), bundle);
}
export async function promote(page: Page) {
  return page.evaluate(async () => {
    const a = window.scopedAudit;
    window.engine = a.createScopedStorage();
    window.safety = await window.engine.preflight();
    const authority = await window.engine.open(window.safety);
    window.repo = a.createScopedTransactionRepository(
      window.engine,
      a.createScopedHandle(authority.defaultWorkspaceId),
    );
    return {
      authority,
      read: await window.repo.load(),
      archive: await window.engine.archive(),
    };
  });
}
export async function rawDatabase(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = indexedDB.open("vertice-finance");
        request.onupgradeneeded = () => request.transaction!.abort();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const names = Array.from(db.objectStoreNames);
          const tx = db.transaction(names);
          const result: Record<string, unknown> = {
            version: db.version,
            names,
          };
          for (const name of names) {
            const store = tx.objectStore(name);
            result[name + ".keyPath"] = store.keyPath;
            const keys = store.getAllKeys(),
              values = store.getAll();
            keys.onsuccess = () => {
              result[name + ".keys"] = keys.result;
            };
            values.onsuccess = () => {
              result[name] = values.result;
            };
          }
          tx.oncomplete = () => {
            db.close();
            resolve(result);
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}
export async function addB(page: Page, revision?: number) {
  return page.evaluate(async (revision) => {
    const a = window.scopedAudit,
      current = await window.repo.load();
    const id = a.workspaceId("22222222-2222-4222-8222-222222222222");
    const tx = window.engine.scopedTransaction("readwrite");
    const done = a.transactionCompletion(tx).done;
    tx.objectStore("workspaceMeta").add(
      {
        workspaceId: id,
        mode: "personal",
        revision: revision ?? current.revision,
      },
      a.workspaceMetadataKey(id),
    );
    tx.objectStore("scopedSettings").add(
      a.scopedEnvelope(id, current.snapshot.settings),
    );
    for (const row of current.snapshot.transactions)
      tx.objectStore("scopedTransactions").add(a.scopedEnvelope(id, row));
    await done;
    window.repoB = a.createScopedTransactionRepository(
      window.engine,
      a.createScopedHandle(id),
    );
    return window.repoB.load();
  }, revision);
}
