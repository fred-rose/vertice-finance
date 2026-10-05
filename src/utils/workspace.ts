import {
  WORKSPACE_METADATA_KEY_PREFIX,
  type FinancialPrecondition,
  type ScopedEnvelope,
  type ScopedHandle,
  type ScopedTransactionKey,
  type SessionLease,
  type WorkspaceAuthority,
  type WorkspaceId,
  type WorkspaceMetadata,
  type WorkspaceMetadataKey,
  type WorkspaceMode,
} from "../types/workspace";

// crypto.randomUUID produces canonical lowercase UUID v4. Reject aliases rather
// than silently renaming a persisted scope. No ID generation occurs in B2a.
export function workspaceId(value: unknown): WorkspaceId {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw new TypeError("WorkspaceId deve ser UUID v4 canônico em minúsculas.");
  return value as WorkspaceId;
}

export function workspaceMode(value: unknown): WorkspaceMode {
  if (value !== "personal")
    throw new TypeError("Somente o modo personal é suportado em B2.");
  return value;
}

export function workspaceRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new TypeError("Revisão deve ser inteiro seguro não negativo.");
  return value;
}

// MAX remains valid for reads. No helper increments or resets a revision.
export function canIncrementRevision(value: number): boolean {
  return workspaceRevision(value) < Number.MAX_SAFE_INTEGER;
}

function record(value: unknown): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Registro de workspace inválido.");
}

function exactFields(
  value: unknown,
  fields: readonly string[],
): asserts value is Record<string, unknown> {
  record(value);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  )
    throw new TypeError("Campos operacionais de workspace inválidos.");
}

export function workspaceAuthority(value: unknown): WorkspaceAuthority {
  exactFields(value, [
    "layout",
    "protocol",
    "defaultWorkspaceId",
    "sourceVersion",
  ]);
  if (
    value.layout !== "scoped" ||
    value.protocol !== 1 ||
    (value.sourceVersion !== 0 && value.sourceVersion !== 3)
  )
    throw new TypeError("Authority de workspace não suportada.");
  return Object.freeze({
    layout: value.layout,
    protocol: value.protocol,
    defaultWorkspaceId: workspaceId(value.defaultWorkspaceId),
    sourceVersion: value.sourceVersion,
  });
}

export function workspaceMetadata(value: unknown): WorkspaceMetadata {
  exactFields(value, ["workspaceId", "mode", "revision"]);
  return Object.freeze({
    workspaceId: workspaceId(value.workspaceId),
    mode: workspaceMode(value.mode),
    revision: workspaceRevision(value.revision),
  });
}

export function financialPrecondition(value: unknown): FinancialPrecondition {
  exactFields(value, ["workspaceId", "expectedRevision"]);
  return Object.freeze({
    workspaceId: workspaceId(value.workspaceId),
    expectedRevision: workspaceRevision(value.expectedRevision),
  });
}

export function assertSameWorkspace(
  expected: WorkspaceId,
  actual: unknown,
): void {
  if (workspaceId(expected) !== workspaceId(actual))
    throw new TypeError("Workspace divergente do handle/destino capturado.");
}

// Only the envelope is validated/frozen. The financial DTO stays raw, by
// reference, including extras; financial validation remains with its consumer.
export function scopedEnvelope<T extends object>(
  scope: WorkspaceId,
  raw: T,
): ScopedEnvelope<T> {
  const id = workspaceId(scope);
  record(raw);
  return Object.freeze({ workspaceId: id, record: raw });
}

function transactionId(value: unknown): string {
  // Same nonblank string contract as B1 backup IDs: preserve spaces/zeros.
  if (typeof value !== "string" || !value.trim())
    throw new TypeError("Transaction.id deve ser string não vazia.");
  return value;
}

export function transactionKey(
  scope: WorkspaceId,
  id: string,
): ScopedTransactionKey {
  return [workspaceId(scope), transactionId(id)];
}

export function parseTransactionKey(value: unknown): ScopedTransactionKey {
  if (!Array.isArray(value) || value.length !== 2)
    throw new TypeError("Chave composta de transação inválida.");
  return [workspaceId(value[0]), transactionId(value[1])];
}

export function workspaceMetadataKey(scope: WorkspaceId): WorkspaceMetadataKey {
  return [WORKSPACE_METADATA_KEY_PREFIX, workspaceId(scope)];
}

export function createScopedHandle(
  scope: WorkspaceId,
  mode: WorkspaceMode = "personal",
): ScopedHandle {
  const id = workspaceId(scope);
  const supportedMode = workspaceMode(mode);
  let active = true;
  // Reference identity is the capability. toJSON rejects accidental JSON use;
  // its own function also makes structuredClone fail rather than copy a lease.
  const lease = Object.freeze({
    toJSON() {
      throw new TypeError("Lease de sessão é runtime only; não serializar.");
    },
  }) as unknown as SessionLease;
  const assertSession = (candidate: unknown): void => {
    if (!active)
      throw new TypeError("Handle de sessão definitivamente disposed.");
    if (candidate !== lease)
      throw new TypeError("Lease não pertence ao handle original.");
  };
  return Object.freeze({
    workspaceId: id,
    mode: supportedMode,
    lease,
    get active() {
      return active;
    },
    canUse: (candidate: unknown) => active && candidate === lease,
    assertSession,
    assertCommand(candidate: unknown, value: unknown) {
      assertSession(candidate);
      const precondition = financialPrecondition(value);
      assertSameWorkspace(id, precondition.workspaceId);
      return precondition;
    },
    dispose() {
      active = false;
    },
  });
}
