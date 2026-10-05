import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FinanceSettings,
  FinanceSnapshot,
  NewTransaction,
  Transaction,
} from "../types/finance";
import { captureCivilCut } from "../utils/civil";
import { validateTransaction } from "../features/transactions/validation";
import {
  transactionRepository,
  RestoreError,
  LocalReadError,
  LocalConflictError,
  type LocalRead,
  type WriteReceipt,
  type TransactionRepository,
} from "../services/transactionRepository";
export function useTransactions(
  repository: TransactionRepository = transactionRepository,
) {
  const [snapshot, setSnapshot] = useState<LocalRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [restoreVersion, setRestoreVersion] = useState(0);
  const sequence = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const data = await repository.load();
      if (request === sequence.current) {
        setSnapshot(data);
        setError(null);
      }
    } catch (e) {
      if (request === sequence.current) {
        setSnapshot(null);
        setError(
          e instanceof LocalReadError
            ? e
            : new LocalReadError("storage-unavailable", e),
        );
      }
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
  async function command<T extends WriteReceipt>(
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      return await run();
    } catch (cause) {
      if (cause instanceof LocalConflictError) await refresh();
      throw cause;
    }
  }
  async function changed() {
    channel.current?.postMessage("changed");
    await refresh();
  }
  function requireSnapshot() {
    if (!snapshot || loading || error)
      throw error ?? new LocalReadError("storage-unavailable");
    return snapshot;
  }
  async function saveTransaction(
    input: NewTransaction,
    expectedRevision: number,
    existing?: Transaction,
  ) {
    const transaction = prepareTransaction(
      input,
      requireSnapshot().snapshot.settings,
      existing,
    );
    await command(() =>
      repository.save(transaction, {
        kind: existing ? "update" : "create",
        expectedRevision,
      }),
    );
    await changed();
  }
  async function removeTransaction(id: string, expectedRevision: number) {
    requireSnapshot();
    await command(() => repository.remove(id, expectedRevision));
    await changed();
  }
  async function importTransactions(
    inputs: NewTransaction[],
    skipDuplicates: boolean,
    expectedRevision: number,
  ) {
    const current = requireSnapshot();
    const cut = captureCivilCut();
    const items: Transaction[] = inputs.map((input) => ({
      ...validateTransaction(input, current.snapshot.settings, {
        today: cut.today,
      }),
      id: crypto.randomUUID(),
      createdAt: cut.instant,
      source: "import",
    }));
    const { count } = await command(() =>
      repository.import(items, skipDuplicates, expectedRevision),
    );
    await changed();
    return count;
  }
  async function saveSettings(
    settings: FinanceSettings,
    expectedRevision: number,
  ) {
    requireSnapshot();
    const receipt = await command(() =>
      repository.saveSettings(settings, expectedRevision),
    );
    await changed();
    return receipt;
  }
  async function removeDemo(expectedRevision: number) {
    requireSnapshot();
    await command(() => repository.removeDemo(expectedRevision));
    await changed();
  }
  async function restoreBackup(next: FinanceSnapshot, previous: LocalRead) {
    try {
      const persisted = await repository.restore(next, previous);
      sequence.current++;
      setSnapshot(persisted);
      setError(null);
      setLoading(false);
      setRestoreVersion((v) => v + 1);
      channel.current?.postMessage("restored");
    } catch (cause) {
      if (cause instanceof RestoreError && cause.phase === "verify") {
        channel.current?.postMessage("restored");
        sequence.current++;
        setSnapshot(null);
        setError(cause);
      }
      throw cause;
    }
  }
  return {
    snapshot: snapshot?.snapshot ?? null,
    revision: snapshot?.revision,
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

// A edição preserva alegações históricas e ausências; nunca as reconstrói.
export function prepareTransaction(
  input: NewTransaction,
  settings: FinanceSettings,
  existing?: Transaction,
  cut = captureCivilCut(),
): Transaction {
  const valid = validateTransaction(input, settings, { today: cut.today });
  if (existing) {
    const next = {
      ...existing,
      ...valid,
      id: existing.id,
      source: existing.source,
      createdAt: existing.createdAt,
    };
    if (existing.source === undefined) delete next.source;
    if (existing.createdAt === undefined) delete next.createdAt;
    return next as Transaction;
  }
  return {
    ...valid,
    id: crypto.randomUUID(),
    source: "manual",
    createdAt: cut.instant,
  };
}
