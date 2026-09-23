import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FinanceSettings,
  FinanceSnapshot,
  NewTransaction,
  Transaction,
} from "../types/finance";
import { defaultSettings } from "../data/catalog";
import { validateTransaction } from "../features/transactions/validation";
import {
  transactionRepository,
  RestoreError,
  type TransactionRepository,
} from "../services/transactionRepository";
export function useTransactions(
  repository: TransactionRepository = transactionRepository,
) {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot>({
    transactions: [],
    settings: defaultSettings(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoreVersion, setRestoreVersion] = useState(0);
  const sequence = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const data = await repository.load();
      if (request === sequence.current) {
        setSnapshot(data);
        setError("");
      }
    } catch (e) {
      if (request === sequence.current)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível carregar seus dados.",
        );
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [repository]);
  useEffect(() => {
    void refresh();
    const bus =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("vertice-updates")
        : null;
    channel.current = bus;
    if (bus)
      bus.onmessage = async (event) => {
        await refresh();
        if (event.data === "restored") setRestoreVersion((v) => v + 1);
      };
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      sequence.current++;
      bus?.close();
      channel.current = null;
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  async function changed() {
    channel.current?.postMessage("changed");
    await refresh();
  }
  async function saveTransaction(
    input: NewTransaction,
    existing?: Transaction,
  ) {
    const valid = validateTransaction(input, snapshot.settings);
    const transaction: Transaction = {
      ...valid,
      id: existing?.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      source: existing?.source ?? "manual",
    };
    await repository.save(transaction);
    await changed();
  }
  async function removeTransaction(id: string) {
    await repository.remove(id);
    await changed();
  }
  async function importTransactions(
    inputs: NewTransaction[],
    skipDuplicates: boolean,
  ) {
    const items: Transaction[] = inputs.map((input) => ({
      ...validateTransaction(input, snapshot.settings),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source: "import",
    }));
    const count = await repository.import(items, skipDuplicates);
    await changed();
    return count;
  }
  async function saveSettings(settings: FinanceSettings) {
    await repository.saveSettings(settings);
    await changed();
  }
  async function removeDemo() {
    await repository.removeDemo();
    await changed();
  }
  async function restoreBackup(
    next: FinanceSnapshot,
    previous: FinanceSnapshot,
  ) {
    try {
      const persisted = await repository.restore(next, previous);
      sequence.current++;
      setSnapshot(persisted);
      setError("");
      setRestoreVersion((v) => v + 1);
      channel.current?.postMessage("restored");
    } catch (cause) {
      if (cause instanceof RestoreError && cause.phase === "verify") {
        channel.current?.postMessage("restored");
        sequence.current++;
        setError(cause.message);
      }
      throw cause;
    }
  }
  return {
    ...snapshot,
    loading,
    error,
    restoreVersion,
    readForBackup: () => repository.readForBackup(),
    restoreBackup,
    refresh,
    saveTransaction,
    removeTransaction,
    importTransactions,
    saveSettings,
    removeDemo,
  };
}
