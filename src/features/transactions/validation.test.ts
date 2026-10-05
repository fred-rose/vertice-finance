import { describe, expect, it } from "vitest";
import { defaultSettings } from "../../data/catalog";
import type { NewTransaction } from "../../types/finance";
import { parseBackup, serializeBackup } from "./backup";
import {
  parseAmount,
  transactionSignature,
  validateSettings,
  validateTransaction,
} from "./validation";

const input: NewTransaction = {
  type: "expense",
  amount: 1.1,
  categoryId: "food",
  description: "  Mercado  ",
  accountId: "principal",
  date: "2026-01-10",
  recurring: false,
};
function legacySignature(t: NewTransaction) {
  return JSON.stringify([
    t.type,
    Math.round(t.amount * 100),
    t.categoryId,
    t.description.trim().toLowerCase(),
    t.accountId,
    t.destinationAccountId ?? "",
    t.date,
    t.recurring,
  ]);
}

describe("B1a: goldens da fronteira legada", () => {
  it.each([
    ["0", 0],
    ["0,01", 0.01],
    ["1", 1],
    ["1,1", 1.1],
    ["1,10", 1.1],
    ["1.234,56", 1234.56],
    ["-1,10", -1.1],
    ["999.999.999,00", 999999999],
  ] as const)("parseAmount continua retornando R$ para %s", (text, expected) =>
    expect(parseAmount(text)).toBe(expected),
  );
  it("preserva modo ponto, sinal do zero e sinal de erro da API pública", () => {
    expect(parseAmount("1234.56", ".")).toBe(1234.56);
    expect(Object.is(parseAmount("-0"), -0)).toBe(true);
    for (const text of ["", "NaN", "Infinity", "1,001", "12.50"])
      expect(parseAmount(text)).toBeNaN();
  });
  it.each([0.01, 0.1 + 0.2, 1.1, 14.07, 334.4, 999999999])(
    "normalização e assinatura preservadas para %s",
    (amount) => {
      const row = { ...input, amount };
      const valid = validateTransaction(row, defaultSettings(), {
        structural: true,
      });
      expect(valid.amount).toBe(Math.round(amount * 100) / 100);
      expect(transactionSignature(row)).toBe(legacySignature(row));
      expect(row.amount).toBe(amount);
    },
  );
  it("assinatura de transferência e dedup preservados", () => {
    const row: NewTransaction = {
      ...input,
      type: "transfer",
      categoryId: "transfer",
      destinationAccountId: "reserva",
    };
    expect(transactionSignature(row)).toBe(legacySignature(row));
  });
  it.each([0, -1, 1.001, 999999999.01, NaN, Infinity])(
    "limite transação não muda para %s",
    (amount) => {
      expect(() =>
        validateTransaction({ ...input, amount }, defaultSettings(), {
          structural: true,
        }),
      ).toThrow("Informe um valor");
    },
  );
  it("settings bruto aceita subcentavo e backup v2 não o normaliza", () => {
    const settings = defaultSettings();
    settings.fixedExpenses = [
      { id: "fixed", description: "Legado", amount: 1e-8 },
    ];
    settings.goals = [
      {
        id: "goal",
        name: "Legado",
        targetAmount: 1e-8,
        currentAmount: 1e-8,
        deadline: "2026-01-10",
      },
    ];
    expect(validateSettings(settings, true)).toBe(settings);
    const snapshot = { transactions: [], settings };
    const restored = parseBackup(serializeBackup(snapshot));
    expect(restored.settings).toEqual(settings);
    expect(restored.settings.goals[0].targetAmount).toBe(1e-8);
  });
  it("políticas por campo continuam distintas", () => {
    const settings = defaultSettings();
    settings.accounts[0].initialBalance = -999999999;
    settings.categories[0].monthlyBudget = 0;
    settings.plannedIncome = 0;
    settings.lowBalanceThreshold = 0;
    settings.goals = [
      {
        id: "goal",
        name: "Meta",
        targetAmount: 1,
        currentAmount: 2,
        deadline: "2026-01-10",
      },
    ];
    expect(validateSettings(settings, true)).toBe(settings);
    settings.accounts[0].initialBalance = -999999999.01;
    expect(() => validateSettings(settings, true)).toThrow("saldo");
  });
});
