import type {
  FinanceSettings,
  FinanceSnapshot,
  Transaction,
} from "../types/finance";
import { defaultSettings } from "../data/catalog";
import {
  sameBackupSnapshot,
  validateBackupSnapshot,
} from "../features/transactions/backup";
import {
  transactionSignature,
  validateSettings,
  validateTransaction,
} from "../features/transactions/validation";
export const LOCAL_DATABASE_VERSION = 3;
export const CONCURRENCY_KEY = "__vertice_local_concurrency__";
export interface LocalRead {
  snapshot: FinanceSnapshot;
  revision: number;
}
export interface WriteReceipt {
  revision: number;
}
export interface SaveIntent {
  kind: "create" | "update";
  expectedRevision: number;
}
export interface TransactionRepository {
  load(): Promise<LocalRead>;
  readForBackup(): Promise<LocalRead>;
  restore(snapshot: FinanceSnapshot, safety: LocalRead): Promise<LocalRead>;
  save(transaction: Transaction, intent: SaveIntent): Promise<WriteReceipt>;
  remove(id: string, expectedRevision: number): Promise<WriteReceipt>;
  import(
    items: Transaction[],
    skipDuplicates: boolean,
    expectedRevision: number,
  ): Promise<WriteReceipt & { count: number }>;
  saveSettings(
    settings: FinanceSettings,
    expectedRevision: number,
  ): Promise<WriteReceipt>;
  removeDemo(expectedRevision: number): Promise<WriteReceipt>;
}
export class LocalConflictError extends Error {
  readonly code = "stale-state";
  constructor() {
    super(
      "Os dados mudaram desde o início desta edição. Sua alteração não foi salva. Atualize os dados e revise antes de tentar novamente.",
    );
    this.name = "LocalConflictError";
  }
}
export class LocalReadError extends Error {
  constructor(
    public readonly code:
      | "missing-settings"
      | "invalid-snapshot"
      | "storage-unavailable"
      | "upgrade-blocked",
    cause?: unknown,
  ) {
    super(
      code === "upgrade-blocked"
        ? "Feche as outras abas do Vértice e tente novamente para atualizar os dados locais. Nenhum dado foi substituído."
        : code === "storage-unavailable"
          ? "Não foi possível acessar os dados locais. Tente novamente; saldos e configurações estão indisponíveis."
          : "Não foi possível validar os dados locais. Seus registros foram preservados; saldos e configurações estão indisponíveis.",
      { cause },
    );
    this.name = "LocalReadError";
  }
}
export class RestoreError extends Error {
  constructor(
    public readonly phase: "prepare" | "changed" | "write" | "verify",
    cause?: unknown,
  ) {
    const messages = {
      prepare:
        "Não foi possível preparar a restauração. Nenhum dado foi substituído.",
      changed:
        "Os dados mudaram desde o backup de segurança. Baixe uma nova cópia antes de restaurar.",
      write:
        "A restauração não foi concluída. A transação foi revertida e os dados anteriores foram preservados. Verifique o espaço disponível e tente novamente.",
      verify:
        "A gravação ocorreu, mas não foi possível verificar a restauração. Não continue editando. Guarde o backup pré-restore e use essa cópia para recuperação manual. Nenhuma segunda restauração foi executada.",
    };
    super(messages[phase], { cause });
    this.name = "RestoreError";
  }
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function metadataRevision(value: unknown, present: boolean): number {
  if (
    !present ||
    !value ||
    typeof value !== "object" ||
    !("protocol" in value) ||
    value.protocol !== 1 ||
    !("revision" in value) ||
    !validRevision(value.revision)
  )
    throw new LocalReadError(
      "invalid-snapshot",
      new Error("INVALID_LOCAL_CONCURRENCY"),
    );
  return value.revision;
}
function requireRevision(value: unknown): asserts value is number {
  if (!validRevision(value))
    throw new TypeError("A revisão de origem é obrigatória.");
}
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  // Identity checks keep a late failed request from clearing a newer retry.
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("vertice-finance", LOCAL_DATABASE_VERSION);
    let cancelled = false;
    let upgradeError: unknown;
    request.onupgradeneeded = (event) => {
      const db = request.result,
        tx = request.transaction!;
      const fail = (cause: unknown) => {
        upgradeError = cause;
        tx.abort();
      };
      if (cancelled) {
        tx.abort();
        return;
      }
      try {
        if (event.oldVersion === 0) {
          db.createObjectStore("transactions", { keyPath: "id" });
          const settings = db.createObjectStore("settings");
          settings.add(defaultSettings(), "personal");
          settings.add({ protocol: 1, revision: 0 }, CONCURRENCY_KEY);
          return;
        }
        // Existing v2 must never recreate stores or normalize financial rows.
        if (event.oldVersion < 2) {
          if (!db.objectStoreNames.contains("transactions"))
            db.createObjectStore("transactions", { keyPath: "id" });
          if (!db.objectStoreNames.contains("settings"))
            db.createObjectStore("settings").put(defaultSettings(), "personal");
        }
        const initialize = () => {
          try {
            const requests = snapshotRequests(tx);
            whenReady(requests, () => {
              try {
                const raw = requests.result();
                validateLocalSnapshot(raw);
                if (raw.metadataPresent)
                  throw new LocalReadError(
                    "invalid-snapshot",
                    new Error("RESERVED_KEY_COLLISION"),
                  );
                tx.objectStore("settings").add(
                  { protocol: 1, revision: 0 },
                  CONCURRENCY_KEY,
                );
              } catch (cause) {
                fail(cause);
              }
            });
          } catch (cause) {
            fail(cause);
          }
        };
        if (event.oldVersion < 2) {
          const cursor = tx.objectStore("transactions").openCursor();
          cursor.onsuccess = () => {
            try {
              const row = cursor.result;
              if (!row) {
                initialize();
                return;
              }
              const { account, category, destinationAccount, ...rest } =
                row.value;
              row.update({
                ...rest,
                accountId: rest.accountId ?? account,
                categoryId: rest.categoryId ?? category,
                destinationAccountId:
                  rest.destinationAccountId ?? destinationAccount,
                createdAt: rest.createdAt ?? rest.date + "T12:00:00.000Z",
                source:
                  rest.source ??
                  (String(rest.id).startsWith("demo-") ? "demo" : "manual"),
              });
              row.continue();
            } catch (cause) {
              fail(cause);
            }
          };
        } else initialize();
      } catch (cause) {
        fail(cause);
      }
    };
    request.onsuccess = () => {
      if (cancelled) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => {
        request.result.close();
        if (database === opening) database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      if (database === opening) database = undefined;
      reject(
        upgradeError ??
          new Error("Não foi possível abrir seus dados locais.", {
            cause: request.error,
          }),
      );
    };
    request.onblocked = () => {
      cancelled = true;
      if (database === opening) database = undefined;
      reject(new LocalReadError("upgrade-blocked"));
    };
  });
  database = opening;
  void opening.catch(() => {
    if (database === opening) database = undefined;
  });
  return opening;
}
function repositoryError(error: unknown): Error {
  if (error instanceof DOMException) {
    const message =
      error.name === "QuotaExceededError"
        ? "O armazenamento do navegador está cheio. Libere espaço e tente novamente."
        : error.name === "ConstraintError"
          ? "Há um registro em conflito. Nenhum dado desta operação foi salvo."
          : "Não foi possível concluir a operação no armazenamento local. Tente novamente.";
    return new Error(message, { cause: error });
  }
  if (error instanceof Error && !(error instanceof TypeError)) return error;
  return new Error(
    "Não foi possível ler ou salvar os dados. Revise as configurações e tente novamente.",
    { cause: error },
  );
}

