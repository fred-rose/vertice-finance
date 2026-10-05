import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../data/catalog";
import type { Transaction } from "../../types/finance";
import { civilDate, civilMonth } from "../../utils/civil";
import {
  accountBalance,
  closingProjection,
  comparablePeriods,
  generateInsights,
  monthlyData,
  monthlyBalanceAverage,
  movingAverage,
  summarize,
  forMonth,
} from "./calculations";
const tx = (date: string, amount = 100): Transaction => ({
  id: date,
  type: "expense",
  amount,
  date,
  accountId: "principal",
  categoryId: "food",
  description: "Civil",
  recurring: false,
  createdAt: "2099-01-01T12:00:00Z",
});
afterEach(() => vi.useRealTimers());
describe("B1c: calculadores recebem apenas período/corte civis", () => {
  it.each([
    ["2026-03", "2026-03-31", "2026-02-28"],
    ["2024-03", "2024-03-31", "2024-02-29"],
    ["2026-01", "2026-01-31", "2025-12-31"],
  ] as const)("comparação %s", (period, today, previous) => {
    const result = comparablePeriods(
      [tx(previous), tx(today)],
      civilMonth(period),
      civilDate(today),
    );
    expect(result.previous.map((t) => t.date)).toEqual([previous]);
    expect(result.current.map((t) => t.date)).toEqual([today]);
    expect(result.partial).toBe(true);
  });
  it("um corte explícito produz as mesmas métricas sob clocks diferentes", () => {
    const rows = [
        tx("2026-09-01"),
        tx("2026-09-07"),
        tx("2026-09-15"),
        tx("2026-09-20"),
        tx("2026-08-10"),
        tx("2026-07-10"),
      ],
      settings = defaultSettings(),
      period = civilMonth("2026-09"),
      today = civilDate("2026-09-15");
    const query = () => ({
      summary: summarize(forMonth(rows, period)),
      comparison: comparablePeriods(rows, period, today),
      projection: closingProjection(rows, period, today),
      balance: accountBalance(settings.accounts[0], rows, today),
      insights: generateInsights(rows, period, settings, today),
      trend: monthlyData(rows, period),
      average: movingAverage(rows, period),
      chartAverage: monthlyBalanceAverage(rows, period),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    const first = query();
    vi.setSystemTime(new Date("2040-12-31T23:59:59Z"));
    expect(query()).toEqual(first);
    expect(first.projection).toBe(600);
    expect(first.summary.expenses).toBe(400);
    expect(first.comparison.current).toHaveLength(3);
  });
  it("novo corte altera saldo/comparação/projeção sem mudar caixa histórico", () => {
    const rows = [tx("2026-09-01"), tx("2026-09-07"), tx("2026-09-15")],
      period = civilMonth("2026-09"),
      account = {
        ...defaultSettings().accounts[0],
        initialBalance: 500,
        initialBalanceDate: "2026-09-01",
      };
    expect(
      comparablePeriods(rows, period, civilDate("2026-09-14")).current,
    ).toHaveLength(2);
    expect(
      comparablePeriods(rows, period, civilDate("2026-09-15")).current,
    ).toHaveLength(3);
    expect(accountBalance(account, rows, "2026-09-14")).toBe(300);
    expect(accountBalance(account, rows, "2026-09-15")).toBe(200);
    expect(rows[2].date).toBe("2026-09-15");
  });
  it("abertura inclusiva, nunca usa createdAt para caixa", () => {
    const account = {
      ...defaultSettings().accounts[0],
      initialBalance: 500,
      initialBalanceDate: "2026-09-10",
    };
    expect(
      accountBalance(account, [tx("2026-09-10")], "2026-09-09"),
    ).toBeNull();
    expect(
      accountBalance(
        account,
        [tx("2026-09-09"), tx("2026-09-10")],
        "2026-09-10",
      ),
    ).toBe(400);
    expect(forMonth([tx("2026-09-10")], civilMonth("2026-09"))).toHaveLength(1);
  });
  it("seis meses, virada do ano, zero e lacunas preservados", () => {
    const series = monthlyData([tx("2025-12-10")], civilMonth("2026-01"));
    expect(series.map((m) => m.key)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
    expect(series[4].expenses).toBe(100);
    expect(series[5].balance).toBeNull();
  });
  it("janela na borda mínima não valida fatos de 1899", () =>
    expect(
      monthlyData([tx("1900-01-01")], civilMonth("1900-01")).map((m) => m.key),
    ).toEqual([
      "1899-08",
      "1899-09",
      "1899-10",
      "1899-11",
      "1899-12",
      "1900-01",
    ]));
  it("wrapper captura uma vez, composição interna não lê clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15));
    const spy = vi.spyOn(Date.prototype, "toISOString");
    generateInsights(
      [tx("2026-09-01"), tx("2026-09-07"), tx("2026-09-15")],
      civilMonth("2026-09"),
      defaultSettings(),
    );
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
