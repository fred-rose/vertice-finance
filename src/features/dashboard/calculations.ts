import type {
  Account,
  Category,
  FinancialSummary,
  FinanceSettings,
  Insight,
  Transaction,
} from "../../types/finance";
import { categories as defaultCategories } from "../../data/catalog";
import { localDate, money, monthKey } from "../../utils/format";
import { validDate } from "../transactions/validation";
const cents = (value: number) => Math.round(value * 100);
export const totalIncome = (items: Transaction[]) =>
  items
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + cents(t.amount), 0) / 100;
export const totalExpenses = (items: Transaction[]) =>
  items
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + cents(t.amount), 0) / 100;
export const netBalance = (items: Transaction[]) =>
  (cents(totalIncome(items)) - cents(totalExpenses(items))) / 100;
export const percentageChange = (current: number, previous: number) =>
  previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
export const forMonth = (items: Transaction[], date: Date) =>
  items.filter((t) => t.date.startsWith(monthKey(date)));
export function summarize(items: Transaction[]): FinancialSummary {
  const income = totalIncome(items),
    expenses = totalExpenses(items);
  return {
    income,
    expenses,
    balance: netBalance(items),
    savingsRate:
      income > 0
        ? ((cents(income) - cents(expenses)) / cents(income)) * 100
        : null,
  };
}
export function comparablePeriods(
  items: Transaction[],
  selected: Date,
  now = new Date(),
) {
  const partial = monthKey(selected) === monthKey(now);
  const before = new Date(selected.getFullYear(), selected.getMonth() - 1, 1);
  const cutoff = partial
    ? Math.min(
        now.getDate(),
        new Date(before.getFullYear(), before.getMonth() + 1, 0).getDate(),
      )
    : 31;
  return {
    current: forMonth(items, selected).filter(
      (t) => !partial || Number(t.date.slice(8)) <= now.getDate(),
    ),
    previous: forMonth(items, before).filter(
      (t) => Number(t.date.slice(8)) <= cutoff,
    ),
    label: partial
      ? `Comparação até o dia ${now.getDate()} (mês anterior até o dia ${cutoff}). Registros ausentes não comprovam ausência de gastos.`
      : "Comparação entre meses registrados. Registros ausentes não comprovam ausência de gastos.",
    partial,
  };
}
export const budgetUsed = (amount: number, budget?: number) =>
  budget && budget > 0 ? (cents(amount) / cents(budget)) * 100 : null;
