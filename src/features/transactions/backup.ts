import type {
  FinanceSnapshot,
  FinanceSettings,
  Transaction,
} from "../../types/finance";
import { validateSettings, validateTransaction, validDate } from "./validation";

export interface BackupV2 extends FinanceSnapshot {
  version: 2;
  exportedAt: string;
}

export class BackupValidationError extends Error {
  constructor(
    message = "Arquivo inválido: revise a estrutura, os campos e as referências do backup JSON v2.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BackupValidationError";
  }
}
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new BackupValidationError();
}
function assertFiniteNumbersDeep(value: unknown): void {
  if (typeof value === "number") {
    requireValue(Number.isFinite(value));
  } else if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) assertFiniteNumbersDeep(child);
  }
}
function record(value: unknown): asserts value is Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
  );
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function timestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  return (
    !!match &&
    validDate(match[1]) &&
    Number(match[2]) < 24 &&
    Number(match[3]) < 60 &&
    Number(match[4]) < 60 &&
    Number.isFinite(Date.parse(value))
  );
}
function identified(
  items: unknown,
): asserts items is Record<string, unknown>[] {
  requireValue(Array.isArray(items));
  const ids = new Set<string>();
  for (const item of items) {
    record(item);
    requireValue(text(item.id) && !ids.has(item.id));
    ids.add(item.id);
  }
}

// Structural validation never normalizes stored fields or consults today's date.
// Unknown JSON fields are retained, not interpreted or executed.
export function validateBackupSnapshot(value: unknown): FinanceSnapshot {
  try {
    assertFiniteNumbersDeep(value);
    record(value);
    record(value.settings);
    const config = value.settings;
    for (const key of [
      "accounts",
      "categories",
      "goals",
      "fixedExpenses",
    ] as const)
      identified(config[key]);
    for (const a of config.accounts as Record<string, unknown>[]) {
      requireValue(
        text(a.name) &&
          text(a.type) &&
          typeof a.initialBalance === "number" &&
          typeof a.initialBalanceDate === "string",
      );
    }
    for (const c of config.categories as Record<string, unknown>[]) {
      requireValue(
        text(c.name) &&
          text(c.type) &&
          typeof c.color === "string" &&
          (c.monthlyBudget === undefined ||
            typeof c.monthlyBudget === "number"),
      );
    }
    for (const g of config.goals as Record<string, unknown>[]) {
      requireValue(
        text(g.name) &&
          typeof g.targetAmount === "number" &&
          typeof g.currentAmount === "number" &&
          typeof g.deadline === "string",
      );
    }
    for (const f of config.fixedExpenses as Record<string, unknown>[]) {
      requireValue(text(f.description) && typeof f.amount === "number");
    }
    requireValue(
      typeof config.plannedIncome === "number" &&
        typeof config.lowBalanceThreshold === "number",
    );
    const settings = validateSettings(
      config as unknown as FinanceSettings,
      true,
    );
    const accountIds = new Set(settings.accounts.map((a) => a.id));
    const categoryTypes = new Map(
      settings.categories.map((c) => [c.id, c.type]),
    );
    identified(value.transactions);
    for (const row of value.transactions) {
      requireValue(
        text(row.description) &&
          typeof row.amount === "number" &&
          typeof row.date === "string" &&
          text(row.accountId) &&
          text(row.categoryId) &&
          typeof row.recurring === "boolean",
      );
      requireValue(row.createdAt === undefined || timestamp(row.createdAt));
      requireValue(
        row.source === undefined ||
          ["manual", "import", "demo"].includes(row.source as string),
      );
      if (row.type === "transfer")
        requireValue(
          text(row.destinationAccountId) && row.categoryId === "transfer",
        );
      else requireValue(row.destinationAccountId === undefined);
      validateTransaction(row as unknown as Transaction, settings, {
        structural: true,
        accountIds,
        categoryTypes,
      });
    }
    return {
      settings,
      transactions: value.transactions as unknown as Transaction[],
    };
  } catch (cause) {
    if (cause instanceof BackupValidationError) throw cause;
    throw new BackupValidationError(undefined, { cause });
  }
}

export function parseBackup(content: string): BackupV2 {
  let value: unknown;
  try {
    value = JSON.parse(content.replace(/^\uFEFF/, ""));
  } catch (cause) {
    throw new BackupValidationError(
      "Arquivo inválido: não foi possível ler o JSON.",
      { cause },
    );
  }
  record(value);
  if (value.version !== 2)
    throw new BackupValidationError(
      "Versão incompatível. Selecione um backup JSON v2 do Vértice.",
    );
  requireValue(timestamp(value.exportedAt));
  validateBackupSnapshot(value);
  return value as unknown as BackupV2;
}

export function backupPreview(backup: BackupV2) {
  let firstDate: string | undefined;
  let lastDate: string | undefined;
  for (const row of backup.transactions) {
    if (!firstDate || row.date < firstDate) firstDate = row.date;
    if (!lastDate || row.date > lastDate) lastDate = row.date;
  }
  return {
    version: backup.version,
    exportedAt: backup.exportedAt,
    transactions: backup.transactions.length,
    accounts: backup.settings.accounts.length,
    categories: backup.settings.categories.length,
    goals: backup.settings.goals.length,
    firstDate,
    lastDate,
  };
}

// Property order and IndexedDB's primary-key row order are not financial changes.
// Optional undefined fields disappear in JSON; all other fields must match.
function equalValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => equalValue(v, b[i]))
    );
  if (
    Object.getPrototypeOf(a) !== Object.prototype ||
    Object.getPrototypeOf(b) !== Object.prototype
  )
    return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  return (
    keys.length ===
      Object.keys(right).filter((k) => right[k] !== undefined).length &&
    keys.every((k) => Object.hasOwn(right, k) && equalValue(left[k], right[k]))
  );
}
export function sameBackupSnapshot(
  a: FinanceSnapshot,
  b: FinanceSnapshot,
): boolean {
  if (
    !equalValue(a.settings, b.settings) ||
    a.transactions.length !== b.transactions.length
  )
    return false;
  const byId = new Map(b.transactions.map((row) => [row.id, row]));
  return (
    byId.size === b.transactions.length &&
    a.transactions.every((row) => equalValue(row, byId.get(row.id)))
  );
}

export function serializeBackup(snapshot: FinanceSnapshot): string {
  validateBackupSnapshot(snapshot);
  const json = JSON.stringify(
    {
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: snapshot.settings,
      transactions: snapshot.transactions,
    },
    null,
    2,
  );
  if (!sameBackupSnapshot(snapshot, parseBackup(json)))
    throw new BackupValidationError(
      "Não foi possível representar todos os dados no backup JSON v2.",
    );
  return json;
}
