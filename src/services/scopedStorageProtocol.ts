import type { FinanceSnapshot } from "../types/finance";
import { WORKSPACE_STORES, WORKSPACE_INDEX } from "../types/workspace";
import { validateBackupSnapshot } from "../features/transactions/backup";
import { workspaceRevision } from "../utils/workspace";

export type ScopedErrorCode =
  | "unsupported-version"
  | "invalid-layout"
  | "invalid-authority"
  | "missing-workspace"
  | "invalid-scoped-settings"
  | "invalid-snapshot"
  | "migration-aborted"
  | "blocked"
  | "request-failure"
  | "quota"
  | "stale-safety"
  | "revision-exhausted"
  | "stale-state"
  | "closed";
export class ScopedStorageError extends Error {
  constructor(
    public readonly code: ScopedErrorCode,
    cause?: unknown,
  ) {
    super(`Scoped storage: ${code}`, { cause });
    this.name = "ScopedStorageError";
  }
}
export function storageError(
  cause: unknown,
  fallback: ScopedErrorCode = "request-failure",
) {
  if (cause instanceof ScopedStorageError) return cause;
  return new ScopedStorageError(
    cause instanceof DOMException && cause.name === "QuotaExceededError"
      ? "quota"
      : fallback,
    cause,
  );
}
// Raw equality is stricter than JSON equivalence: preserve undefined and -0.
export function sameRaw(
  a: unknown,
  b: unknown,
  seen = new WeakMap<object, object>(),
): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const previous = seen.get(a);
  if (previous) return previous === b;
  seen.set(a, b);
  if (a instanceof Date || b instanceof Date)
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
  if (a instanceof Map || b instanceof Map)
    return (
      a instanceof Map &&
      b instanceof Map &&
      sameRaw(Array.from(a.entries()), Array.from(b.entries()), seen)
    );
  if (a instanceof Set || b instanceof Set)
    return (
      a instanceof Set &&
      b instanceof Set &&
      sameRaw(Array.from(a.values()), Array.from(b.values()), seen)
    );
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b))
    return (
      ArrayBuffer.isView(a) &&
      ArrayBuffer.isView(b) &&
      a.constructor === b.constructor &&
      sameRaw(
        Array.from(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)),
        Array.from(new Uint8Array(b.buffer, b.byteOffset, b.byteLength)),
      )
    );
  if (a instanceof ArrayBuffer || b instanceof ArrayBuffer)
    return (
      a instanceof ArrayBuffer &&
      b instanceof ArrayBuffer &&
      sameRaw(Array.from(new Uint8Array(a)), Array.from(new Uint8Array(b)))
    );
  if (
    Array.isArray(a) !== Array.isArray(b) ||
    Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)
  )
    return false;
  const keys = Reflect.ownKeys(a),
    other = Reflect.ownKeys(b);
  return (
    keys.length === other.length &&
    keys.every(
      (k) =>
        Object.hasOwn(b, k) &&
        sameRaw(
          (a as Record<PropertyKey, unknown>)[k],
          (b as Record<PropertyKey, unknown>)[k],
          seen,
        ),
    )
  );
}
export function rawSnapshot(value: FinanceSnapshot): FinanceSnapshot {
  validateBackupSnapshot(value);
  return value;
}
export function legacyRevision(value: unknown): number {
  if (
    !value ||
    typeof value !== "object" ||
    !("protocol" in value) ||
    value.protocol !== 1 ||
    !("revision" in value)
  )
    throw new ScopedStorageError("invalid-snapshot");
  try {
    return workspaceRevision(value.revision);
  } catch (cause) {
    throw new ScopedStorageError("invalid-snapshot", cause);
  }
}
export class OpenAttempt {
  cancelled = false;
  cancel() {
    this.cancelled = true;
  }
  usable(current: OpenAttempt | undefined) {
    return !this.cancelled && current === this;
  }
}
export function validateLayout(db: IDBDatabase, tx: IDBTransaction) {
  const names = Object.values(WORKSPACE_STORES).sort();
  if (
    db.version !== 4 ||
    !sameRaw(Array.from(db.objectStoreNames).sort(), names)
  )
    throw new ScopedStorageError("invalid-layout");
  const expected: Record<string, string | string[] | null> = {
    scopedTransactions: ["workspaceId", "record.id"],
    scopedSettings: "workspaceId",
    workspaceMeta: null,
    transactions: "id",
    settings: null,
  };
  for (const [name, key] of Object.entries(expected)) {
    const store = tx.objectStore(name);
    if (!sameRaw(store.keyPath, key) || store.autoIncrement)
      throw new ScopedStorageError("invalid-layout");
    if (name === WORKSPACE_STORES.transactions) {
      if (!sameRaw(Array.from(store.indexNames), [WORKSPACE_INDEX]))
        throw new ScopedStorageError("invalid-layout");
      const index = store.index(WORKSPACE_INDEX);
      if (index.keyPath !== "workspaceId" || index.unique || index.multiEntry)
        throw new ScopedStorageError("invalid-layout");
    } else if (store.indexNames.length)
      throw new ScopedStorageError("invalid-layout");
  }
}
export function transactionCompletion(tx: IDBTransaction) {
  let cause: unknown;
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = (event) => {
      cause ??= (event.target as IDBRequest).error;
    };
    tx.onabort = () =>
      reject(storageError(cause ?? tx.error ?? new Error("ABORT")));
  });
  return {
    done,
    abort(error: unknown) {
      cause = error;
      try {
        tx.abort();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "InvalidStateError"))
          throw e;
      }
    },
  };
}
export function requestsReady(
  requests: IDBRequest[],
  action: () => void,
  abort: (cause: unknown) => void,
) {
  let pending = requests.length;
  for (const request of requests)
    request.onsuccess = () => {
      if (--pending === 0) {
        try {
          action();
        } catch (e) {
          abort(e);
        }
      }
    };
}
