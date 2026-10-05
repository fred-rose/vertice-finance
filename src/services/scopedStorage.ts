import { defaultSettings } from "../data/catalog";
import { serializeBackup } from "../features/transactions/backup";
import type {
  FinanceSnapshot,
  FinanceSettings,
  Transaction,
} from "../types/finance";
import {
  WORKSPACE_STORES as S,
  WORKSPACE_INDEX,
  type WorkspaceId,
  type WorkspaceAuthority,
} from "../types/workspace";
import {
  workspaceAuthority,
  workspaceMetadata,
  workspaceId,
  workspaceMetadataKey,
  scopedEnvelope,
} from "../utils/workspace";
import {
  transactionRepository,
  closeLocalDatabaseForMigration,
  CONCURRENCY_KEY,
} from "./transactionRepository";
import {
  ScopedStorageError,
  storageError,
  sameRaw,
  rawSnapshot,
  legacyRevision,
  OpenAttempt,
  validateLayout,
  requestsReady,
  transactionCompletion,
} from "./scopedStorageProtocol";

const NAME = "vertice-finance";
const SCOPED = [S.transactions, S.settings, S.metadata];
const ALL = [...SCOPED, S.legacyTransactions, S.legacySettings];
export interface ScopedRead {
  workspaceId: WorkspaceId;
  revision: number;
  snapshot: FinanceSnapshot;
}
export interface MigrationPreflight {
  readonly sourceVersion: 0 | 3;
  readonly snapshot?: FinanceSnapshot;
  readonly revision?: number;
  readonly safetyJSON?: string;
}
interface LegacyRaw {
  snapshot: FinanceSnapshot;
  revision: number;
  keys: IDBValidKey[];
  values: unknown[];
}
function legacyRequests(tx: IDBTransaction) {
  const rows = tx.objectStore(S.legacyTransactions).getAll();
  const settings = tx.objectStore(S.legacySettings);
  const keys = settings.getAllKeys(),
    values = settings.getAll();
  return {
    requests: [rows, keys, values] as IDBRequest[],
    result(): LegacyRaw {
      const personal = keys.result.findIndex((key) => key === "personal");
      const revision = keys.result.findIndex((key) => key === CONCURRENCY_KEY);
      if (personal < 0 || revision < 0)
        throw new ScopedStorageError("invalid-snapshot");
      try {
        return {
          snapshot: rawSnapshot({
            transactions: rows.result as Transaction[],
            settings: values.result[personal] as FinanceSettings,
          }),
          revision: legacyRevision(values.result[revision]),
          keys: keys.result,
          values: values.result,
        };
      } catch (cause) {
        throw storageError(cause, "invalid-snapshot");
      }
    },
  };
}
function validateLegacyLayout(db: IDBDatabase, tx: IDBTransaction) {
  if (
    (db.version !== 3 && !(db.version === 4 && tx.mode === "versionchange")) ||
    !sameRaw(Array.from(db.objectStoreNames), ["settings", "transactions"]) ||
    tx.objectStore("transactions").keyPath !== "id" ||
    tx.objectStore("settings").keyPath !== null
  )
    throw new ScopedStorageError("invalid-layout");
  for (const name of [S.legacyTransactions, S.legacySettings]) {
    const store = tx.objectStore(name);
    if (store.autoIncrement || store.indexNames.length)
      throw new ScopedStorageError("invalid-layout");
  }
}
function envelope<T>(value: unknown, id: WorkspaceId): T {
  if (
    !value ||
    typeof value !== "object" ||
    !sameRaw(Object.keys(value).sort(), ["record", "workspaceId"]) ||
    !("workspaceId" in value) ||
    value.workspaceId !== id ||
    !("record" in value)
  )
    throw new ScopedStorageError("invalid-snapshot");
  return value.record as T;
}
export function scopedRequests(tx: IDBTransaction, id: WorkspaceId) {
  const metadata = tx.objectStore(S.metadata);
  const authority = metadata.get("authority"),
    meta = metadata.get(workspaceMetadataKey(id));
  const rows = tx
    .objectStore(S.transactions)
    .index(WORKSPACE_INDEX)
    .getAll(IDBKeyRange.only(id));
  const settings = tx.objectStore(S.settings).get(id);
  return {
    requests: [authority, meta, rows, settings] as IDBRequest[],
    result(): ScopedRead {
      try {
        workspaceAuthority(authority.result);
      } catch (cause) {
        throw new ScopedStorageError("invalid-authority", cause);
      }
      let info;
      try {
        info = workspaceMetadata(meta.result);
        if (info.workspaceId !== id) throw new Error("KEY_SCOPE");
      } catch (cause) {
        throw new ScopedStorageError("missing-workspace", cause);
      }
      let config: FinanceSettings;
      try {
        config = envelope<FinanceSettings>(settings.result, id);
        rawSnapshot({ transactions: [], settings: config });
      } catch (cause) {
        throw new ScopedStorageError("invalid-scoped-settings", cause);
      }
      const transactions = rows.result.map((row) =>
        envelope<Transaction>(row, id),
      );
      try {
        return {
          workspaceId: id,
          revision: info.revision,
          snapshot: rawSnapshot({ transactions, settings: config }),
        };
      } catch (cause) {
        throw new ScopedStorageError("invalid-snapshot", cause);
      }
    },
  };
}

