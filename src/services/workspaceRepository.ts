import type { TransactionRepository, LocalRead } from "./transactionRepository";
import { LocalConflictError } from "./transactionRepository";
import { createScopedTransactionRepository } from "./scopedTransactionRepository";
import type { ScopedStorage, ScopedRead } from "./scopedStorage";
import type { ScopedHandle } from "../types/workspace";
import { ScopedStorageError } from "./scopedStorageProtocol";

// One UI interface, bound once to a handle. No legacy fallback or active lookup.
export interface WorkspaceRepository extends TransactionRepository {
  readonly handle: ScopedHandle;
  load(): Promise<ScopedRead>;
  readForBackup(): Promise<ScopedRead>;
}
export function bindWorkspaceRepository(
  engine: ScopedStorage,
  handle: ScopedHandle,
): WorkspaceRepository {
  const repo = createScopedTransactionRepository(engine, handle);
  const command = (expectedRevision: number) => ({
    lease: handle.lease,
    precondition: { workspaceId: handle.workspaceId, expectedRevision },
  });
  async function invoke<T>(run: () => Promise<T>): Promise<T> {
    if (!handle.active) throw new ScopedStorageError("closed");
    handle.assertSession(handle.lease);
    try {
      return await run();
    } catch (error) {
      if (error instanceof ScopedStorageError && error.code === "stale-state")
        throw new LocalConflictError();
      if (
        error instanceof ScopedStorageError &&
        error.code === "request-failure" &&
        error.cause instanceof Error &&
        !(error.cause instanceof DOMException)
      )
        throw error.cause;
      if (error instanceof ScopedStorageError && error.code === "quota")
        error.message =
          "O armazenamento do navegador está cheio. Libere espaço e tente novamente.";
      throw error;
    }
  }
  return Object.freeze({
    handle,
    load: () => invoke(repo.load),
    readForBackup: () => invoke(repo.readForBackup),
    save: (row, intent) =>
      invoke(() =>
        repo.save(row, intent.kind, command(intent.expectedRevision)),
      ),
    remove: (id, revision) => invoke(() => repo.remove(id, command(revision))),
    import: (items, skip, revision) =>
      invoke(() => repo.import(items, skip, command(revision))),
    saveSettings: (settings, revision) =>
      invoke(() => repo.saveSettings(settings, command(revision))),
    removeDemo: (revision) => invoke(() => repo.removeDemo(command(revision))),
    restore: (snapshot, safety: LocalRead) =>
      invoke(() =>
        repo.restore(snapshot, safety as ScopedRead, command(safety.revision)),
      ),
  } satisfies WorkspaceRepository);
}
