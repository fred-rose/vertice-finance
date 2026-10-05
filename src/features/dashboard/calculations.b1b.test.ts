import { describe, expect, it } from "vitest";
import { defaultSettings } from "../../data/catalog";
import type { Transaction } from "../../types/finance";
import {
  accountBalance,
  aggregateCategories,
  budgetUsed,
  closingProjection,
  detectAnomalies,
  generateInsights,
  movingAverage,
  percentageChange,
  summarize,
  totalAccountBalance,
} from "./calculations";

const row = (
  amount: number,
  date = "2026-09-10",
  type: "income" | "expense" = "expense",
): Transaction => ({
  id: `${type}-${date}-${amount}`,
  amount,
  date,
  type,
  accountId: "principal",
  categoryId: type === "income" ? "income" : "food",
  description: "Golden B1b",
  recurring: false,
});
const now = new Date(2026, 8, 15);

// P: expectativas congeladas e executadas sobre 2b32caa antes da migração.
describe("B1b: goldens de paridade pré-migração", () => {
  it("receita 100, gastos 0,10+0,20 e transferência 1000", () => {
    const transfer: Transaction = {
      ...row(1000),
      type: "transfer",
      categoryId: "transfer",
      destinationAccountId: "reserva",
    };
    expect(
      summarize([row(100, undefined, "income"), row(0.1), row(0.2), transfer]),
    ).toEqual({ income: 100, expenses: 0.3, balance: 99.7, savingsRate: 99.7 });
  });
  it("transferência conserva total e abertura é inclusiva", () => {
    const { accounts } = defaultSettings();
    accounts[0].initialBalance = 5000;
    accounts[1].initialBalance = 2000;
    accounts.forEach((a) => (a.initialBalanceDate = "2026-09-10"));
    const transfer: Transaction = {
      ...row(1000),
      type: "transfer",
      categoryId: "transfer",
      destinationAccountId: "reserva",
    };
    const rows = [row(2000, undefined, "income"), row(500), transfer];
    expect(accountBalance(accounts[0], rows, "2026-09-09")).toBeNull();
    expect(accountBalance(accounts[0], rows, "2026-09-10")).toBe(5500);
    expect(accountBalance(accounts[1], rows, "2026-09-10")).toBe(3000);
    expect(totalAccountBalance(accounts, rows, "2026-09-10")).toBe(8500);
    accounts[1].initialBalanceDate = "2026-09-11";
    expect(totalAccountBalance(accounts, rows, "2026-09-10")).toBeNull();
  });
  it.each([
    [19.9, 29.9, 0.3, 16.7],
    [0.1, 0.2, 0.2, 0.17],
  ])("média de %s/%s/%s", (a, b, c, expected) => {
    expect(
      movingAverage(
        [row(a, "2026-08-10"), row(b, "2026-07-10"), row(c, "2026-06-10")],
        now,
      ).expenses,
    ).toBe(expected);
  });
  it("projeção 600 para 1200", () => {
    expect(
      closingProjection(
        [row(200, "2026-09-01"), row(200, "2026-09-05"), row(200)],
        now,
        now,
      ),
    ).toBe(1200);
  });
  it.each([
    [79.99, undefined],
    [80, 75],
    [100, 90],
  ])("orçamento %s/100", (amount, priority) => {
    const settings = defaultSettings();
    settings.categories[0].monthlyBudget = 100;
    expect(
      generateInsights(
        [row(1000, undefined, "income"), row(amount!)],
        now,
        settings,
        now,
      ).find((i) => i.id === "budget-food")?.priority,
    ).toBe(priority);
  });
  it.each([
    [300, false],
    [300.01, true],
  ])("anomalia de %s contra 250/250", (amount, expected) => {
    expect(
      detectAnomalies(
        [row(amount as number)],
        [[row(250)], [row(250)]],
        defaultSettings().categories,
      ).length > 0,
    ).toBe(expected);
  });
  it.each([
    [284.24, true],
    [284.25, false],
  ])("receita %s contra 334,40", (amount, expected) => {
    expect(
      generateInsights(
        [
          row(amount as number, undefined, "income"),
          row(334.4, "2026-08-10", "income"),
        ],
        now,
        undefined,
        now,
      ).some((i) => i.id === "income-drop"),
    ).toBe(expected);
  });
  it("base zero continua null e fallback de categoria é preservado", () => {
    expect(percentageChange(100, 0)).toBeNull();
    expect(budgetUsed(80, 0)).toBeNull();
    expect(budgetUsed(80)).toBeNull();
    expect(
      aggregateCategories([{ ...row(0.3), categoryId: "unknown" }], [])[0],
    ).toMatchObject({
      id: "unknown",
      name: "Categoria não cadastrada",
      amount: 0.3,
      share: 100,
      change: null,
      budgetPercent: null,
    });
  });
});

