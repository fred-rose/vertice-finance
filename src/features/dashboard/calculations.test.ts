import { describe, expect, it } from "vitest";
import {
  accountBalance,
  aggregateCategories,
  budgetUsed,
  closingProjection,
  comparablePeriods,
  generateInsights,
  monthlyData,
  movingAverage,
  netBalance,
  percentageChange,
  summarize,
  totalIncome,
  totalExpenses,
  totalAccountBalance,
  detectAnomalies,
} from "./calculations";
import { accountBalanceLabel } from "../../utils/format";
import { defaultSettings } from "../../data/catalog";
import type { Transaction } from "../../types/finance";
const t = (patch: Partial<Transaction> = {}): Transaction => {
  const base = {
    id: "test",
    amount: 10,
    categoryId: "food",
    description: "Teste",
    accountId: "principal",
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
};
const now = new Date(2026, 8, 15);
describe("Cálculos financeiros", () => {
  it("soma centavos e exclui transferências do resultado", () => {
    const items = [
      t({ type: "income", amount: 100 }),
      t({ amount: 0.1 }),
      t({ amount: 0.2 }),
      t({ type: "transfer", amount: 1000 }),
    ];
    expect(summarize(items)).toEqual({
      income: 100,
      expenses: 0.3,
      balance: 99.7,
      savingsRate: 99.7,
    });
    expect(netBalance(items)).toBe(99.7);
  });
  it("trata base zero e melhora de resultado negativo", () => {
    expect(percentageChange(100, 0)).toBeNull();
    expect(percentageChange(-50, -100)).toBe(50);
    expect(summarize([]).savingsRate).toBeNull();
  });
  it("mantém meses sem registros como lacunas e atravessa o ano", () => {
    const data = monthlyData(
      [
        t({ date: "2025-12-31", type: "income", amount: 500 }),
        t({ date: "2026-01-01", amount: 50 }),
      ],
      new Date(2026, 0, 1),
    );
    expect(data).toHaveLength(6);
    expect(data.at(-2)?.balance).toBe(500);
    expect(data.at(-1)?.balance).toBe(-50);
    expect(data[0].balance).toBeNull();
  });
  it("compara o mesmo intervalo e limita fevereiro em ano bissexto", () => {
    const result = comparablePeriods(
      [
        t({ date: "2024-02-29" }),
        t({ date: "2024-03-15" }),
        t({ date: "2024-03-30" }),
      ],
      new Date(2024, 2, 1),
      new Date(2024, 2, 31),
    );
    expect(result.previous).toHaveLength(1);
    expect(result.label).toContain("29");
    expect(
      comparablePeriods(
        [t({ date: "2026-08-20" }), t({ date: "2026-08-10" })],
        now,
        now,
      ).previous,
    ).toHaveLength(1);
  });
  it("não elogia mês vazio ou apenas transferências", () => {
    const before = [t({ date: "2026-08-01", amount: 3000 })];
    expect(generateInsights(before, now, undefined, now)).toEqual([]);
    expect(
      generateInsights(
        [...before, t({ type: "transfer" })],
        now,
        undefined,
        now,
      ),
    ).toEqual([]);
  });
  it("prioriza déficit mesmo com várias categorias atípicas", () => {
    const history = ["food", "transport", "leisure"].flatMap((categoryId) => [
      t({ categoryId, date: "2026-07-10", amount: 100 }),
      t({ categoryId, date: "2026-08-10", amount: 100 }),
      t({ categoryId, amount: 10000 }),
    ]);
    const insights = generateInsights(history, now, undefined, now);
    expect(insights).toHaveLength(3);
    expect(insights[0].id).toBe("negative");
  });
  it("não trata um único mês como padrão de anomalia", () => {
    expect(
      generateInsights(
        [t({ date: "2026-08-01", amount: 100 }), t({ amount: 1000 })],
        now,
        undefined,
        now,
      ).some((i) => i.id === "food"),
    ).toBe(false);
  });
  it("detecta orçamento atingido sem duplicar alerta da categoria", () => {
    const settings = defaultSettings();
    settings.categories[0].monthlyBudget = 100;
    const rows = [
      t({ type: "income", amount: 2000 }),
      t({ amount: 200 }),
      t({ date: "2026-08-10", amount: 20 }),
      t({ date: "2026-07-10", amount: 20 }),
    ];
    const insights = generateInsights(rows, now, settings, now);
    expect(insights[0].id).toBe("budget-food");
    expect(insights.some((i) => i.id === "food")).toBe(false);
    expect(budgetUsed(80, 100)).toBe(80);
    expect(budgetUsed(80, 0)).toBeNull();
  });
  it("atualiza categoria sem perder categorias desconhecidas", () => {
    const data = aggregateCategories(
      [t({ categoryId: "custom", amount: 150 })],
      [t({ categoryId: "custom", amount: 100 })],
    );
    expect(data[0]).toMatchObject({ amount: 150, share: 100, change: 50 });
  });
  it("calcula saldos por conta sem duplicar transferências", () => {
    const settings = defaultSettings();
    const account = {
      ...settings.accounts[0],
      initialBalance: 1000,
      initialBalanceDate: "2026-09-01",
    };
    const rows = [
      t({ date: "2026-08-31", amount: 999 }),
      t({ type: "income", amount: 100 }),
      t({ amount: 50 }),
      t({ type: "transfer", amount: 300 }),
    ];
    expect(accountBalance(account, rows, "2026-09-15")).toBe(750);
    expect(accountBalance(settings.accounts[1], rows, "2026-09-15")).toBe(300);
    expect(accountBalance(account, rows, "2026-08-30")).toBeNull();
  });
  it("exige dias e registros suficientes para projetar", () => {
    const rows = [
      t({ date: "2026-09-01", amount: 100 }),
      t({ date: "2026-09-05", amount: 100 }),
      t({ date: "2026-09-10", amount: 100 }),
    ];
    expect(closingProjection(rows, now, now)).toBe(600);
    expect(closingProjection(rows.slice(0, 2), now, now)).toBeNull();
    expect(closingProjection(rows, now, new Date(2026, 8, 3))).toBeNull();
    expect(closingProjection(rows, new Date(2026, 7, 1), now)).toBeNull();
  });
  it("média usa somente meses registrados e alerta queda de receita", () => {
    const rows = [
      t({ date: "2026-08-10", amount: 100 }),
      t({ date: "2026-08-10", type: "income", amount: 1000 }),
      t({ type: "income", amount: 500 }),
      t({ amount: 100 }),
    ];
    expect(movingAverage(rows, now)).toMatchObject({
      months: 1,
      expenses: 100,
    });
    expect(
      generateInsights(rows, now, undefined, now).some(
        (i) => i.id === "income-drop",
      ),
    ).toBe(true);
  });
});

describe("Auditoria financeira: valores e limites", () => {
  it.each([
    ["uma receita", [t({ type: "income", amount: 5000 })], 5000, 0, 5000, 100],
    [
      "múltiplas receitas",
      [
        t({ type: "income", amount: 2000 }),
        t({ type: "income", amount: 3000 }),
      ],
      5000,
      0,
      5000,
      100,
    ],
    ["uma despesa", [t({ amount: 1500 })], 0, 1500, -1500, null],
    [
      "múltiplas despesas",
      [t({ amount: 1000 }), t({ amount: 500 })],
      0,
      1500,
      -1500,
      null,
    ],
    [
      "receita e despesa",
      [t({ type: "income", amount: 5000 }), t({ amount: 1500 })],
      5000,
      1500,
      3500,
      70,
    ],
    ["sem movimentos", [], 0, 0, 0, null],
    [
      "despesa maior que receita",
      [t({ type: "income", amount: 100 }), t({ amount: 150 })],
      100,
      150,
      -50,
      -50,
    ],
  ] as const)(
    "calcula %s",
    (_name, rows, income, expenses, balance, savingsRate) => {
      expect(totalIncome([...rows])).toBe(income);
      expect(totalExpenses([...rows])).toBe(expenses);
      expect(netBalance([...rows])).toBe(balance);
      expect(summarize([...rows])).toEqual({
        income,
        expenses,
        balance,
        savingsRate,
      });
    },
  );
  it("mantém centavos exatos na soma, nas categorias e nas contas", () => {
    const values = [0.1, 0.2, 0.3, 19.9, 29.9];
    const expenses = values.map((amount) => t({ amount }));
    const incomes = values.map((amount) => t({ amount, type: "income" }));
    expect(totalExpenses(expenses)).toBe(50.4);
    expect(totalIncome(incomes)).toBe(50.4);
    expect(netBalance([...incomes, ...expenses])).toBe(0);
    expect(aggregateCategories(expenses, [])[0].amount).toBe(50.4);
    expect(
      accountBalance(defaultSettings().accounts[0], expenses, "2026-09-15"),
    ).toBe(-50.4);
    expect(
      summarize([t({ type: "income", amount: 0.3 }), t({ amount: 0.1 })])
        .savingsRate,
    ).toBeCloseTo(200 / 3, 12);
  });
  it.each([
    [150, 100, 50],
    [50, 100, -50],
    [100, 100, 0],
    [100, 0, null],
    [0, 0, null],
    [-50, -100, 50],
    [-150, -100, -50],
    [50, -100, 150],
    [-50, 100, -150],
  ])("variação de %s contra %s", (current, previous, expected) => {
    expect(percentageChange(current, previous)).toBe(expected);
  });
  it.each([
    [50, 100, 50],
    [80, 100, 80],
    [100, 100, 100],
    [125, 100, 125],
    [0.56, 0.7, 80],
    [50, 0, null],
    [50, undefined, null],
  ] as const)("orçamento: gasto %s e limite %s", (amount, limit, expected) => {
    expect(budgetUsed(amount!, limit)).toBe(expected);
  });
  it("agrega duas categorias, participação, comparativo e orçamento sem contar receitas", () => {
    const settings = defaultSettings();
    settings.categories[0].monthlyBudget = 1000;
    const current = [
      t({ amount: 150 }),
      t({ amount: 50 }),
      t({ amount: 100, categoryId: "transport" }),
      t({ type: "income", amount: 5000 }),
    ];
    const data = aggregateCategories(
      current,
      [t({ amount: 100 })],
      settings.categories,
    );
    expect(data[0]).toMatchObject({
      id: "food",
      amount: 200,
      change: 100,
      budgetPercent: 20,
    });
    expect(data[0].share).toBeCloseTo(200 / 3, 12);
    expect(data[1]).toMatchObject({
      id: "transport",
      amount: 100,
      change: null,
      budgetPercent: null,
    });
    expect(data.reduce((sum, c) => sum + c.share, 0)).toBeCloseTo(100, 12);
  });
});

describe("Auditoria de contas e transferências", () => {
  it("preserva o total das contas e todos os indicadores ao adicionar, editar e excluir transferência", () => {
    const settings = defaultSettings();
    settings.accounts[0].initialBalance = 5000;
    settings.accounts[1].initialBalance = 2000;
    settings.accounts.forEach((account) => {
      account.initialBalanceDate = "2026-09-01";
    });
    settings.categories[0].monthlyBudget = 1000;
    settings.lowBalanceThreshold = 100;
    const base = [
      t({ type: "income", amount: 2000 }),
      t({ date: "2026-09-01", amount: 200 }),
      t({ date: "2026-09-04", amount: 200 }),
      t({ date: "2026-09-08", amount: 100 }),
      t({ date: "2026-07-10", amount: 500 }),
      t({ date: "2026-08-10", amount: 500 }),
    ];
    const effects = (rows: Transaction[]) => ({
      summary: summarize(rows),
      categories: aggregateCategories(rows, [], settings.categories),
      trend: monthlyData(rows, now),
      insights: generateInsights(rows, now, settings, now),
      budget: budgetUsed(totalExpenses(rows), 2000),
      average: movingAverage(rows, now).expenses,
      projection: closingProjection(rows, now, now),
    });
    const reference = effects(base);
    expect(accountBalance(settings.accounts[0], base, "2026-09-15")).toBe(6500);
    for (const [amount, origin, destination] of [
      [1000, 5500, 3000],
      [2500, 4000, 4500],
      [0, 6500, 2000],
    ]) {
      const rows = amount
        ? [...base, t({ id: "transfer", type: "transfer", amount })]
        : base;
      expect(effects(rows)).toEqual(reference);
      expect(accountBalance(settings.accounts[0], rows, "2026-09-15")).toBe(
        origin,
      );
      expect(accountBalance(settings.accounts[1], rows, "2026-09-15")).toBe(
        destination,
      );
      expect(totalAccountBalance(settings.accounts, rows, "2026-09-15")).toBe(
        8500,
      );
    }
    const reversed = [
      ...base,
      t({
        type: "transfer",
        amount: 1000,
        accountId: "reserva",
        destinationAccountId: "principal",
      }),
    ];
    expect(accountBalance(settings.accounts[0], reversed, "2026-09-15")).toBe(
      7500,
    );
    expect(accountBalance(settings.accounts[1], reversed, "2026-09-15")).toBe(
      1000,
    );
    expect(effects(reversed)).toEqual(reference);
  });
  it("respeita data inicial e data de consulta, inclusive no mesmo dia", () => {
    const account = {
      ...defaultSettings().accounts[0],
      initialBalance: 5000,
      initialBalanceDate: "2026-09-10",
    };
    const rows = [
      t({ type: "income", amount: 999, date: "2026-09-09" }),
      t({ type: "income", amount: 2000, date: "2026-09-10" }),
      t({ amount: 500, date: "2026-09-11" }),
      t({ amount: 999, date: "2026-09-16" }),
    ];
    expect(accountBalance(account, rows, "2026-09-09")).toBeNull();
    expect(accountBalance(account, rows, "2026-09-10")).toBe(7000);
    expect(accountBalance(account, rows, "2026-09-15")).toBe(6500);
  });
  it("não transforma saldo indisponível em zero nem dispara alerta baseado em total incompleto", () => {
    const settings = defaultSettings();
    settings.accounts[1].initialBalanceDate = "2026-09-16";
    settings.lowBalanceThreshold = 5000;
    const rows = [t({ type: "income", amount: 100 })];
    expect(
      totalAccountBalance(settings.accounts, rows, "2026-09-15"),
    ).toBeNull();
    expect(totalAccountBalance([], rows, "2026-09-15")).toBeNull();
    expect(accountBalanceLabel(null)).toBe(
      "Saldo indisponível para este período",
    );
    expect(accountBalanceLabel(0)).toContain("0,00");
    expect(
      generateInsights(rows, now, settings, now).some(
        (i) => i.id === "low-balance",
      ),
    ).toBe(false);
    expect(
      accountBalance(
        { ...settings.accounts[0], initialBalance: NaN },
        [],
        "2026-09-15",
      ),
    ).toBeNull();
    expect(
      accountBalance(
        { ...settings.accounts[0], initialBalanceDate: "" },
        [],
        "2026-09-15",
      ),
    ).toBeNull();
  });
  it("transferências não criam histórico financeiro, categorias, orçamento ou projeção", () => {
    const rows = [1, 5, 10].map((day) =>
      t({
        type: "transfer",
        date: `2026-09-${String(day).padStart(2, "0")}`,
        amount: 1000,
      }),
    );
    expect(summarize(rows)).toEqual({
      income: 0,
      expenses: 0,
      balance: 0,
      savingsRate: null,
    });
    expect(
      aggregateCategories(rows, []).every(
        (c) => c.amount === 0 && c.share === 0,
      ),
    ).toBe(true);
    expect(
      monthlyData(rows, now).every((m) => m.balance === null && !m.hasData),
    ).toBe(true);
    expect(closingProjection(rows, now, now)).toBeNull();
    expect(generateInsights(rows, now, defaultSettings(), now)).toEqual([]);
  });
});

describe("Auditoria de períodos, médias e projeção", () => {
  it.each([
    [6, null],
    [7, 1285.71],
  ])(
    "respeita o dia mínimo da projeção mesmo com três datas de gasto: dia %s",
    (day, expected) => {
      const rows = [1, 3, 5].map((date) =>
        t({ date: `2026-09-0${date}`, amount: 100 }),
      );
      expect(closingProjection(rows, now, new Date(2026, 8, day))).toBe(
        expected,
      );
    },
  );
  it.each([
    [
      "mês encerrado",
      "2026-08-01",
      "2026-09-15",
      ["2026-08-01", "2026-08-31"],
      ["2026-07-01", "2026-07-31"],
      ["2026-06-30", "2026-09-01"],
    ],
    [
      "mês parcial",
      "2026-09-01",
      "2026-09-15",
      ["2026-09-01", "2026-09-15"],
      ["2026-08-01", "2026-08-15"],
      ["2026-09-16", "2026-08-16"],
    ],
    [
      "fevereiro",
      "2026-02-01",
      "2026-02-28",
      ["2026-02-01", "2026-02-28"],
      ["2026-01-01", "2026-01-28"],
      ["2026-01-29", "2026-03-01"],
    ],
    [
      "dezembro para janeiro",
      "2026-01-01",
      "2026-01-15",
      ["2026-01-01", "2026-01-15"],
      ["2025-12-01", "2025-12-15"],
      ["2025-12-16", "2026-01-16"],
    ],
    [
      "31 contra 28 dias",
      "2026-03-01",
      "2026-03-31",
      ["2026-03-01", "2026-03-31"],
      ["2026-02-01", "2026-02-28"],
      ["2026-01-31", "2026-04-01"],
    ],
    [
      "fevereiro bissexto",
      "2024-03-01",
      "2024-03-31",
      ["2024-03-01", "2024-03-31"],
      ["2024-02-01", "2024-02-29"],
      ["2024-01-31", "2024-04-01"],
    ],
  ] as const)(
    "compara %s",
    (_name, selected, today, current, previous, outside) => {
      const result = comparablePeriods(
        [...current, ...previous, ...outside].map((date) => t({ date })),
        new Date(`${selected}T12:00:00`),
        new Date(`${today}T12:00:00`),
      );
      expect(result.current.map((t) => t.date)).toEqual(current);
      expect(result.previous.map((t) => t.date)).toEqual(previous);
    },
  );
  it("mantém ordem dos seis meses e diferencia zero real de lacunas", () => {
    const rows = [
      t({ date: "2025-12-10", type: "income", amount: 100 }),
      t({ date: "2025-12-11", amount: 100 }),
      t({ date: "2026-01-10", type: "transfer" }),
    ];
    const data = monthlyData(rows, new Date(2026, 0, 1));
    expect(data.map((m) => m.key)).toEqual([
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ]);
    expect(data[4]).toMatchObject({ balance: 0, expenses: 100, hasData: true });
    expect(data[5]).toMatchObject({
      balance: null,
      expenses: null,
      hasData: false,
    });
  });
  it.each([
    [0, null],
    [1, 19.9],
    [2, 24.9],
    [3, 16.7],
  ] as const)("média móvel com %s meses válidos", (count, expected) => {
    const history = [
      t({ date: "2026-08-01", amount: 19.9 }),
      t({ date: "2026-07-01", amount: 29.9 }),
      t({ date: "2026-06-01", amount: 0.3 }),
    ].slice(0, count);
    const data = movingAverage(
      [
        ...history,
        t({ date: "2026-05-01", amount: 999 }),
        t({ date: "2026-08-01", type: "transfer", amount: 999 }),
        t({ amount: 999 }),
      ],
      now,
    );
    expect(data.months).toBe(count);
    expect(data.expenses).toBe(expected);
  });
  it("arredonda média monetária ao centavo e inclui mês com receita registrada", () => {
    expect(
      movingAverage(
        [
          t({ date: "2026-08-01", amount: 0.1 }),
          t({ date: "2026-07-01", amount: 0.2 }),
          t({ date: "2026-06-01", type: "income", amount: 10 }),
        ],
        now,
      ).expenses,
    ).toBe(0.1);
    expect(
      movingAverage(
        [
          t({ date: "2026-08-01", amount: 0.1 }),
          t({ date: "2026-07-01", amount: 0.2 }),
          t({ date: "2026-06-01", amount: 0.2 }),
        ],
        now,
      ).expenses,
    ).toBe(0.17);
  });
  it.each([
    ["2026-02-15", 28, 15],
    ["2024-02-15", 29, 15],
    ["2026-09-07", 30, 7],
    ["2026-01-31", 31, 31],
  ] as const)("projeta pelos dias corridos em %s", (today, days, elapsed) => {
    const date = new Date(`${today}T12:00:00`),
      prefix = today.slice(0, 7);
    const rows = [
      t({ date: `${prefix}-01`, amount: 19.9 }),
      t({ date: `${prefix}-03`, amount: 29.9 }),
      t({ date: `${prefix}-05`, amount: 0.3 }),
    ];
    expect(closingProjection(rows, date, date)).toBe(
      Math.round((5010 * days) / elapsed) / 100,
    );
  });
  it("não deixa receitas, transferências ou datas futuras preencherem o mínimo da projeção", () => {
    const rows = [
      t({ date: "2026-09-01", amount: 100 }),
      t({ date: "2026-09-05", amount: 100 }),
      t({ date: "2026-09-10", type: "income", amount: 999 }),
      t({ date: "2026-09-11", type: "transfer", amount: 999 }),
      t({ date: "2026-09-16", amount: 999 }),
    ];
    expect(closingProjection(rows, now, now)).toBeNull();
    expect(
      closingProjection(
        [...rows, t({ date: "2026-09-12", amount: 100 })],
        now,
        now,
      ),
    ).toBe(600);
  });
});

describe("Auditoria de insights", () => {
  it.each([
    [79.99, false],
    [80, true],
  ])(
    "respeita o centavo no limiar de atenção do orçamento: %s",
    (amount, expected) => {
      const settings = defaultSettings();
      settings.categories[0].monthlyBudget = 100;
      const insights = generateInsights(
        [t({ type: "income", amount: 1000 }), t({ amount })],
        now,
        settings,
        now,
      );
      expect(insights.some((i) => i.id === "budget-food")).toBe(expected);
    },
  );
  it.each([
    [300, false],
    [300.01, true],
  ])(
    "exige crescimento superior a 20%% para anomalia: %s",
    (amount, expected) => {
      const history = [[t({ amount: 250 })], [t({ amount: 250 })]];
      expect(
        detectAnomalies(
          [t({ amount })],
          history,
          defaultSettings().categories,
        ).some((i) => i.id === "food"),
      ).toBe(expected);
    },
  );
  it.each([
    [50, false],
    [80, true],
    [100, true],
    [125, true],
  ] as const)("alerta de orçamento em %s%%", (amount, expected) => {
    const settings = defaultSettings();
    settings.categories[0].monthlyBudget = 100;
    const insights = generateInsights(
      [t({ type: "income", amount: 1000 }), t({ amount })],
      now,
      settings,
      now,
    );
    expect(insights.some((i) => i.id === "budget-food")).toBe(expected);
    if (expected)
      expect(insights.find((i) => i.id === "budget-food")?.priority).toBe(
        amount >= 100 ? 90 : 75,
      );
  });
  it("respeita a prioridade de déficit, saldo baixo e orçamento excedido", () => {
    const settings = defaultSettings();
    settings.lowBalanceThreshold = 1000;
    settings.categories[0].monthlyBudget = 500;
    const rows = [
      t({ type: "income", amount: 100 }),
      t({ amount: 1000 }),
      t({ date: "2026-08-10", amount: 100 }),
      t({ date: "2026-07-10", amount: 100 }),
    ];
    const insights = generateInsights(rows, now, settings, now);
    expect(insights.map((i) => i.id)).toEqual([
      "negative",
      "low-balance",
      "budget-food",
    ]);
    expect(new Set(insights.map((i) => i.id)).size).toBe(insights.length);
  });
  it("inclui a queda de receita de exatamente R$ 50 sem erro de ponto flutuante", () => {
    const rows = [
      t({ type: "income", amount: 14.07 }),
      t({ type: "income", date: "2026-08-10", amount: 64.07 }),
    ];
    expect(
      generateInsights(rows, now, undefined, now).find(
        (i) => i.id === "income-drop",
      )?.description,
    ).toContain("50,00");
  });
  it.each([
    [284.24, true],
    [284.25, false],
  ])(
    "respeita o limite exato de 15%% de queda de receita: %s",
    (amount, expected) => {
      const rows = [
        t({ type: "income", amount }),
        t({ type: "income", date: "2026-08-10", amount: 334.4 }),
      ];
      expect(
        generateInsights(rows, now, undefined, now).some(
          (i) => i.id === "income-drop",
        ),
      ).toBe(expected);
    },
  );
  it("ignora oscilações pequenas de renda e de gastos", () => {
    const rows = [
      t({ type: "income", amount: 980 }),
      t({ amount: 101 }),
      t({ type: "income", date: "2026-08-10", amount: 1000 }),
      t({ date: "2026-08-10", amount: 100 }),
    ];
    expect(generateInsights(rows, now, undefined, now)).toEqual([]);
  });
  it("detecta anomalia só acima dos limites mínimo e percentual", () => {
    const history = [[t({ amount: 100 })], [t({ amount: 100 })]];
    expect(
      detectAnomalies(
        [t({ amount: 150 })],
        history,
        defaultSettings().categories,
      )[0].id,
    ).toBe("food");
    expect(
      detectAnomalies(
        [t({ amount: 149.99 })],
        history,
        defaultSettings().categories,
      ),
    ).toEqual([]);
    expect(
      detectAnomalies(
        [t({ amount: 120 })],
        history,
        defaultSettings().categories,
      ),
    ).toEqual([]);
  });
  it("avisa sobre projeção acima da média sem inventar gastos futuros realizados", () => {
    const rows = [
      t({ type: "income", amount: 5000 }),
      t({ date: "2026-09-01", amount: 200 }),
      t({ date: "2026-09-05", amount: 200 }),
      t({ date: "2026-09-10", amount: 200 }),
      t({ date: "2026-08-10", amount: 1000 }),
      t({ date: "2026-07-10", amount: 1000 }),
    ];
    const insights = generateInsights(rows, now, undefined, now);
    expect(insights.map((i) => i.id)).toEqual(["projection"]);
    expect(insights[0].description).toContain("1.200,00");
    expect(
      summarize(rows.filter((t) => t.date.startsWith("2026-09"))).expenses,
    ).toBe(600);
  });
  it("identifica melhora de sobra em mês encerrado e não comemora déficit", () => {
    const rows = [
      t({ date: "2026-07-10", type: "income", amount: 5000 }),
      t({ date: "2026-07-10", amount: 2000 }),
      t({ date: "2026-08-10", type: "income", amount: 5000 }),
      t({ date: "2026-08-10", amount: 1500 }),
    ];
    const insights = generateInsights(
      rows,
      new Date(2026, 7, 1),
      undefined,
      now,
    );
    expect(insights.find((i) => i.id === "savings")?.description).toContain(
      "500,00",
    );
    expect(insights.find((i) => i.id === "spending")?.tone).toBe("positive");
    const deficit = [
      t({ date: "2026-07-10", amount: 2000 }),
      t({ date: "2026-08-10", amount: 1000 }),
    ];
    expect(
      generateInsights(deficit, new Date(2026, 7, 1), undefined, now).every(
        (i) => i.tone !== "positive",
      ),
    ).toBe(true);
  });
});
