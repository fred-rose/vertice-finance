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
      reject(new Error("Não foi possível abrir seus dados locais."));
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
function resolveSettings(
  value: FinanceSettings | null | undefined,
): FinanceSettings {
  try {
    return validateSettings(value ?? defaultSettings(), true);
  } catch (error) {
    throw repositoryError(error);
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
    const db = await openDatabase();
    const tx = db.transaction(["transactions", "settings"]);
    const { done } = complete(tx);
    const rows = tx.objectStore("transactions").getAll();
    const config = tx.objectStore("settings").get("personal");
    await done;
    const settings = resolveSettings(config.result);
    const transactions: Transaction[] = rows.result;
    const accountIds = new Set(settings.accounts.map((a) => a.id));
    const categoryTypes = new Map(
      settings.categories.map((c) => [c.id, c.type]),
    );
    transactions.forEach((t) =>
      validateTransaction(t, settings, {
        structural: true,
        accountIds,
        categoryTypes,
      }),
    );
    return { transactions, settings };
  },
  async readForBackup() {
    const db = await openDatabase();
    const tx = db.transaction(["transactions", "settings"]);
    const { done } = complete(tx);
    const rows = tx.objectStore("transactions").getAll();
    const config = tx.objectStore("settings").get("personal");
    await done;
    // Deliberately no resolveSettings/defaults: a recovery copy must be real.
    return validateBackupSnapshot({
      transactions: rows.result,
      settings: config.result,
    });
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
    const config = tx.objectStore("settings").get("personal");
    config.onsuccess = () => {
      try {
        const valid = validateTransaction(
          transaction,
          resolveSettings(config.result),
        );
        tx.objectStore("transactions").put({
          ...valid,
          id: transaction.id,
          createdAt: transaction.createdAt,
          source: transaction.source,
        });
      } catch (error) {
        abort(error);
      }
    };
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
    const config = tx.objectStore("settings").get("personal");
    let count = 0;
    config.onsuccess = () => {
      let validated: Transaction[];
      try {
        const settings = resolveSettings(config.result);
        validated = items.map((t) => ({
          ...validateTransaction(t, settings),
          id: t.id,
          createdAt: t.createdAt,
          source: t.source,
        }));
      } catch (error) {
        abort(error);
        return;
      }
      const store = tx.objectStore("transactions");
      const existing = store.getAll();
      existing.onsuccess = () => {
        try {
          const signatures = new Set(
            (existing.result as Transaction[]).map(transactionSignature),
          );
          validated.forEach((t) => {
            const signature = transactionSignature(t);
            if (skipDuplicates && signatures.has(signature)) return;
            signatures.add(signature);
            store.add(t);
            count++;
          });
        } catch (error) {
          abort(error);
        }
      };
    };
    await done;
    return count;
  },
  async saveSettings(settings) {
    validateSettings(settings);
    const db = await openDatabase();
    const tx = db.transaction(["transactions", "settings"], "readwrite");
    const { done, abort } = complete(tx);
    const rows = tx.objectStore("transactions").getAll();
    rows.onsuccess = () => {
      try {
        (rows.result as Transaction[]).forEach((t) =>
          validateTransaction(t, settings, { structural: true }),
        );
        tx.objectStore("settings").put(settings, "personal");
      } catch (error) {
        abort(error);
      }
    };
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