import {
  MoneyError,
  minorUnits,
  multiplyDivideRounded,
} from "../../utils/money";
import { moneyFromCalculation, moneyMinor } from "../../utils/format";
import {
  monthlyBalanceAverage,
  planningAmounts,
  goalProgress,
  totalIncome,
  totalExpenses,
} from "./calculations";
import {
  parseBackup,
  serializeBackup,
  validateBackupSnapshot,
} from "../transactions/backup";
import { validateSettings } from "../transactions/validation";

// Fixture/oracle independente: todos os lançamentos respeitam o teto legado.
// BigInt somente nos testes para construir quantidades sem perda IEEE.
function rowsFor(
  total: bigint,
  date = "2026-09-10",
  type: "income" | "expense" = "expense",
) {
  const rows: Transaction[] = [];
  const cap = 99999999900n;
  while (total > 0n) {
    const amount = total > cap ? cap : total;
    rows.push({
      ...row(Number(amount) / 100, date, type),
      id: `${type}-${date}-${rows.length}`,
    });
    total -= amount;
  }
  return rows;
}
const max = BigInt(Number.MAX_SAFE_INTEGER);

describe("B1b: novos limites checked (N), sem total parcial", () => {
  it("soma válida no teto; MAX_SAFE + 1 falha inclusive se saldo líquido caberia", () => {
    const incomes = rowsFor(max, undefined, "income");
    expect(moneyFromCalculation(totalIncome(incomes))).toBe(
      "R$\u00a090.071.992.547.409,91",
    );
    const more = [...incomes, row(0.01, undefined, "income"), row(0.01)];
    expect(() => totalIncome(more)).toThrowError(
      expect.objectContaining({ code: "overflow" }),
    );
    expect(() => summarize(more)).toThrow(MoneyError);
    expect(() => totalExpenses(rowsFor(max + 1n))).toThrow(MoneyError);
  });
  it.each(["income", "expense"] as const)(
    "prefixo de conta %s não é ocultado por cancelamento posterior",
    (type) => {
      const items = [
        ...rowsFor(max, undefined, type),
        row(0.01, undefined, type),
        row(0.01, undefined, type === "income" ? "expense" : "income"),
      ];
      expect(() =>
        accountBalance(
          {
            ...defaultSettings().accounts[0],
            initialBalanceDate: "2026-09-01",
          },
          items,
          "2026-09-15",
        ),
      ).toThrowError(expect.objectContaining({ code: "overflow" }));
    },
  );
  it("total de contas não confunde overflow com null de base desconhecida", () => {
    const settings = defaultSettings();
    settings.accounts.forEach((a) => (a.initialBalanceDate = "2026-09-01"));
    settings.accounts[1].initialBalance = 0.01;
    expect(() =>
      totalAccountBalance(
        settings.accounts,
        rowsFor(max, undefined, "income"),
        "2026-09-15",
      ),
    ).toThrowError(expect.objectContaining({ code: "overflow" }));
  });
  it("média não usa soma maior que MAX mesmo com quociente seguro", () => {
    const items = [
      ...rowsFor(max / 2n + 1n, "2026-08-10"),
      ...rowsFor(max / 2n + 1n, "2026-07-10"),
    ];
    expect(() => movingAverage(items, now)).toThrowError(
      expect.objectContaining({ code: "overflow" }),
    );
  });
  it("projeção com resultado acima do limite falha explicitamente", () => {
    const items = rowsFor(max);
    items[0].date = "2026-09-01";
    items[1].date = "2026-09-03";
    items[2].date = "2026-09-05";
    // Todo o acumulado precisa estar antes do dia 7.
    items.slice(3).forEach((t) => (t.date = "2026-09-05"));
    expect(() =>
      closingProjection(items, now, new Date(2026, 8, 7)),
    ).toThrowError(expect.objectContaining({ code: "overflow" }));
  });
  it("variação entre saldos opostos e saldo médio verificam diferenças/somas", () => {
    expect(() => percentageChange(90000000000000, -90000000000000)).toThrow(
      MoneyError,
    );
    const items = [
      ...rowsFor(max / 2n + 1n, "2026-08-10", "income"),
      ...rowsFor(max / 2n + 1n, "2026-07-10", "income"),
    ];
    expect(() => monthlyBalanceAverage(items, now)).toThrow(MoneyError);
  });
  it("saída R$ incapaz de roundtrip fica indisponível mesmo com centavos seguros", () => {
    expect(() =>
      totalIncome(rowsFor(9007199254740990n, undefined, "income")),
    ).toThrowError(expect.objectContaining({ code: "precision" }));
  });
});

