import type { FinanceSettings, Transaction } from "./finance";

declare const workspaceIdBrand: unique symbol;
export type WorkspaceId = string & { readonly [workspaceIdBrand]: true };
export type WorkspaceMode = "personal";

export interface WorkspaceAuthority {
  readonly layout: "scoped";
  readonly protocol: 1;
  readonly defaultWorkspaceId: WorkspaceId;
  readonly sourceVersion: 0 | 3;
}

export interface WorkspaceMetadata {
  readonly workspaceId: WorkspaceId;
  readonly mode: WorkspaceMode;
  readonly revision: number;
}

export interface ScopedEnvelope<T> {
  readonly workspaceId: WorkspaceId;
  readonly record: T;
}
export type ScopedTransactionEnvelope = ScopedEnvelope<Transaction>;
export type ScopedSettingsEnvelope = ScopedEnvelope<FinanceSettings>;
export type ScopedTransactionKey = [WorkspaceId, string];
export type WorkspaceMetadataKey = ["workspace", WorkspaceId];

// Persistible precondition; session identity is deliberately separate.
export interface FinancialPrecondition {
  readonly workspaceId: WorkspaceId;
  readonly expectedRevision: number;
}

declare const sessionLeaseBrand: unique symbol;
export type SessionLease = { readonly [sessionLeaseBrand]: true };

// Internal session integrity only: no storage, authentication or origin security.
export interface ScopedHandle {
  readonly workspaceId: WorkspaceId;
  readonly mode: WorkspaceMode;
  readonly lease: SessionLease;
  readonly active: boolean;
  canUse(lease: unknown): boolean;
  assertSession(lease: unknown): void;
  assertCommand(lease: unknown, precondition: unknown): FinancialPrecondition;
  dispose(): void;
}

// Dormant schema contracts. Never imported by the current v3 repository/App.
export const SCOPED_DATABASE_VERSION = 4;
export const WORKSPACE_STORES = Object.freeze({
  transactions: "scopedTransactions",
  settings: "scopedSettings",
  metadata: "workspaceMeta",
  legacyTransactions: "transactions",
  legacySettings: "settings",
} as const);
export const SCOPED_TRANSACTION_KEY_PATH = Object.freeze([
  "workspaceId",
  "record.id",
] as const);
export const SCOPED_SETTINGS_KEY_PATH = "workspaceId";
export const WORKSPACE_INDEX = "byWorkspace";
export const WORKSPACE_AUTHORITY_KEY = "authority";
export const WORKSPACE_METADATA_KEY_PREFIX = "workspace";
