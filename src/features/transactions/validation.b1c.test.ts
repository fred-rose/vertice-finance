import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../data/catalog";
import type { NewTransaction } from "../../types/finance";
import { civilDate } from "../../utils/civil";
import { validateTransaction, validateSettings, validDate } from "./validation";
import { validateBackupSnapshot } from "./backup";
const input: NewTransaction = {
  type: "income",
  amount: 100,
  categoryId: "income",
  accountId: "principal",
  description: "Civil",
  date: "2026-09-15",
  recurring: false,
};
afterEach(() => vi.useRealTimers());
describe("B1c: corte de comando separado de leitura", () => {
  it("comando tem corte explícito, independente de agora", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("1900-01-01T00:00:00Z"));
    expect(
      validateTransaction(input, defaultSettings(), {
        today: civilDate("2026-09-15"),
      }),
    ).toEqual({ ...input, destinationAccountId: undefined });
    expect(() =>
      validateTransaction(input, defaultSettings(), {
        today: civilDate("2026-09-14"),
      }),
    ).toThrow("até hoje");
  });
  it("snapshot futuro estrutural válido não consulta clock", () => {
    const spy = vi.spyOn(Date.prototype, "toISOString");
    const settings = defaultSettings();
    settings.accounts[0].initialBalanceDate = "2099-01-01";
    const snapshot = {
      settings,
      transactions: [{ ...input, id: "future", date: "2099-01-02" }],
    };
    expect(validateBackupSnapshot(snapshot)).toEqual(snapshot);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("settings compara todas as contas com um corte", () => {
    const settings = defaultSettings();
    settings.accounts.forEach((a) => (a.initialBalanceDate = "2026-09-15"));
    expect(validateSettings(settings, false, civilDate("2026-09-15"))).toBe(
      settings,
    );
    expect(() =>
      validateSettings(settings, false, civilDate("2026-09-14")),
    ).toThrow("data inicial");
  });
  it("deadline futura permanece data civil", () => {
    const settings = defaultSettings();
    settings.goals = [
      {
        id: "goal",
        name: "Futuro",
        targetAmount: 100,
        currentAmount: 0,
        deadline: "2099-12-31",
      },
    ];
    expect(
      validateSettings(settings, false, civilDate("2026-09-15")).goals[0]
        .deadline,
    ).toBe("2099-12-31");
  });
  it("limite e leap year iguais ao validator anterior", () => {
    expect(validDate("1900-01-01")).toBe(true);
    expect(validDate("1899-12-31")).toBe(false);
    expect(validDate("2024-02-29")).toBe(true);
    expect(validDate("2026-02-29")).toBe(false);
  });
  it("wrapper de settings captura apenas uma vez para todas as contas", () => {
    const spy = vi.spyOn(Date.prototype, "toISOString");
    validateSettings(defaultSettings());
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
