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
  RestoreError,
  LocalReadError,
  LocalConflictError,
  type LocalRead,
  type WriteReceipt,
} from "../services/transactionRepository";
import type { WorkspaceRepository } from "../services/workspaceRepository";
import { ScopedStorageError } from "../services/scopedStorageProtocol";
export function useTransactions(
  repository: WorkspaceRepository,
  onInvalidated: () => void,
  onFailure: (error: Error) => void,
) {
  const [snapshot, setSnapshot] = useState<LocalRead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [restoreVersion, setRestoreVersion] = useState(0);
  const sequence = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const currentRepository = useRef(repository);
  const loadedRepository = useRef<WorkspaceRepository | null>(null);
  const restoreReceipt = useRef(0);
  if (currentRepository.current !== repository) {
    currentRepository.current = repository;
    sequence.current++;
  }
  const active = () =>
    currentRepository.current === repository && repository.handle.active;
  const owns = (request: number) =>
    request === sequence.current &&
    currentRepository.current === repository &&
    repository.handle.active;
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const data = await repository.load();
      if (owns(request)) {
        if (
          loadedRepository.current === repository &&
          (data.restoreRevision ?? 0) > restoreReceipt.current
        ) {
          onInvalidated();
          return;
        }
        restoreReceipt.current = data.restoreRevision ?? 0;
        loadedRepository.current = repository;
        setSnapshot(data);
        setError(null);
      }
    } catch (e) {
      if (
        request === sequence.current &&
        currentRepository.current === repository
      ) {
        loadedRepository.current = repository;
        setSnapshot(null);
        if (e instanceof ScopedStorageError) onFailure(e);
        setError(
          e instanceof LocalReadError || e instanceof ScopedStorageError
            ? e
            : new LocalReadError("storage-unavailable", e),
        );
      }
    } finally {
      if (owns(request)) setLoading(false);
    }
  }, [repository, onFailure, onInvalidated]);
  useEffect(() => {
    void refresh();
    const bus =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel("vertice-updates")
        : null;
    channel.current = bus;
    if (bus)
      bus.onmessage = async (event) => {
        const message = event.data;
        if (!message || message.workspaceId !== repository.handle.workspaceId)
          return;
        if (message.type === "restored") {
          onInvalidated();
          return;
        }
        await refresh();
      };
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      sequence.current++;
      bus?.close();
      channel.current = null;
      window.removeEventListener("focus", focus);
    };
  }, [refresh, repository, onInvalidated]);
  async function command<T extends WriteReceipt>(
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await run();
      if (!active()) throw new ScopedStorageError("closed");
      return result;
    } catch (cause) {
      if (cause instanceof LocalConflictError && active()) await refresh();
      throw cause;
    }
  }
  async function changed() {
    if (!active()) return;
    channel.current?.postMessage({
      workspaceId: repository.handle.workspaceId,
      type: "changed",
    });
    await refresh();
  }
  function requireSnapshot() {
    repository.handle.assertSession(repository.handle.lease);
    if (
      !snapshot ||
      loadedRepository.current !== repository ||
      loading ||
      error
    )
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
      if (!active()) throw new ScopedStorageError("closed");
      sequence.current++;
      setSnapshot(persisted);
      setError(null);
      setLoading(false);
      setRestoreVersion((v) => v + 1);
      channel.current?.postMessage({
        workspaceId: repository.handle.workspaceId,
        type: "restored",
      });
      onInvalidated();
    } catch (cause) {
      if (cause instanceof RestoreError && cause.phase === "verify") {
        if (!active()) throw cause;
        channel.current?.postMessage({
          workspaceId: repository.handle.workspaceId,
          type: "restored",
        });
        sequence.current++;
        setSnapshot(null);
        setError(cause);
        onFailure(cause);
      }
      throw cause;
    }
  }
  return {
    snapshot:
      loadedRepository.current === repository && repository.handle.active
        ? (snapshot?.snapshot ?? null)
        : null,
    revision:
      loadedRepository.current === repository ? snapshot?.revision : undefined,
    loading: loadedRepository.current !== repository || loading,
    error: loadedRepository.current === repository ? error : null,
    restoreVersion,
    repository,
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