function validateLocalSnapshot(raw: {
  transactions: unknown;
  settings: unknown;
  personalPresent: boolean;
}): FinanceSnapshot {
  if (!raw.personalPresent) throw new LocalReadError("missing-settings");
  try {
    return validateBackupSnapshot(raw);
  } catch (cause) {
    throw new LocalReadError("invalid-snapshot", cause);
  }
}
function snapshotRequests(tx: IDBTransaction) {
  const rows = tx.objectStore("transactions").getAll();
  const settings = tx.objectStore("settings");
  const config = settings.get("personal"),
    presence = settings.count("personal");
  const metadata = settings.get(CONCURRENCY_KEY),
    metadataPresence = settings.count(CONCURRENCY_KEY);
  return {
    requests: [
      rows,
      config,
      presence,
      metadata,
      metadataPresence,
    ] as IDBRequest[],
    result: () => ({
      transactions: rows.result as unknown,
      settings: config.result as unknown,
      personalPresent: presence.result === 1,
      metadata: metadata.result as unknown,
      metadataPresent: metadataPresence.result === 1,
    }),
  };
}
function whenReady(
  read: ReturnType<typeof snapshotRequests>,
  action: () => void,
) {
  let pending = read.requests.length;
  for (const request of read.requests)
    request.onsuccess = () => {
      if (--pending === 0) action();
    };
}
async function readLocalSnapshot() {
  const db = await openDatabase();
  const tx = db.transaction(["transactions", "settings"]);
  const { done, abort } = complete(tx);
  let requests: ReturnType<typeof snapshotRequests> | undefined;
  try {
    requests = snapshotRequests(tx);
  } catch (cause) {
    abort(cause);
  }
  await done;
  return requests!.result();
}
function complete(tx: IDBTransaction) {
  let originalError: unknown;
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    // Request errors bubble before the automatic abort. Settle only once rollback completes.
    tx.onerror = (event) => {
      originalError ??= (event.target as IDBRequest).error;
    };
    tx.onabort = () =>
      reject(
        repositoryError(
          originalError ??
            tx.error ??
            new Error("A operação foi cancelada; nenhum dado foi salvo."),
        ),
      );
  });
  return {
    done,
    abort(error: unknown) {
      originalError = error;
      try {
        tx.abort();
      } catch (cause) {
        // An injected/native abort may already be pending; onabort still settles done.
        if (!(
          cause instanceof DOMException && cause.name === "InvalidStateError"
        ))
          throw cause;
      }
    },
  };
}

