import type {
  FinanceSnapshot,
  FinanceSettings,
  Transaction,
} from "../types/finance";
import type {
  ScopedHandle,
  SessionLease,
  FinancialPrecondition,
} from "../types/workspace";
import { WORKSPACE_STORES as S, WORKSPACE_INDEX } from "../types/workspace";
import {
  scopedEnvelope,
  transactionKey,
  workspaceMetadataKey,
  canIncrementRevision,
  assertSameWorkspace,
} from "../utils/workspace";
import {
  transactionSignature,
  validateTransaction,
  validateSettings,
} from "../features/transactions/validation";
import {
  sameBackupSnapshot,
  serializeBackup,
} from "../features/transactions/backup";
import { RestoreError } from "./transactionRepository";
import {
  scopedRequests,
  type ScopedRead,
  type ScopedStorage,
} from "./scopedStorage";
import {
  ScopedStorageError,
  rawSnapshot,
  requestsReady,
  transactionCompletion,
} from "./scopedStorageProtocol";

export interface ScopedCommand {
  readonly lease: SessionLease;
  readonly precondition: FinancialPrecondition;
}
export function createScopedTransactionRepository(
  engine: ScopedStorage,
  handle: ScopedHandle,
) {
  const id = handle.workspaceId;
  async function load(): Promise<ScopedRead> {
    handle.assertSession(handle.lease);
    const result = await engine.read(id);
    handle.assertSession(handle.lease);
    return result;
  }
  async function write<T>(
    command: ScopedCommand,
    action: (
      tx: IDBTransaction,
      snapshot: FinanceSnapshot,
      abort: (cause: unknown) => void,
    ) => T,
  ) {
    const precondition = handle.assertCommand(
      command.lease,
      command.precondition,
    );
    const tx = engine.scopedTransaction("readwrite");
    const { done, abort } = transactionCompletion(tx);
    let result!: T, revision!: number;
    try {
      const requests = scopedRequests(tx, id);
      requestsReady(
        requests.requests,
        () => {
          handle.assertCommand(command.lease, precondition);
          const current = requests.result();
          if (current.revision !== precondition.expectedRevision)
            throw new ScopedStorageError("stale-state");
          if (!canIncrementRevision(current.revision))
            throw new ScopedStorageError("revision-exhausted");
          revision = current.revision + 1;
          result = action(tx, current.snapshot, abort);
          tx.objectStore(S.metadata).put(
            { workspaceId: id, mode: handle.mode, revision },
            workspaceMetadataKey(id),
          );
        },
        abort,
      );
    } catch (cause) {
      abort(cause);
    }
    await done;
    return { workspaceId: id, revision, result };
  }
  async function save(
    transaction: Transaction,
    kind: "create" | "update",
    command: ScopedCommand,
  ) {
    const input = structuredClone(transaction);
    if (kind !== "create" && kind !== "update")
      throw new TypeError("SAVE_INTENT");
    const { workspaceId, revision } = await write(command, (tx, snapshot) => {
      const exists = snapshot.transactions.some((row) => row.id === input.id);
      if (exists !== (kind === "update"))
        throw new ScopedStorageError("stale-state");
      const row = {
        ...validateTransaction(input, snapshot.settings),
        id: input.id,
        createdAt: input.createdAt,
        source: input.source,
      };
      rawSnapshot({ transactions: [row], settings: snapshot.settings });
      transactionKey(id, row.id);
      const store = tx.objectStore(S.transactions);
      if (kind === "create") store.add(scopedEnvelope(id, row));
      else store.put(scopedEnvelope(id, row));
    });
    return { workspaceId, revision };
  }
  async function remove(key: string, command: ScopedCommand) {
    const { workspaceId, revision } = await write(command, (tx, snapshot) => {
      if (!snapshot.transactions.some((row) => row.id === key))
        throw new ScopedStorageError("stale-state");
      tx.objectStore(S.transactions).delete(transactionKey(id, key));
    });
    return { workspaceId, revision };
  }
  async function importRows(
    items: Transaction[],
    skipDuplicates: boolean,
    command: ScopedCommand,
  ) {
    const input = structuredClone(items);
    const {
      workspaceId,
      revision,
      result: count,
    } = await write(command, (tx, snapshot) => {
      const validated = input.map((row) => ({
        ...validateTransaction(row, snapshot.settings),
        id: row.id,
        createdAt: row.createdAt,
        source: row.source,
      }));
      for (const row of validated)
        rawSnapshot({ transactions: [row], settings: snapshot.settings });
      const signatures = new Set(
        snapshot.transactions.map(transactionSignature),
      );
      let count = 0;
      for (const row of validated) {
        const signature = transactionSignature(row);
        if (skipDuplicates && signatures.has(signature)) continue;
        signatures.add(signature);
        transactionKey(id, row.id);
        tx.objectStore(S.transactions).add(scopedEnvelope(id, row));
        count++;
      }
      return count;
    });
    return { workspaceId, revision, count };
  }
  async function saveSettings(
    settings: FinanceSettings,
    command: ScopedCommand,
  ) {
    const input = structuredClone(settings);
    validateSettings(input);
    const { workspaceId, revision } = await write(command, (tx, snapshot) => {
      rawSnapshot({ transactions: snapshot.transactions, settings: input });
      tx.objectStore(S.settings).put(scopedEnvelope(id, input));
    });
    return { workspaceId, revision };
  }
  async function removeDemo(command: ScopedCommand) {
    const { workspaceId, revision } = await write(command, (tx, snapshot) => {
      for (const row of snapshot.transactions)
        if (row.source === "demo")
          tx.objectStore(S.transactions).delete(transactionKey(id, row.id));
    });
    return { workspaceId, revision };
  }
  async function restore(
    snapshot: FinanceSnapshot,
    safety: ScopedRead,
    command: ScopedCommand,
  ) {
    let prepared: FinanceSnapshot, previous: ScopedRead;
    try {
      handle.assertCommand(command.lease, command.precondition);
      prepared = rawSnapshot(structuredClone(snapshot));
      previous = structuredClone(safety);
      assertSameWorkspace(id, previous.workspaceId);
      if (previous.revision !== command.precondition.expectedRevision)
        throw new ScopedStorageError("stale-safety");
      rawSnapshot(previous.snapshot);
    } catch (cause) {
      throw new RestoreError("prepare", cause);
    }
    let revision: number;
    try {
      const receipt = await write(command, (tx, current, abort) => {
        if (!sameBackupSnapshot(previous.snapshot, current))
          throw new RestoreError("changed");
        const store = tx.objectStore(S.transactions);
        const cursor = store
          .index(WORKSPACE_INDEX)
          .openCursor(IDBKeyRange.only(id));
        cursor.onsuccess = () => {
          try {
            const row = cursor.result;
            if (row) {
              row.delete();
              row.continue();
              return;
            }
            for (const item of prepared.transactions)
              store.add(scopedEnvelope(id, item));
            tx.objectStore(S.settings).put(
              scopedEnvelope(id, prepared.settings),
            );
          } catch (cause) {
            abort(cause);
          }
        };
      });
      revision = receipt.revision;
    } catch (cause) {
      if (cause instanceof RestoreError) throw cause;
      if (cause instanceof ScopedStorageError && cause.code === "stale-state")
        throw new RestoreError("changed", cause);
      throw new RestoreError("write", cause);
    }
    try {
      const persisted = await load();
      if (
        persisted.revision !== revision ||
        !sameBackupSnapshot(prepared, persisted.snapshot)
      )
        throw new Error("RESTORE_VERIFY");
      return persisted;
    } catch (cause) {
      throw new RestoreError("verify", cause);
    }
  }
  return Object.freeze({
    handle,
    load,
    readForBackup: load,
    save,
    remove,
    import: importRows,
    saveSettings,
    removeDemo,
    restore,
    async exportJSON() {
      return serializeBackup((await load()).snapshot);
    },
  });
}