export function aggregateCategories(
  items: Transaction[],
  previous: Transaction[],
  catalog: Category[] = defaultCategories,
) {
  const total = totalExpenses(items);
  const known = catalog.filter((c) => c.type === "expense");
  const unknown = [
    ...new Set(
      [...items, ...previous]
        .filter(
          (t) =>
            t.type === "expense" && !known.some((c) => c.id === t.categoryId),
        )
        .map((t) => t.categoryId),
    ),
  ];
  const all: Category[] = [
    ...known,
    ...unknown.map((id) => ({
      id,
      name: "Categoria não cadastrada",
      color: "#6a8580",
      type: "expense" as const,
    })),
  ];
  return all
    .map((category) => {
      const amount = totalExpenses(
        items.filter((t) => t.categoryId === category.id),
      );
      const before = totalExpenses(
        previous.filter((t) => t.categoryId === category.id),
      );
      return {
        ...category,
        amount,
        share: total ? (amount / total) * 100 : 0,
        change: percentageChange(amount, before),
        budgetPercent: budgetUsed(amount, category.monthlyBudget),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
export function monthlyData(items: Transaction[], selected: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      selected.getFullYear(),
      selected.getMonth() - 5 + index,
      1,
    );
    const records = forMonth(items, date).filter((t) => t.type !== "transfer");
    const summary = summarize(records);
    return {
      month: new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(date)
        .replace(".", ""),
      key: monthKey(date),
      ...summary,
      balance: records.length ? summary.balance : null,
      expenses: records.length ? summary.expenses : null,
      hasData: records.length > 0,
    };
  });
}
export function movingAverage(
  items: Transaction[],
  selected: Date,
  months = 3,
) {
  const values = Array.from({ length: months }, (_, i) =>
    forMonth(
      items,
      new Date(selected.getFullYear(), selected.getMonth() - i - 1, 1),
    ),
  ).filter((rows) => rows.some((t) => t.type !== "transfer"));
  return {
    months: values.length,
    expenses: values.length
      ? Math.round(
          values.reduce((sum, rows) => sum + cents(totalExpenses(rows)), 0) /
            values.length,
        ) / 100
      : null,
    records: values,
  };
}
export function closingProjection(
  items: Transaction[],
  selected: Date,
  now = new Date(),
) {
  const current = forMonth(items, selected).filter(
    (t) => t.date <= localDate(now) && t.type === "expense",
  );
  if (
    monthKey(selected) !== monthKey(now) ||
    now.getDate() < 7 ||
    new Set(current.map((t) => t.date)).size < 3
  )
    return null;
  return (
    Math.round(
      (cents(totalExpenses(current)) *
        new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) /
        now.getDate(),
    ) / 100
  );
}
export function accountBalance(
  account: Account,
  items: Transaction[],
  asOf = localDate(),
) {
  if (
    !Number.isFinite(account.initialBalance) ||
    !validDate(account.initialBalanceDate) ||
    !validDate(asOf) ||
    asOf < account.initialBalanceDate
  )
    return null;
  return (
    items
      .filter((t) => t.date >= account.initialBalanceDate && t.date <= asOf)
      .reduce((sum, t) => {
        if (t.accountId === account.id)
          sum += (t.type === "income" ? 1 : -1) * cents(t.amount);
        if (t.type === "transfer" && t.destinationAccountId === account.id)
          sum += cents(t.amount);
        return sum;
      }, cents(account.initialBalance)) / 100
  );
}
export function totalAccountBalance(
  accounts: Account[],
  items: Transaction[],
  asOf = localDate(),
): number | null {
  const balances = accounts.map((account) =>
    accountBalance(account, items, asOf),
  );
  if (!balances.length || balances.some((balance) => balance === null))
    return null;
  return (
    balances.reduce<number>((sum, balance) => sum + cents(balance!), 0) / 100
  );
}
export function detectAnomalies(
  current: Transaction[],
  history: Transaction[][],
  catalog: Category[],
): Insight[] {
  // A single prior month is too weak a baseline for an anomaly claim.
  if (history.length < 2) return [];
  return catalog
    .filter((c) => c.type === "expense")
    .flatMap((category) => {
      const average =
        Math.round(
          history.reduce(
            (sum, rows) =>
              sum +
              cents(
                totalExpenses(rows.filter((t) => t.categoryId === category.id)),
              ),
            0,
          ) / history.length,
        ) / 100;
      const amount = totalExpenses(
        current.filter((t) => t.categoryId === category.id),
      );
      return average > 0 &&
        cents(amount) * 100 > cents(average) * 120 &&
        cents(amount) - cents(average) >= 5000
        ? [
            {
              id: category.id,
              title: `${category.name} fora do padrão`,
              description: `${Math.round((amount / average - 1) * 100)}% acima da média de ${history.length} meses (${money(average)}). Revise os lançamentos desta categoria.`,
              tone: "warning" as const,
              priority: 65 + Math.min(10, amount / average),
            },
          ]
        : [];
    });
}
export function generateInsights(
  items: Transaction[],
  selected: Date,
  settings?: FinanceSettings,
  now = new Date(),
): Insight[] {
  const { current, previous, partial } = comparablePeriods(
    items,
    selected,
    now,
  );
  if (!current.some((t) => t.type !== "transfer")) return [];
  const summary = summarize(current),
    prior = summarize(previous);
  const history = movingAverage(items, selected);
  const catalog = settings?.categories ?? defaultCategories;
  const insights: Insight[] = [];
  if (summary.balance < 0)
    insights.push({
      id: "negative",
      title: "O período está no vermelho",
      description: `As despesas superam as receitas em ${money(-summary.balance)}. Revise os gastos antes de assumir novos compromissos.`,
      tone: "warning",
      priority: 100,
    });
  if (
    settings &&
    monthKey(selected) === monthKey(now) &&
    settings.lowBalanceThreshold > 0
  ) {
    const balance = totalAccountBalance(
      settings.accounts,
      items,
      localDate(now),
    );
    if (balance !== null && balance < settings.lowBalanceThreshold)
      insights.push({
        id: "low-balance",
        title: "Sua reserva de segurança pede atenção",
        description: `Saldo registrado nas contas: ${money(balance)}. Seu limite de atenção é ${money(settings.lowBalanceThreshold)}.`,
        tone: "warning",
        priority: 95,
      });
  }
  for (const c of aggregateCategories(current, previous, catalog)) {
    if (c.budgetPercent !== null && c.budgetPercent >= 80)
      insights.push({
        id: `budget-${c.id}`,
        title: `${c.name}: ${c.budgetPercent >= 100 ? "orçamento atingido" : "perto do limite"}`,
        description: `${c.budgetPercent.toFixed(0)}% de ${money(c.monthlyBudget!)} utilizado. ${c.amount > c.monthlyBudget! ? `${money(c.amount - c.monthlyBudget!)} acima do limite.` : `Restam ${money(c.monthlyBudget! - c.amount)} para o mês.`}`,
        tone: "warning",
        priority: c.budgetPercent >= 100 ? 90 : 75,
      });
  }
  const anomalies = detectAnomalies(current, history.records, catalog);
  insights.push(
    ...anomalies.filter(
      (a) => !insights.some((i) => i.id === `budget-${a.id}`),
    ),
  );
  if (
    (!partial || summary.income > 0) &&
    prior.income > 0 &&
    cents(summary.income) * 100 <= cents(prior.income) * 85 &&
    cents(prior.income) - cents(summary.income) >= 5000
  )
    insights.push({
      id: "income-drop",
      title: "Entradas abaixo do período anterior",
      description: `${money((cents(prior.income) - cents(summary.income)) / 100)} a menos em receitas ${partial ? "até o mesmo dia" : "no mês"}. Confira se há recebimentos pendentes.`,
      tone: "warning",
      priority: 80,
    });
  const delta = (cents(summary.expenses) - cents(prior.expenses)) / 100;
  if (
    prior.expenses > 0 &&
    Math.abs(delta) >= 50 &&
    (delta > 0 || (!partial && summary.balance >= 0))
  )
    insights.push({
      id: "spending",
      title:
        delta > 0
          ? "O ritmo de gastos aumentou"
          : "Você reduziu suas despesas registradas",
      description: `${money(Math.abs(delta))} ${delta > 0 ? "a mais" : "a menos"} que ${partial ? "no mesmo intervalo do mês anterior" : "no mês anterior"}.`,
      tone: delta > 0 ? "warning" : "positive",
      priority: delta > 0 ? 60 : 20,
    });
  const projection = closingProjection(items, selected, now);
  if (
    projection !== null &&
    history.months >= 2 &&
    history.expenses !== null &&
    cents(projection) * 100 > cents(history.expenses) * 115 &&
    cents(projection) - cents(history.expenses) >= 5000
  )
    insights.push({
      id: "projection",
      title: "O fechamento pode superar seu histórico",
      description: `Mantido o ritmo, saídas estimadas em ${money(projection)}: ${money(projection - history.expenses)} acima da média. Estimativa linear; depende de registros completos.`,
      tone: "warning",
      priority: 55,
    });
  const extra = (cents(summary.balance) - cents(prior.balance)) / 100;
  if (
    !partial &&
    previous.some((t) => t.type !== "transfer") &&
    summary.balance > 0 &&
    extra >= 50
  )
    insights.push({
      id: "savings",
      title: "Mais espaço para seus planos",
      description: `Sobraram ${money(extra)} a mais que no mês anterior. Considere direcionar essa diferença à sua meta.`,
      tone: "positive",
      priority: 25,
    });
  return insights
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id),
    )
    .slice(0, 3);
}