describe("B1b: correções explícitas matemáticas (C)", () => {
  it("média MAX_SAFE/3 usa quociente/resto, não o centavo IEEE extra", () => {
    expect(Math.round(Number.MAX_SAFE_INTEGER / 3)).toBe(3002399751580331);
    expect(
      multiplyDivideRounded(minorUnits(Number.MAX_SAFE_INTEGER), 1, 3),
    ).toBe(3002399751580330);
    const third = max / 3n;
    const items = [
      ...rowsFor(third, "2026-08-10"),
      ...rowsFor(third, "2026-07-10"),
      ...rowsFor(third + 1n, "2026-06-10"),
    ];
    expect(movingAverage(items, now).expenses).toBe(30023997515803.3);
    expect(moneyFromCalculation(movingAverage(items, now).expenses!)).toBe(
      "R$\u00a030.023.997.515.803,30",
    );
  });
  it("projeção mantém resultado exato quando produto por 31 seria inseguro", () => {
    const total = 300000000000001n,
      items = rowsFor(total, "2026-01-05");
    items[0].date = "2026-01-01";
    items[1].date = "2026-01-03";
    const date = new Date(2026, 0, 31);
    expect(total * 31n > max).toBe(true);
    expect(closingProjection(items, date, date)).toBe(3000000000000.01);
    expect(moneyFromCalculation(closingProjection(items, date, date)!)).toBe(
      "R$\u00a03.000.000.000.000,01",
    );
  });
  it("anomalia compara produtos exatos com média cujo acumulador ainda cabe", () => {
    const average = 3500000000000003n,
      amount = 4200000000000004n;
    expect(Number(amount) * 100 === Number(average) * 120).toBe(true);
    expect(amount * 100n > average * 120n).toBe(true);
    const insight = detectAnomalies(
      rowsFor(amount),
      [rowsFor(average, "2026-08-10"), rowsFor(average, "2026-07-10")],
      defaultSettings().categories,
    )[0];
    expect(insight.id).toBe("food");
    expect(insight.description).toContain("35.000.000.000.000,03");
  });
  it("receita extrema não ganha alerta falso por empate de produto IEEE", () => {
    const before = 7000000000000001n,
      current = 5950000000000001n;
    expect(Number(current) * 100 <= Number(before) * 85).toBe(true);
    expect(current * 100n > before * 85n).toBe(true);
    expect(
      generateInsights(
        [
          ...rowsFor(current, undefined, "income"),
          ...rowsFor(before, "2026-08-10", "income"),
        ],
        now,
        undefined,
        now,
      ).some((i) => i.id === "income-drop"),
    ).toBe(false);
  });
  it("limiar da projeção usa racional exato e frase mantém centavos", () => {
    const average = 3500000000000005n,
      projected = 4025000000000006n;
    expect(Number(projected) * 100 === Number(average) * 115).toBe(true);
    expect(projected * 100n > average * 115n).toBe(true);
    const items = [
      ...rowsFor(average, "2025-12-05"),
      ...rowsFor(average, "2025-11-05"),
      ...rowsFor(projected, "2026-01-05"),
      ...rowsFor(projected, "2026-01-10", "income"),
    ];
    items.find((t) => t.date === "2026-01-05")!.date = "2026-01-01";
    items.find((t) => t.date === "2026-01-05")!.date = "2026-01-03";
    const date = new Date(2026, 0, 31);
    const insight = generateInsights(items, date, undefined, date).find(
      (i) => i.id === "projection",
    );
    expect(insight?.description).toContain("40.250.000.000.000,06");
    expect(insight?.description).toContain("5.250.000.000.000,01");
  });
  it("apresentação canônica preserva o último centavo que Intl decimal perderia", () => {
    const value = Number.MAX_SAFE_INTEGER / 100;
    expect(
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(value),
    ).toBe("R$\u00a090.071.992.547.409,90");
    expect(moneyFromCalculation(value)).toBe(
      moneyMinor(minorUnits(Number.MAX_SAFE_INTEGER)),
    );
    expect(moneyFromCalculation(value)).toBe("R$\u00a090.071.992.547.409,91");
  });
  it("meta 9c/40c preserva empate para cima em vez de 22% por ruído IEEE", () => {
    expect(Math.round((0.09 / 0.4) * 100)).toBe(22);
    expect(
      goalProgress({
        id: "g",
        name: "Meta",
        targetAmount: 0.4,
        currentAmount: 0.09,
        deadline: "2027-01-01",
      }),
    ).toEqual({ remaining: 31, percent: 23 });
  });
});

