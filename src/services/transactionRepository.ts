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
export interface TransactionRepository {
  load(): Promise<FinanceSnapshot>;
  readForBackup(): Promise<FinanceSnapshot>;
  restore(
    snapshot: FinanceSnapshot,
    safetySnapshot: FinanceSnapshot,
  ): Promise<FinanceSnapshot>;
  save(transaction: Transaction): Promise<void>;
  remove(id: string): Promise<void>;
  import(items: Transaction[], skipDuplicates: boolean): Promise<number>;
  saveSettings(settings: FinanceSettings): Promise<void>;
  removeDemo(): Promise<void>;
}
export class LocalReadError extends Error {
  constructor(
    public readonly code:
      "missing-settings" | "invalid-snapshot" | "storage-unavailable",
    cause?: unknown,
  ) {
    super(
      code === "storage-unavailable"
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
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open("vertice-finance", 2);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("transactions"))
        db.createObjectStore("transactions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings"))
        db.createObjectStore("settings").put(defaultSettings(), "personal");
      // Defaults are persisted only when creating the store: real bootstrap
      // or the existing v1 migration. Never repair an already-open v2 database.
      // Preserve v1 records; new databases start without demonstration data.
      const cursor = request
        .transaction!.objectStore("transactions")
        .openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        const { account, category, destinationAccount, ...rest } = row.value;
        row.update({
          ...rest,
          accountId: rest.accountId ?? account,
          categoryId: rest.categoryId ?? category,
          destinationAccountId: rest.destinationAccountId ?? destinationAccount,
          createdAt: rest.createdAt ?? `${rest.date}T12:00:00.000Z`,
          source:
            rest.source ??
            (String(rest.id).startsWith("demo-") ? "demo" : "manual"),
        });
        row.continue();
      };
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      database = undefined;
      reject(
        new Error("Não foi possível abrir seus dados locais.", {
          cause: request.error,
        }),
      );
    };
    request.onblocked = () => {
      blocked = true;
      database = undefined;
      reject(
        new Error(
          "Feche as outras abas do Vértice e recarregue para atualizar o banco.",
        ),
      );
    };
  });
  return database;
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
// Queue all reads together in the caller's transaction. Writes stay in the
// final request callback, without yielding outside the active IDB transaction.
function snapshotRequests(tx: IDBTransaction) {
  const rows = tx.objectStore("transactions").getAll();
  const config = tx.objectStore("settings").get("personal");
  const presence = tx.objectStore("settings").count("personal");
  const result = () => ({
    transactions: rows.result as unknown,
    settings: config.result as unknown,
    personalPresent: presence.result === 1,
  });
  return { rows, config, presence, result };
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
function withValidSnapshot(
  tx: IDBTransaction,
  abort: (cause: unknown) => void,
  action: (snapshot: FinanceSnapshot) => void,
) {
  try {
    const requests = snapshotRequests(tx);
    let pending = 3;
    const ready = () => {
      if (--pending) return;
      try {
        action(validateLocalSnapshot(requests.result()));
      } catch (cause) {
        abort(cause);
      }
    };
    requests.rows.onsuccess = ready;
    requests.config.onsuccess = ready;
    requests.presence.onsuccess = ready;
  } catch (cause) {
    abort(cause);
  }
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
export const transactionRepository: TransactionRepository = {
  async load() {
    try {
      return validateLocalSnapshot(await readLocalSnapshot());
    } catch (cause) {
      if (cause instanceof LocalReadError) throw cause;
      throw new LocalReadError("storage-unavailable", cause);
    }
  },
  async readForBackup() {
    // A recovery copy must be real; retain A1's strict validation contract.
    return validateBackupSnapshot(await readLocalSnapshot());
  },
  async restore(snapshot, safetySnapshot) {
    let prepared: FinanceSnapshot, previous: FinanceSnapshot;
    try {
      // Own the prepared input before yielding to another task/tab.
      prepared = validateBackupSnapshot(structuredClone(snapshot));
      previous = validateBackupSnapshot(structuredClone(safetySnapshot));
    } catch (cause) {
      throw new RestoreError("prepare", cause);
    }
    try {
      const db = await openDatabase();
      const tx = db.transaction(["transactions", "settings"], "readwrite");
      const { done, abort } = complete(tx);
      try {
        const store = tx.objectStore("transactions");
        const configStore = tx.objectStore("settings");
        const rows = store.getAll();
        const config = configStore.get("personal");
        let pending = 2;
        const replace = () => {
          if (--pending !== 0) return;
          try {
            if (
              !sameBackupSnapshot(previous, {
                transactions: rows.result,
                settings: config.result,
              })
            )
              throw new RestoreError("changed");
            store.clear();
            for (const row of prepared.transactions) store.add(row);
            configStore.put(prepared.settings, "personal");
          } catch (cause) {
            abort(cause);
          }
        };
        rows.onsuccess = replace;
        config.onsuccess = replace;
      } catch (cause) {
        abort(cause);
      }
      await done;
    } catch (cause) {
      if (cause instanceof RestoreError) throw cause;
      throw new RestoreError("write", cause);
    }
    // This is a new read through the real repository, after the commit.
    // Never compensate a completed commit with a second destructive write.
    try {
      const persisted = await transactionRepository.readForBackup();
      if (!sameBackupSnapshot(prepared, persisted))
        throw new Error("RESTORE_SNAPSHOT_MISMATCH");
      return persisted;
    } catch (cause) {
      throw new RestoreError("verify", cause);
    }
  },
  async save(transaction) {
    const db = await openDatabase();
    const tx = db.transaction(["transactions", "settings"], "readwrite");
    const { done, abort } = complete(tx);
    withValidSnapshot(tx, abort, ({ settings }) => {
      const valid = validateTransaction(transaction, settings);
      tx.objectStore("transactions").put({
        ...valid,
        id: transaction.id,
        createdAt: transaction.createdAt,
        source: transaction.source,
      });
    });
    await done;
  },
  async remove(id) {
    const db = await openDatabase();
    const tx = db.transaction("transactions", "readwrite");
    const { done, abort } = complete(tx);
    try {
      tx.objectStore("transactions").delete(id);
    } catch (error) {
      abort(error);
    }
    await done;
  },
  async import(items, skipDuplicates) {
    const db = await openDatabase();
    const tx = db.transaction(["transactions", "settings"], "readwrite");
    const { done, abort } = complete(tx);
    let count = 0;
    withValidSnapshot(tx, abort, ({ settings, transactions }) => {
      const validated = items.map((t) => ({
        ...validateTransaction(t, settings),
        id: t.id,
        createdAt: t.createdAt,
        source: t.source,
      }));
      const store = tx.objectStore("transactions");
      const signatures = new Set(transactions.map(transactionSignature));
      validated.forEach((t) => {
        const signature = transactionSignature(t);
        if (skipDuplicates && signatures.has(signature)) return;
        signatures.add(signature);
        store.add(t);
        count++;
      });
    });
    await done;
    return count;
  },
  async saveSettings(settings) {
    validateSettings(settings);
    const db = await openDatabase();
    const tx = db.transaction(["transactions", "settings"], "readwrite");
    const { done, abort } = complete(tx);
    withValidSnapshot(tx, abort, ({ transactions }) => {
      transactions.forEach((t) =>
        validateTransaction(t, settings, { structural: true }),
      );
      validateBackupSnapshot({ transactions, settings });
      tx.objectStore("settings").put(settings, "personal");
    });
    await done;
  },
  async removeDemo() {
    const db = await openDatabase();
    const tx = db.transaction("transactions", "readwrite");
    const { done, abort } = complete(tx);
    const cursor = tx.objectStore("transactions").openCursor();
    cursor.onsuccess = () => {
      try {
        const row = cursor.result;
        if (!row) return;
        if (row.value.source === "demo") row.delete();
        row.continue();
      } catch (error) {
        abort(error);
      }
    };
    await done;
  },
};