// Explicit factory only. Construction has no IndexedDB side effect.
export function createScopedStorage() {
  let connection: IDBDatabase | undefined;
  let current: OpenAttempt | undefined;
  const safeties = new WeakMap<MigrationPreflight, LegacyRaw | null>();
  function cancel() {
    current?.cancel();
  }
  function close() {
    cancel();
    connection?.close();
    connection = undefined;
  }
  function probe(): Promise<number> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(NAME);
      let fresh = false,
        abandoned = false;
      request.onupgradeneeded = () => {
        fresh = true;
        request.transaction!.abort();
      };
      request.onblocked = () => {
        abandoned = true;
        reject(new ScopedStorageError("blocked"));
      };
      request.onerror = () =>
        fresh && !abandoned ? resolve(0) : reject(storageError(request.error));
      request.onsuccess = () => {
        const version = request.result.version;
        request.result.close();
        if (!abandoned) resolve(version);
      };
    });
  }
  function explicit(
    version: 3 | 4,
    attempt?: OpenAttempt,
    upgrade?: (
      db: IDBDatabase,
      tx: IDBTransaction,
      old: number,
      fail: (e: unknown) => void,
    ) => void,
  ): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(NAME, version);
      let failure: unknown,
        settled = false;
      const rejectOnce = (cause: unknown) => {
        if (!settled) {
          settled = true;
          reject(storageError(cause, "migration-aborted"));
        }
      };
      const usable = () => !attempt || attempt.usable(current);
      request.onblocked = () => {
        attempt?.cancel();
        rejectOnce(new ScopedStorageError("blocked"));
      };
      request.onupgradeneeded = (event) => {
        const tx = request.transaction!;
        tx.addEventListener("error", (event) => {
          failure ??= (event.target as IDBRequest).error;
        });
        const fail = (cause: unknown) => {
          failure = cause;
          tx.abort();
        };
        if (!usable() || !upgrade) {
          fail(new ScopedStorageError("migration-aborted"));
          return;
        }
        try {
          upgrade(request.result, tx, event.oldVersion, fail);
        } catch (cause) {
          fail(cause);
        }
      };
      request.onerror = () =>
        rejectOnce(
          failure ??
            storageError(
              request.error,
              request.error?.name === "VersionError"
                ? "unsupported-version"
                : "migration-aborted",
            ),
        );
      request.onsuccess = () => {
        const db = request.result;
        if (!usable() || settled) {
          db.close();
          rejectOnce(new ScopedStorageError("migration-aborted"));
          return;
        }
        db.onversionchange = () => {
          db.close();
          if (connection === db) connection = undefined;
        };
        settled = true;
        resolve(db);
      };
    });
  }
  async function preflight(): Promise<MigrationPreflight> {
    if (typeof crypto.randomUUID !== "function")
      throw new ScopedStorageError(
        "migration-aborted",
        new Error("UUID_UNAVAILABLE"),
      );
    const version = await probe();
    if (version > 4) throw new ScopedStorageError("unsupported-version");
    if (version === 4)
      throw new ScopedStorageError(
        "unsupported-version",
        new Error("USE_OPEN_EXISTING"),
      );
    if (version === 0) {
      const result = Object.freeze({ sourceVersion: 0 as const });
      safeties.set(result, null);
      return result;
    }
    if (version < 3) {
      // Exactly the production A2 migrator, with its own committed open(3).
      try {
        await transactionRepository.readForBackup();
      } finally {
        await closeLocalDatabaseForMigration();
      }
    }
    const db = await explicit(3);
    try {
      const tx = db.transaction([S.legacyTransactions, S.legacySettings]);
      const { done, abort } = transactionCompletion(tx);
      let raw!: LegacyRaw;
      try {
        validateLegacyLayout(db, tx);
        const read = legacyRequests(tx);
        requestsReady(
          read.requests,
          () => {
            raw = read.result();
          },
          abort,
        );
      } catch (cause) {
        abort(cause);
      }
      await done;
      const safetyJSON = serializeBackup(raw.snapshot);
      const result = Object.freeze({
        sourceVersion: 3 as const,
        snapshot: structuredClone(raw.snapshot),
        revision: raw.revision,
        safetyJSON,
      });
      safeties.set(result, raw);
      return result;
    } finally {
      db.close();
    }
  }
  function migrate(
    db: IDBDatabase,
    tx: IDBTransaction,
    old: number,
    safety: MigrationPreflight | undefined,
    attempt: OpenAttempt,
    fail: (cause: unknown) => void,
  ) {
    const check = () => {
      if (!attempt.usable(current))
        throw new ScopedStorageError("migration-aborted");
    };
    if (!safety || !safeties.has(safety) || old !== safety.sourceVersion)
      throw new ScopedStorageError("stale-safety");
    const expected = safeties.get(safety);
    const copy = (raw: LegacyRaw | null) => {
      check();
      if (
        raw &&
        (!expected ||
          raw.revision !== expected.revision ||
          !sameRaw(raw.snapshot, expected.snapshot) ||
          !sameRaw(raw.keys, expected.keys) ||
          !sameRaw(raw.values, expected.values))
      )
        throw new ScopedStorageError("stale-safety");
      const id = workspaceId(crypto.randomUUID());
      const snapshot = raw?.snapshot ?? {
        transactions: [],
        settings: defaultSettings(),
      };
      rawSnapshot(snapshot);
      const rows = db.createObjectStore(S.transactions, {
        keyPath: ["workspaceId", "record.id"],
      });
      rows.createIndex(WORKSPACE_INDEX, "workspaceId", { unique: false });
      const settings = db.createObjectStore(S.settings, {
        keyPath: "workspaceId",
      });
      const metadata = db.createObjectStore(S.metadata);
      const adds: IDBRequest[] = [
        settings.add(scopedEnvelope(id, snapshot.settings)),
      ];
      for (const row of snapshot.transactions)
        adds.push(rows.add(scopedEnvelope(id, row)));
      requestsReady(
        adds,
        () => {
          check();
          const count = rows.index(WORKSPACE_INDEX).count(IDBKeyRange.only(id));
          const config = settings.get(id);
          const byId = new Map(
            snapshot.transactions.map((row) => [row.id, row]),
          );
          let verified = 0,
            cursorDone = false,
            otherDone = false;
          const publish = () => {
            if (!cursorDone || !otherDone) return;
            check();
            if (
              verified !== snapshot.transactions.length ||
              count.result !== verified ||
              !sameRaw(envelope(config.result, id), snapshot.settings)
            )
              throw new ScopedStorageError(
                "migration-aborted",
                new Error("COPY_VERIFY"),
              );
            const meta = workspaceMetadata({
              workspaceId: id,
              mode: "personal",
              revision: raw?.revision ?? 0,
            });
            metadata.add(meta, workspaceMetadataKey(id));
            metadata.add(
              workspaceAuthority({
                layout: "scoped",
                protocol: 1,
                defaultWorkspaceId: id,
                sourceVersion: old,
              }),
              "authority",
            );
          };
          requestsReady(
            [count, config],
            () => {
              otherDone = true;
              publish();
            },
            fail,
          );
          const cursor = rows.openCursor();
          cursor.onsuccess = () => {
            try {
              check();
              const row = cursor.result;
              if (!row) {
                cursorDone = true;
                publish();
                return;
              }
              const value = envelope<Transaction>(row.value, id);
              if (
                !sameRaw(row.primaryKey, [id, value.id]) ||
                !sameRaw(value, byId.get(value.id))
              )
                throw new ScopedStorageError(
                  "migration-aborted",
                  new Error("ROW_VERIFY"),
                );
              verified++;
              row.continue();
            } catch (cause) {
              fail(cause);
            }
          };
        },
        fail,
      );
    };
    if (old === 0) {
      db.createObjectStore(S.legacyTransactions, { keyPath: "id" });
      db.createObjectStore(S.legacySettings);
      copy(null);
    } else if (old === 3) {
      validateLegacyLayout(db, tx);
      const read = legacyRequests(tx);
      requestsReady(read.requests, () => copy(read.result()), fail);
    } else throw new ScopedStorageError("unsupported-version");
  }
  async function read(id: WorkspaceId): Promise<ScopedRead> {
    const db = connection;
    if (!db) throw new ScopedStorageError("closed");
    const tx = db.transaction(SCOPED);
    const { done, abort } = transactionCompletion(tx);
    const requests = scopedRequests(tx, workspaceId(id));
    let result!: ScopedRead;
    requestsReady(
      requests.requests,
      () => {
        result = requests.result();
      },
      abort,
    );
    await done;
    return result;
  }
  async function validate(db: IDBDatabase): Promise<WorkspaceAuthority> {
    if (!sameRaw(Array.from(db.objectStoreNames).sort(), ALL.slice().sort()))
      throw new ScopedStorageError("invalid-layout");
    const tx = db.transaction(ALL);
    const { done, abort } = transactionCompletion(tx);
    let authority!: WorkspaceAuthority;
    try {
      validateLayout(db, tx);
      const manifest = tx.objectStore(S.metadata).get("authority");
      manifest.onsuccess = () => {
        try {
          try {
            authority = workspaceAuthority(manifest.result);
          } catch (cause) {
            throw new ScopedStorageError("invalid-authority", cause);
          }
          const currentRead = scopedRequests(tx, authority.defaultWorkspaceId);
          requestsReady(
            currentRead.requests,
            () => {
              const active = currentRead.result();
              if (authority.sourceVersion === 3) {
                const metadata = tx
                  .objectStore(S.legacySettings)
                  .get(CONCURRENCY_KEY);
                metadata.onsuccess = () => {
                  try {
                    const sourceRevision = legacyRevision(metadata.result);
                    if (active.revision < sourceRevision)
                      throw new ScopedStorageError("invalid-snapshot");
                    if (active.revision === sourceRevision) {
                      const legacy = legacyRequests(tx);
                      requestsReady(
                        legacy.requests,
                        () => {
                          if (
                            !sameRaw(active.snapshot, legacy.result().snapshot)
                          )
                            throw new ScopedStorageError("invalid-snapshot");
                        },
                        abort,
                      );
                    }
                  } catch (cause) {
                    abort(cause);
                  }
                };
              }
            },
            abort,
          );
          if (authority.sourceVersion === 0) {
            const a = tx.objectStore(S.legacyTransactions).count(),
              b = tx.objectStore(S.legacySettings).count();
            requestsReady(
              [a, b],
              () => {
                if (a.result || b.result)
                  throw new ScopedStorageError("invalid-layout");
              },
              abort,
            );
          }
        } catch (cause) {
          abort(cause);
        }
      };
    } catch (cause) {
      abort(cause);
    }
    await done;
    return authority;
  }
  async function open(
    safety?: MigrationPreflight,
  ): Promise<WorkspaceAuthority> {
    close();
    const attempt = new OpenAttempt();
    current = attempt;
    let db: IDBDatabase | undefined;
    try {
      db = await explicit(4, attempt, (database, tx, old, fail) =>
        migrate(database, tx, old, safety, attempt, fail),
      );
      db.close();
      db = await explicit(4, attempt);
      const authority = await validate(db);
      if (!attempt.usable(current))
        throw new ScopedStorageError("migration-aborted");
      connection = db;
      const initial = safeties.get(safety!);
      if (initial && authority.sourceVersion === 3) {
        const persisted = await read(authority.defaultWorkspaceId);
        if (
          persisted.revision < initial.revision ||
          (persisted.revision === initial.revision &&
            !sameRaw(persisted.snapshot, initial.snapshot))
        )
          throw new ScopedStorageError("invalid-snapshot");
      }
      return authority;
    } catch (cause) {
      db?.close();
      if (connection === db) connection = undefined;
      throw storageError(cause);
    }
  }
  // No legacy RW transaction can be requested through this engine.
  function scopedTransaction(mode: IDBTransactionMode = "readonly") {
    if (!connection) throw new ScopedStorageError("closed");
    return connection.transaction(SCOPED, mode);
  }
  async function archive() {
    const version = await probe();
    if (version !== 4) throw new ScopedStorageError("unsupported-version");
    const db = await explicit(4);
    try {
      const tx = db.transaction([S.legacyTransactions, S.legacySettings]);
      const { done } = transactionCompletion(tx);
      const rows = tx.objectStore(S.legacyTransactions).getAll();
      const keys = tx.objectStore(S.legacySettings).getAllKeys(),
        values = tx.objectStore(S.legacySettings).getAll();
      await done;
      const index = keys.result.findIndex((key) => key === CONCURRENCY_KEY);
      return {
        count: rows.result.length,
        revision: index < 0 ? null : legacyRevision(values.result[index]),
        transactions: rows.result,
        keys: keys.result,
        settings: values.result,
      };
    } finally {
      db.close();
    }
  }
  return Object.freeze({
    preflight,
    open,
    read,
    scopedTransaction,
    archive,
    cancel,
    close,
  });
}
export type ScopedStorage = ReturnType<typeof createScopedStorage>;
