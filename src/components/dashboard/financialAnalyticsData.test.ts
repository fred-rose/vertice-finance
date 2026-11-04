import { describe, expect, it } from "vitest";
import { financialAnalyticsData } from "./financialAnalyticsData";
import { defaultSettings } from "../../data/catalog";
import { civilDate, civilMonth } from "../../utils/civil";
import type { Transaction } from "../../types/finance";
import { MoneyError } from "../../utils/money";

const settings = defaultSettings();
const expense = settings.categories.find((item) => item.type === "expense")!.id;
const income = settings.categories.find((item) => item.type === "income")!.id;
const transaction = (
  id: string,
  date: string,
  type: "income" | "expense",
  amount: number,
): Transaction => ({
  id,
  date,
  type,
  amount,
  description: id,
  recurring: false,
  accountId: settings.accounts[0].id,
  categoryId: type === "expense" ? expense : income,
});
const selected = civilMonth("2026-09"),
  today = civilDate("2026-09-15");

describe("financial presentation adapter for the original Analytics Bento", () => {
  it("uses exact existing totals, comparable cutoffs and excludes transfers", () => {
    const items: Transaction[] = [
      transaction("a", "2026-09-01", "income", 0.1),
      transaction("b", "2026-09-02", "income", 0.2),
      transaction("c", "2026-09-03", "expense", 0.1),
      transaction("d", "2026-08-01", "income", 0.6),
      transaction("e", "2026-08-03", "expense", 0.4),
      transaction("future", "2026-09-20", "expense", 900),
      {
        id: "transfer",
        type: "transfer",
        amount: 100,
        accountId: "a",
        destinationAccountId: "b",
        date: "2026-09-01",
        categoryId: "",
        description: "transfer",
        recurring: false,
      },
    ];
    const data = financialAnalyticsData(items, settings, selected, today);
    expect(data.revenue.value).toBe(0.3);
    expect(data.revenue.delta).toBe("-50,0%");
    expect(data.sessions.value).toBe(0.1);
    expect(data.sessions.delta).toBe("-75,0%");
    expect(data.sessions.desktop[0]).toHaveLength(15);
    expect(data.sessions.desktop[0].slice(0, 2)).toEqual([0.1, 0.2]);
    expect(data.sessions.mobile[0][2]).toBe(0.1);
    expect(data.categories.periods[0].total).toBe(0.1);
    expect(data.categories.items[0].values[0]).toBe(0.1);
    expect(data.seasonality.years[0].values[8]).toBe(0.1);
    expect(items[0].amount).toBe(0.1);
  });
  it("keeps absent records distinct from zero recorded expenses and empty series", () => {
    const empty = financialAnalyticsData([], settings, selected, today);
    expect(empty.revenue.value).toBeNull();
    expect(empty.revenue.series).toEqual([]);
    expect(
      empty.categories.periods.every((period) => period.total === null),
    ).toBe(true);
    expect(empty.categories.groups).toEqual([]);
    expect(empty.categories.items).toEqual([]);
    const incomeOnly = financialAnalyticsData(
      [transaction("a", "2026-09-01", "income", 1.05)],
      settings,
      selected,
      today,
    );
    expect(incomeOnly.sessions.value).toBe(0);
    expect(incomeOnly.sessions.delta).toBe("Sem base anterior");
    expect(incomeOnly.revenue.series).toHaveLength(1);
    expect(incomeOnly.categories.items).toEqual([]);
  });
  it("does not invent missing months, first-day samples or prior-year data", () => {
    const data = financialAnalyticsData(
      [transaction("a", "2026-09-01", "expense", 3.25)],
      settings,
      selected,
      civilDate("2026-09-01"),
    );
    expect(data.sessions.mobile[0]).toEqual([3.25]);
    expect(data.revenue.series).toEqual([
      { label: "setembro de 2026", value: 0 },
    ]);
    expect(data.seasonality.years.map((year) => year.label)).toEqual(["2026"]);
    expect(data.categories.periods[1].total).toBeNull();
  });
  it("preserves unknown categories and identity when display names collide", () => {
    const first = transaction("a", "2026-09-01", "expense", 1);
    const second = {
      ...transaction("b", "2026-09-01", "expense", 2),
      categoryId: "deleted-category",
    };
    const data = financialAnalyticsData(
      [first, second],
      settings,
      selected,
      today,
    );
    expect(data.categories.items.map((item) => item.group)).toContain(
      "deleted-category",
    );
    expect(
      data.categories.items.find((item) => item.group === "deleted-category")!
        .values[0],
    ).toBe(2);
  });
  it("keeps partial previous-month comparisons and leap-year cutoffs consistent", () => {
    const items = [
      transaction("a", "2026-08-01", "expense", 10),
      transaction("b", "2026-07-01", "expense", 20),
      transaction("late", "2026-07-25", "expense", 200),
    ];
    expect(
      financialAnalyticsData(items, settings, selected, today).categories
        .periods[1].delta,
    ).toBe("-50,0%");
    const leap = financialAnalyticsData(
      [
        transaction("leap", "2024-02-29", "expense", 1),
        transaction("prior", "2023-02-28", "expense", 2),
      ],
      settings,
      civilMonth("2024-02"),
      civilDate("2024-02-29"),
    );
    expect(leap.seasonality.years[1].rows[0].value).toBe("Até 28/02");
    const future = financialAnalyticsData(
      [
        transaction("aug", "2026-08-25", "expense", 20),
        transaction("sep", "2026-09-25", "expense", 10),
      ],
      settings,
      civilMonth("2026-10"),
      today,
    );
    expect(future.categories.periods[1].total).toBe(10);
    expect(future.categories.periods[1].delta).toBe("-50,0%");
  });
  it("propagates the existing money overflow signal instead of approximating totals", () => {
    expect(() =>
      financialAnalyticsData(
        [
          transaction("a", "2026-09-01", "income", 90071992547409.9),
          transaction("b", "2026-09-02", "income", 1),
        ],
        settings,
        selected,
        today,
      ),
    ).toThrow(MoneyError);
  });
});
