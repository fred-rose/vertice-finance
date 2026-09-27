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
  await page.evaluate(
    (state) =>
      new Promise<void>((resolve, reject) => {
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
      }),
    state,
  );
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
