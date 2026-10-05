import { describe, expect, it } from "vitest";
import { prepareTransaction } from "./useTransactions";
import { defaultSettings } from "../data/catalog";
import type { NewTransaction, Transaction } from "../types/finance";
import { captureCivilCut } from "../utils/civil";
import { parseBackup, serializeBackup } from "../features/transactions/backup";
const settings = defaultSettings();
const input: NewTransaction = {
  type: "expense",
  amount: 100,
  date: "2026-09-10",
  description: "Editado",
  categoryId: "food",
  accountId: "principal",
  recurring: false,
};
const cut = captureCivilCut(
  new Date("2026-09-15T14:00:00Z"),
  "America/Sao_Paulo",
);
describe("B1c: criação e edição preservam proveniência", () => {
  it("nova manual registra instante real capturado", () => {
    const row = prepareTransaction(input, settings, undefined, cut);
    expect(row.source).toBe("manual");
    expect(row.createdAt).toBe(cut.instant);
    expect(row.date).toBe(input.date);
    expect(row.id).toBeTruthy();
  });
  it.each([undefined, "manual", "import", "demo"] as const)(
    "edição source %s",
    (source) => {
      const existing: Transaction = {
        ...input,
        id: "demo-legado",
        description: "Antigo",
        ...(source === undefined ? {} : { source }),
      };
      const row = prepareTransaction(input, settings, existing, cut);
      expect(row.source).toBe(source);
      expect(Object.hasOwn(row, "source")).toBe(source !== undefined);
      expect(Object.hasOwn(row, "createdAt")).toBe(false);
      expect(row.id).toBe(existing.id);
      expect(existing.description).toBe("Antigo");
    },
  );
  it.each(["2026-09-10T12:00:00.000Z", "2026-09-10T09:00:00-03:00"])(
    "timestamp legado %s preservado sem classificação",
    (createdAt) => {
      const row = prepareTransaction(
        input,
        settings,
        { ...input, id: "legacy", createdAt },
        cut,
      );
      expect(row.createdAt).toBe(createdAt);
      expect(row.source).toBeUndefined();
    },
  );
  it("edição e roundtrip preservam extras e ausências", () => {
    const existing = { ...input, id: "demo-unknown", note: { raw: true } };
    const row = prepareTransaction(input, settings, existing, cut);
    const snapshot = { settings, transactions: [row] };
    const restored = parseBackup(serializeBackup(snapshot)).transactions[0];
    expect(restored).toEqual(row);
    expect(Object.hasOwn(restored, "source")).toBe(false);
    expect(Object.hasOwn(restored, "createdAt")).toBe(false);
    expect(restored).toHaveProperty("note", { raw: true });
  });
});