describe("B1b: planejamento e preservação raw", () => {
  it("planejamento e meta usam centavos, sem virar realizado", () => {
    const settings = defaultSettings();
    settings.plannedIncome = 0.6;
    settings.fixedExpenses = [
      { id: "a", description: "A", amount: 0.1 },
      { id: "b", description: "B", amount: 0.2 },
    ];
    settings.goals = [
      {
        id: "g",
        name: "Meta",
        targetAmount: 0.3,
        currentAmount: 0.1,
        deadline: "2027-01-01",
      },
    ];
    expect(planningAmounts(settings)).toEqual({ fixed: 30, available: 30 });
    expect(goalProgress(settings.goals[0])).toEqual({
      remaining: 20,
      percent: 33,
    });
    expect(goalProgress({ ...settings.goals[0], currentAmount: 0.4 })).toEqual({
      remaining: 0,
      percent: 133,
    });
    expect(goalProgress({ ...settings.goals[0], targetAmount: 0 })).toEqual({
      remaining: 0,
      percent: null,
    });
    expect(summarize([]).balance).toBe(0);
  });
  it("fixed expenses verifica soma e renda disponível assinada", () => {
    const settings = defaultSettings();
    settings.plannedIncome = 0.1;
    settings.fixedExpenses = [{ id: "a", description: "Fixa", amount: 0.3 }];
    expect(planningAmounts(settings)).toEqual({ fixed: 30, available: -20 });
    settings.fixedExpenses = rowsFor(max + 1n).map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
    }));
    expect(() => planningAmounts(settings)).toThrowError(
      expect.objectContaining({ code: "overflow" }),
    );
  });
  it.each([
    "plannedIncome",
    "fixed",
    "goal",
    "account",
    "budget",
    "threshold",
  ] as const)(
    "subcentavo %s permanece válido no snapshot/backup, derivado falha",
    (field) => {
      const settings = defaultSettings();
      settings.accounts.forEach((a) => (a.initialBalanceDate = "2026-09-01"));
      settings.goals = [
        {
          id: "g",
          name: "Meta",
          targetAmount: 1,
          currentAmount: 0,
          deadline: "2027-01-01",
        },
      ];
      const operations = {
        plannedIncome: () => planningAmounts(settings),
        fixed: () => planningAmounts(settings),
        goal: () => goalProgress(settings.goals[0]),
        account: () => accountBalance(settings.accounts[0], [], "2026-09-15"),
        budget: () => aggregateCategories([row(1)], [], settings.categories),
        threshold: () => generateInsights([row(1)], now, settings, now),
      };
      if (field === "plannedIncome") settings.plannedIncome = 1e-8;
      if (field === "fixed")
        settings.fixedExpenses = [
          { id: "f", description: "Fixa raw", amount: 1e-8 },
        ];
      if (field === "goal") settings.goals[0].targetAmount = 1e-8;
      if (field === "account") settings.accounts[0].initialBalance = 1e-8;
      if (field === "budget") settings.categories[0].monthlyBudget = 1e-8;
      if (field === "threshold") settings.lowBalanceThreshold = 1e-8;
      const before = structuredClone(settings),
        snapshot = { settings, transactions: [] };
      expect(validateSettings(settings, true)).toBe(settings);
      expect(validateBackupSnapshot(snapshot).settings).toBe(settings);
      expect(() => operations[field]()).toThrowError(
        expect.objectContaining({ code: "subcentavo" }),
      );
      expect(parseBackup(serializeBackup(snapshot)).settings).toEqual(before);
      expect(settings).toEqual(before);
    },
  );
  it("backup de soma em overflow preserva campos, source e extras sem calcular", () => {
    const settings = defaultSettings(),
      transactions = rowsFor(max + 1n);
    transactions[0] = {
      ...transactions[0],
      source: "import",
      createdAt: "2026-09-10T12:00:00Z",
    };
    Object.assign(transactions[0], { externalNote: "raw mantido" });
    const snapshot = { settings, transactions };
    expect(validateBackupSnapshot(snapshot).transactions).toBe(transactions);
    expect(() => summarize(transactions)).toThrow(MoneyError);
    const restored = parseBackup(serializeBackup(snapshot));
    expect(restored.transactions).toEqual(transactions);
    expect(restored.settings).toEqual(settings);
  });
});