async function write<T>(
  expectedRevision: number,
  action: (tx: IDBTransaction, snapshot: FinanceSnapshot) => T,
): Promise<WriteReceipt & { result: T }> {
  requireRevision(expectedRevision);
  const db = await openDatabase();
  const tx = db.transaction(["transactions", "settings"], "readwrite");
  const { done, abort } = complete(tx);
  let result!: T, revision!: number;
  try {
    const requests = snapshotRequests(tx);
    whenReady(requests, () => {
      try {
        const raw = requests.result();
        const current = metadataRevision(raw.metadata, raw.metadataPresent);
        if (current !== expectedRevision) throw new LocalConflictError();
        const snapshot = validateLocalSnapshot(raw);
        if (current === Number.MAX_SAFE_INTEGER)
          throw new Error(
            "O limite de revisões locais foi atingido. Nenhum dado foi salvo; preserve seus dados e procure suporte.",
          );
        revision = current + 1;
        result = action(tx, snapshot);
        tx.objectStore("settings").put(
          { protocol: 1, revision },
          CONCURRENCY_KEY,
        );
      } catch (cause) {
        abort(cause);
      }
    });
  } catch (cause) {
    abort(cause);
  }
  await done;
  return { revision, result };
}
export const transactionRepository: TransactionRepository = {
  async load() {
    try {
      const raw = await readLocalSnapshot();
      const revision = metadataRevision(raw.metadata, raw.metadataPresent);
      return { snapshot: validateLocalSnapshot(raw), revision };
    } catch (cause) {
      if (cause instanceof LocalReadError) throw cause;
      throw new LocalReadError("storage-unavailable", cause);
    }
  },
  async readForBackup() {
    const raw = await readLocalSnapshot();
    const revision = metadataRevision(raw.metadata, raw.metadataPresent);
    return { snapshot: validateBackupSnapshot(raw), revision };
  },
  async restore(snapshot, safety) {
    let prepared: FinanceSnapshot, previous: LocalRead;
    try {
      prepared = validateBackupSnapshot(structuredClone(snapshot));
      previous = structuredClone(safety);
      requireRevision(previous.revision);
      previous.snapshot = validateBackupSnapshot(previous.snapshot);
    } catch (cause) {
      throw new RestoreError("prepare", cause);
    }
    let revision: number;
    try {
      const receipt = await write(previous.revision, (tx, current) => {
        if (!sameBackupSnapshot(previous.snapshot, current))
          throw new RestoreError("changed");
        const store = tx.objectStore("transactions");
        store.clear();
        for (const row of prepared.transactions) store.add(row);
        tx.objectStore("settings").put(prepared.settings, "personal");
      });
      revision = receipt.revision;
    } catch (cause) {
      if (cause instanceof RestoreError) throw cause;
      if (cause instanceof LocalConflictError)
        throw new RestoreError("changed", cause);
      throw new RestoreError("write", cause);
    }
    try {
      const persisted = await transactionRepository.readForBackup();
      if (
        persisted.revision !== revision ||
        !sameBackupSnapshot(prepared, persisted.snapshot)
      )
        throw new Error("RESTORE_SNAPSHOT_MISMATCH");
      return persisted;
    } catch (cause) {
      throw new RestoreError("verify", cause);
    }
  },
  async save(transaction, intent) {
    const input = structuredClone(transaction),
      command = structuredClone(intent);
    if (!command || (command.kind !== "create" && command.kind !== "update"))
      throw new TypeError("A intenção de gravação é obrigatória.");
    const { revision } = await write(
      command.expectedRevision,
      (tx, snapshot) => {
        const exists = snapshot.transactions.some((row) => row.id === input.id);
        if (exists !== (command.kind === "update"))
          throw new LocalConflictError();
        const valid = validateTransaction(input, snapshot.settings);
        const row = {
          ...valid,
          id: input.id,
          createdAt: input.createdAt,
          source: input.source,
        };
        const store = tx.objectStore("transactions");
        if (command.kind === "create") store.add(row);
        else store.put(row);
      },
    );
    return { revision };
  },
  async remove(id, expectedRevision) {
    const { revision } = await write(expectedRevision, (tx, snapshot) => {
      if (!snapshot.transactions.some((row) => row.id === id))
        throw new LocalConflictError();
      tx.objectStore("transactions").delete(id);
    });
    return { revision };
  },
  async import(items, skipDuplicates, expectedRevision) {
    const input = structuredClone(items);
    const { revision, result: count } = await write(
      expectedRevision,
      (tx, snapshot) => {
        const validated = input.map((t) => ({
          ...validateTransaction(t, snapshot.settings),
          id: t.id,
          createdAt: t.createdAt,
          source: t.source,
        }));
        const signatures = new Set(
          snapshot.transactions.map(transactionSignature),
        );
        let count = 0;
        const store = tx.objectStore("transactions");
        for (const row of validated) {
          const signature = transactionSignature(row);
          if (skipDuplicates && signatures.has(signature)) continue;
          signatures.add(signature);
          store.add(row);
          count++;
        }
        return count;
      },
    );
    return { revision, count };
  },
  async saveSettings(settings, expectedRevision) {
    const input = structuredClone(settings);
    validateSettings(input);
    const { revision } = await write(expectedRevision, (tx, snapshot) => {
      for (const row of snapshot.transactions)
        validateTransaction(row, input, { structural: true });
      validateBackupSnapshot({
        transactions: snapshot.transactions,
        settings: input,
      });
      tx.objectStore("settings").put(input, "personal");
    });
    return { revision };
  },
  async removeDemo(expectedRevision) {
    const { revision } = await write(expectedRevision, (tx, snapshot) => {
      for (const row of snapshot.transactions)
        if (row.source === "demo")
          tx.objectStore("transactions").delete(row.id);
    });
    return { revision };
  },
};

// Explicit B2 preflight lifecycle only; production remains open(3).
export async function closeLocalDatabaseForMigration(): Promise<void> {
  const opening = database;
  if (!opening) return;
  try {
    (await opening).close();
  } finally {
    if (database === opening) database = undefined;
  }
}
