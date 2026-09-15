import type {
  FinanceSettings,
  FinanceSnapshot,
  Transaction,
} from "../types/finance";
import { defaultSettings } from "../data/catalog";
import {
  transactionSignature,
  validateSettings,
  validateTransaction,
} from "../features/transactions/validation";
export interface TransactionRepository {
  load(): Promise<FinanceSnapshot>;
  save(transaction: Transaction): Promise<void>;
  remove(id: string): Promise<void>;
  import(items: Transaction[], skipDuplicates: boolean): Promise<number>;
  saveSettings(settings: FinanceSettings): Promise<void>;
  removeDemo(): Promise<void>;
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
    return validateSettings(value ?? defaultSettings());
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
      tx.abort();
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
    transactions.forEach((t) => validateTransaction(t, settings));
    return { transactions, settings };
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
          validateTransaction(t, settings),
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