import { compareSummaries } from "./calculations";

describe("B1b: composição visual usa resultados calculados no domínio", () => {
  it("compara os três cards antes da saída R$ e preserva base zero", () => {
    expect(
      compareSummaries(
        [row(0.3, undefined, "income"), row(0.1)],
        [row(0.1, undefined, "income"), row(0.2)],
      ),
    ).toEqual({
      current: {
        income: 0.3,
        expenses: 0.1,
        balance: 0.2,
        savingsRate: 66.66666666666666,
      },
      previous: {
        income: 0.1,
        expenses: 0.2,
        balance: -0.1,
        savingsRate: -100,
      },
      changes: { income: 200, expenses: -50, balance: 300 },
    });
    expect(
      compareSummaries([row(100, undefined, "income")], []).changes,
    ).toEqual({ income: null, expenses: null, balance: null });
  });
  it("cards propagam diferença de saldos em overflow para o catch de Overview", () => {
    expect(() =>
      compareSummaries(
        rowsFor(max, undefined, "income"),
        rowsFor(max, "2026-08-10"),
      ),
    ).toThrowError(expect.objectContaining({ code: "overflow" }));
  });
  it.each([
    [79.99, false],
    [80, true],
    [100, true],
  ])("flag visual de orçamento exato em %s", (amount, expected) => {
    const settings = defaultSettings();
    settings.categories[0].monthlyBudget = 100;
    expect(
      aggregateCategories([row(amount as number)], [], settings.categories)[0]
        .attention,
    ).toBe(expected);
  });
  it.each([
    [119.99, false],
    [120, true],
  ])("flag visual do comparativo em %s preserva >=20%%", (amount, expected) => {
    expect(
      aggregateCategories([row(amount as number)], [row(100)])[0].attention,
    ).toBe(expected);
  });
  it("saldo médio do gráfico mantém lacunas, zero real e empate negativo", () => {
    expect(monthlyBalanceAverage([], now)).toBeNull();
    expect(
      monthlyBalanceAverage(
        [
          row(0.01, "2026-08-10"),
          row(1, "2026-07-10", "income"),
          row(1, "2026-07-10"),
        ],
        now,
      ),
    ).toBe(0);
    expect(
      monthlyBalanceAverage(
        [row(50, "2026-08-10", "income"), row(100, "2026-07-10")],
        now,
      ),
    ).toBe(-25);
  });
});

describe("B1b: diferença percentual ordinária calculada em centavos (C)", () => {
  it("elimina ruído da subtração R$ 0,30 menos R$ 0,10 sem arredondar a decisão visual", () => {
    expect(((0.3 - 0.1) / 0.1) * 100).toBe(199.99999999999997);
    expect(percentageChange(0.3, 0.1)).toBe(200);
  });
});
