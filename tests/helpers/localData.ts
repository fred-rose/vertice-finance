import type { Page } from "@playwright/test";
import { build } from "vite";
import { fileURLToPath } from "node:url";

export async function repositoryBundle() {
  const built = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL("./repositoryHarness.ts", import.meta.url),
        ),
        name: "financeAudit",
        formats: ["iife"],
      },
    },
  });
  const result = Array.isArray(built) ? built[0] : built;
  if (!("output" in result)) throw new Error("Bundle indisponível");
  const chunk = result.output.find((item) => item.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw new Error("Bundle indisponível");
  return chunk.code;
}

export async function uiRepositoryBundle() {
  const built = await build({
    configFile: false,
    logLevel: "silent",
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL("./uiRepositoryHarness.ts", import.meta.url),
        ),
        name: "financeAudit",
        formats: ["iife"],
      },
    },
  });
  const out = Array.isArray(built) ? built[0] : built;
  if (!("output" in out)) throw Error("build");
  const chunk = out.output.find((c) => c.type === "chunk");
  if (!chunk || chunk.type !== "chunk") throw Error("build");
  return chunk.code;
}
export interface RawFixture {
  transactions: unknown[];
  settings: unknown;
  present: boolean;
  includeOther?: boolean;
  databaseVersion?: 2 | 3;
  metadata?: unknown;
  metadataPresent?: boolean;
}

// Deliberate corruption is confined to each test's isolated browser context.
export async function seedLocal(page: Page, state: RawFixture) {
  await page.evaluate(async (state) => {
    const version = await new Promise<number>((resolve) => {
      const r = indexedDB.open("vertice-finance");
      r.onupgradeneeded = () => r.transaction!.abort();
      r.onerror = () => resolve(0);
      r.onsuccess = () => {
        const v = r.result.version;
        r.result.close();
        resolve(v);
      };
    });
    if (version === 4) {
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("vertice-finance", 4);
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction(
            ["scopedTransactions", "scopedSettings", "workspaceMeta"],
            "readwrite",
          );
          const m = tx.objectStore("workspaceMeta").get("authority");
          m.onsuccess = () => {
            const id = m.result.defaultWorkspaceId;
            tx.objectStore("workspaceMeta").delete(["restore", id]);
            const rows = tx.objectStore("scopedTransactions");
            const c = rows
              .index("byWorkspace")
              .openCursor(IDBKeyRange.only(id));
            c.onsuccess = () => {
              if (c.result) {
                c.result.delete();
                c.result.continue();
              } else {
                for (const record of state.transactions)
                  rows.add({ workspaceId: id, record });
                if (state.present)
                  tx.objectStore("scopedSettings").put({
                    workspaceId: id,
                    record: state.settings,
                  });
                else tx.objectStore("scopedSettings").delete(id);
                tx.objectStore("workspaceMeta").put(
                  {
                    workspaceId: id,
                    mode: "personal",
                    revision:
                      state.metadata === undefined
                        ? 0
                        : (state.metadata as { revision: number }).revision,
                  },
                  ["workspace", id],
                );
              }
            };
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
      return;
    }
    return new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(
        "vertice-finance",
        state.databaseVersion ?? 3,
      );
      open.onupgradeneeded = () => {
        open.result.createObjectStore("transactions", { keyPath: "id" });
        open.result.createObjectStore("settings");
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(["transactions", "settings"], "readwrite");
        const rows = tx.objectStore("transactions");
        const settings = tx.objectStore("settings");
        rows.clear();
        settings.clear();
        for (const row of state.transactions) rows.add(row);
        if (state.present) settings.put(state.settings, "personal");
        if (
          (state.databaseVersion ?? 3) === 3 &&
          state.metadataPresent !== false
        )
          settings.put(
            state.metadata === undefined
              ? { protocol: 1, revision: 0 }
              : state.metadata,
            "__vertice_local_concurrency__",
          );
        if (state.databaseVersion === 2 && state.metadataPresent === true)
          settings.put(state.metadata, "__vertice_local_concurrency__");
        if (state.includeOther !== false)
          settings.put({ preserved: true }, "other");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, state);
}

export async function rawLocal(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        transactions: unknown[];
        keys: IDBValidKey[];
        settings: unknown[];
      }>((resolve, reject) => {
        const open = indexedDB.open("vertice-finance");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (db.version === 4) {
            const tx = db.transaction([
              "workspaceMeta",
              "scopedTransactions",
              "scopedSettings",
              "settings",
            ]);
            const m = tx.objectStore("workspaceMeta").get("authority");
            let result: {
              transactions: unknown[];
              keys: IDBValidKey[];
              settings: unknown[];
            };
            m.onsuccess = () => {
              const id = m.result.defaultWorkspaceId;
              const rows = tx
                  .objectStore("scopedTransactions")
                  .index("byWorkspace")
                  .getAll(IDBKeyRange.only(id)),
                s = tx.objectStore("scopedSettings").get(id),
                meta = tx.objectStore("workspaceMeta").get(["workspace", id]),
                keys = tx.objectStore("settings").getAllKeys(),
                values = tx.objectStore("settings").getAll();
              values.onsuccess = () => {
                const k = keys.result;
                const v = values.result;
                const r = meta.result;
                const config = s.result;
                const personal = k.indexOf("personal");
                if (personal >= 0) {
                  if (config) v[personal] = config.record;
                  else {
                    v.splice(personal, 1);
                    k.splice(personal, 1);
                  }
                } else if (config) {
                  k.push("personal");
                  v.push(config.record);
                }
                const ci = k.indexOf("__vertice_local_concurrency__");
                if (ci >= 0) v[ci] = { protocol: 1, revision: r.revision };
                else {
                  k.push("__vertice_local_concurrency__");
                  v.push({ protocol: 1, revision: r.revision });
                }
                const pairs = k
                  .map((key, i) => ({ key, value: v[i] }))
                  .sort((a, b) => String(a.key).localeCompare(String(b.key)));
                result = {
                  transactions: rows.result.map((row) => row.record),
                  keys: pairs.map((x) => x.key),
                  settings: pairs.map((x) => x.value),
                };
              };
            };
            tx.oncomplete = () => {
              db.close();
              resolve(result);
            };
            tx.onabort = () => {
              db.close();
              reject(tx.error);
            };
            return;
          }
          const tx = db.transaction(["transactions", "settings"]);
          const rows = tx.objectStore("transactions").getAll();
          const keys = tx.objectStore("settings").getAllKeys();
          const settings = tx.objectStore("settings").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve({
              transactions: rows.result,
              keys: keys.result,
              settings: settings.result,
            });
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
  );
}
