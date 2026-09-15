// Test-only entry point: bundle real modules into an isolated browser context.
export { transactionRepository } from "../../src/services/transactionRepository";
export { defaultSettings } from "../../src/data/catalog";
export * from "../../src/features/dashboard/calculations";
import type { Transaction } from "../../src/types/finance";
export function transaction(patch: Partial<Transaction> = {}): Transaction {
  const base = {
    id: crypto.randomUUID(),
    createdAt: "2026-09-15T12:00:00.000Z",
    source: "manual" as const,
    amount: 85,
    categoryId: "food",
    accountId: "principal",
    description: "Lançamento de teste",
    date: "2026-09-10",
    recurring: false,
    ...patch,
  };
  return patch.type === "transfer"
    ? {
        ...base,
        type: "transfer",
        destinationAccountId: patch.destinationAccountId ?? "reserva",
      }
    : {
        ...base,
        type: patch.type ?? "expense",
        destinationAccountId: undefined,
      };
}
