import type {
  Account,
  Category,
  FinancialSummary,
  FinanceSettings,
  Goal,
  Insight,
  Transaction,
} from "../../types/finance";
import { categories as defaultCategories } from "../../data/catalog";
import { localDate, moneyMinor, monthKey } from "../../utils/format";
import {
  checkedAdd,
  checkedSubtract,
  compareScaled,
  fromLegacyReais,
  minorUnits,
  multiplyDivideRounded,
  toLegacyReais,
  type MinorUnits,
} from "../../utils/money";
import { validDate } from "../transactions/validation";

// DTOs persistidos são R$. Cada entrada atravessa o adapter; intermediários
// permanecem centavos. Wrappers públicos convertem apenas o resultado final.
const zero = minorUnits(0);
function totalMinor(
  items: Transaction[],
  type: "income" | "expense",
): MinorUnits {
  return items
    .filter((t) => t.type === type)
    .reduce((sum, t) => checkedAdd(sum, fromLegacyReais(t.amount)), zero);
}
function summaryMinor(items: Transaction[]) {
  const income = totalMinor(items, "income"),
    expenses = totalMinor(items, "expense");
  const balance = checkedSubtract(income, expenses);
  return {
    income,
    expenses,
    balance,
    savingsRate: income > 0 ? (balance / income) * 100 : null,
  };
}
function summaryReais(
  summary: ReturnType<typeof summaryMinor>,
): FinancialSummary {
  return {
    income: toLegacyReais(summary.income),
    expenses: toLegacyReais(summary.expenses),
    balance: toLegacyReais(summary.balance),
    savingsRate: summary.savingsRate,
  };
}
function changeMinor(current: MinorUnits, previous: MinorUnits) {
  return previous === 0
    ? null
    : (checkedSubtract(current, previous) / Math.abs(previous)) * 100;
}
function budgetMinor(budget?: number) {
  return budget && budget > 0 ? fromLegacyReais(budget, "settings") : null;
}
function budgetPercent(amount: MinorUnits, budget: MinorUnits | null) {
  return budget === null ? null : (amount / budget) * 100;
}
export const totalIncome = (items: Transaction[]) =>
  toLegacyReais(totalMinor(items, "income"));
export const totalExpenses = (items: Transaction[]) =>
  toLegacyReais(totalMinor(items, "expense"));
export const netBalance = (items: Transaction[]) =>
  toLegacyReais(summaryMinor(items).balance);
export const percentageChange = (current: number, previous: number) =>
  changeMinor(fromLegacyReais(current), fromLegacyReais(previous));
export const forMonth = (items: Transaction[], date: Date) =>
  items.filter((t) => t.date.startsWith(monthKey(date)));
export function summarize(items: Transaction[]): FinancialSummary {
  return summaryReais(summaryMinor(items));
}
// A composição dos cards calcula diferenças antes de converter as saídas R$.
export function compareSummaries(
  items: Transaction[],
  previous: Transaction[],
) {
  const current = summaryMinor(items),
    prior = summaryMinor(previous);
  const changes = {
    income: changeMinor(current.income, prior.income),
    expenses: changeMinor(current.expenses, prior.expenses),
    balance: changeMinor(current.balance, prior.balance),
  };
  return {
    current: summaryReais(current),
    previous: summaryReais(prior),
    changes,
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
  budgetPercent(fromLegacyReais(amount), budgetMinor(budget));
function categoriesMinor(
  items: Transaction[],
  previous: Transaction[],
  catalog: Category[],
) {
  const total = totalMinor(items, "expense");
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
      const amount = totalMinor(
        items.filter((t) => t.categoryId === category.id),
        "expense",
      );
      const before = totalMinor(
        previous.filter((t) => t.categoryId === category.id),
        "expense",
      );
      const budget = budgetMinor(category.monthlyBudget);
      return {
        category,
        amount,
        share: total ? (amount / total) * 100 : 0,
        change: changeMinor(amount, before),
        budget,
        budgetPercent: budgetPercent(amount, budget),
        attention:
          (budget !== null && compareScaled(amount, 100, budget, 80) >= 0) ||
          (before > 0 && compareScaled(amount, 100, before, 120) >= 0),
      };
    })
    .sort((a, b) => b.amount - a.amount);
}
export function aggregateCategories(
  items: Transaction[],
  previous: Transaction[],
  catalog: Category[] = defaultCategories,
) {
  return categoriesMinor(items, previous, catalog).map((c) => ({
    ...c.category,
    amount: toLegacyReais(c.amount),
    share: c.share,
    change: c.change,
    budgetPercent: c.budgetPercent,
    attention: c.attention,
  }));
}
function monthlySummaries(items: Transaction[], selected: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(
      selected.getFullYear(),
      selected.getMonth() - 5 + index,
      1,
    );
    const records = forMonth(items, date).filter((t) => t.type !== "transfer");
    return {
      date,
      hasData: records.length > 0,
      summary: summaryMinor(records),
    };
  });
}
export function monthlyData(items: Transaction[], selected: Date) {
  return monthlySummaries(items, selected).map(
    ({ date, hasData, summary }) => ({
      month: new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(date)
        .replace(".", ""),
      key: monthKey(date),
      ...summaryReais(summary),
      balance: hasData ? toLegacyReais(summary.balance) : null,
      expenses: hasData ? toLegacyReais(summary.expenses) : null,
      hasData,
    }),
  );
}
// O saldo médio do gráfico também é cálculo monetário, não uma coordenada.
export function monthlyBalanceAverage(items: Transaction[], selected: Date) {
  const recorded = monthlySummaries(items, selected).filter((m) => m.hasData);
  return recorded.length
    ? toLegacyReais(
        multiplyDivideRounded(
          recorded.reduce((sum, m) => checkedAdd(sum, m.summary.balance), zero),
          1,
          recorded.length,
        ),
      )
    : null;
}
function movingAverageMinor(
  items: Transaction[],
  selected: Date,
  months: number,
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
      ? multiplyDivideRounded(
          values.reduce(
            (sum, rows) => checkedAdd(sum, totalMinor(rows, "expense")),
            zero,
          ),
          1,
          values.length,
        )
      : null,
    records: values,
  };
}
export function movingAverage(
  items: Transaction[],
  selected: Date,
  months = 3,
) {
  const result = movingAverageMinor(items, selected, months);
  return {
    ...result,
    expenses: result.expenses === null ? null : toLegacyReais(result.expenses),
  };
}
function projectionMinor(items: Transaction[], selected: Date, now: Date) {
  const current = forMonth(items, selected).filter(
    (t) => t.date <= localDate(now) && t.type === "expense",
  );
  if (
    monthKey(selected) !== monthKey(now) ||
    now.getDate() < 7 ||
    new Set(current.map((t) => t.date)).size < 3
  )
    return null;
  return multiplyDivideRounded(
    totalMinor(current, "expense"),
    new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    now.getDate(),
  );
}
export function closingProjection(
  items: Transaction[],
  selected: Date,
  now = new Date(),
) {
  const result = projectionMinor(items, selected, now);
  return result === null ? null : toLegacyReais(result);
}
function accountMinor(account: Account, items: Transaction[], asOf: string) {
  if (
    !Number.isFinite(account.initialBalance) ||
    !validDate(account.initialBalanceDate) ||
    !validDate(asOf) ||
    asOf < account.initialBalanceDate
  )
    return null;
  return items
    .filter((t) => t.date >= account.initialBalanceDate && t.date <= asOf)
    .reduce(
      (sum, t) => {
        if (t.accountId === account.id) {
          const amount = fromLegacyReais(t.amount);
          sum =
            t.type === "income"
              ? checkedAdd(sum, amount)
              : checkedSubtract(sum, amount);
        }
        if (t.type === "transfer" && t.destinationAccountId === account.id)
          sum = checkedAdd(sum, fromLegacyReais(t.amount));
        return sum;
      },
      fromLegacyReais(account.initialBalance, "settings"),
    );
}
export function accountBalance(
  account: Account,
  items: Transaction[],
  asOf = localDate(),
) {
  const result = accountMinor(account, items, asOf);
  return result === null ? null : toLegacyReais(result);
}
function accountsMinor(
  accounts: Account[],
  items: Transaction[],
  asOf: string,
) {
  const balances = accounts.map((a) => accountMinor(a, items, asOf));
  if (!balances.length || balances.some((b) => b === null)) return null;
  return balances.reduce<MinorUnits>((sum, b) => checkedAdd(sum, b!), zero);
}
export function totalAccountBalance(
  accounts: Account[],
  items: Transaction[],
  asOf = localDate(),
): number | null {
  const result = accountsMinor(accounts, items, asOf);
  return result === null ? null : toLegacyReais(result);
}
export function detectAnomalies(
  current: Transaction[],
  history: Transaction[][],
  catalog: Category[],
): Insight[] {
  if (history.length < 2) return [];
  return catalog
    .filter((c) => c.type === "expense")
    .flatMap((category) => {
      const average = multiplyDivideRounded(
        history.reduce(
          (sum, rows) =>
            checkedAdd(
              sum,
              totalMinor(
                rows.filter((t) => t.categoryId === category.id),
                "expense",
              ),
            ),
          zero,
        ),
        1,
        history.length,
      );
      const amount = totalMinor(
        current.filter((t) => t.categoryId === category.id),
        "expense",
      );
      return average > 0 &&
        compareScaled(amount, 100, average, 120) > 0 &&
        checkedSubtract(amount, average) >= 5000
        ? [
            {
              id: category.id,
              title: `${category.name} fora do padrão`,
              description: `${Math.round((amount / average - 1) * 100)}% acima da média de ${history.length} meses (${moneyMinor(average)}). Revise os lançamentos desta categoria.`,
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
  const summary = summaryMinor(current),
    prior = summaryMinor(previous);
  const history = movingAverageMinor(items, selected, 3);
  const catalog = settings?.categories ?? defaultCategories;
  const insights: Insight[] = [];
  if (summary.balance < 0)
    insights.push({
      id: "negative",
      title: "O período está no vermelho",
      description: `As despesas superam as receitas em ${moneyMinor(checkedSubtract(zero, summary.balance))}. Revise os gastos antes de assumir novos compromissos.`,
      tone: "warning",
      priority: 100,
    });
  if (
    settings &&
    monthKey(selected) === monthKey(now) &&
    settings.lowBalanceThreshold > 0
  ) {
    const threshold = fromLegacyReais(settings.lowBalanceThreshold, "settings");
    const balance = accountsMinor(settings.accounts, items, localDate(now));
    if (balance !== null && balance < threshold)
      insights.push({
        id: "low-balance",
        title: "Sua reserva de segurança pede atenção",
        description: `Saldo registrado nas contas: ${moneyMinor(balance)}. Seu limite de atenção é ${moneyMinor(threshold)}.`,
        tone: "warning",
        priority: 95,
      });
  }
  for (const c of categoriesMinor(current, previous, catalog)) {
    if (c.budget !== null && compareScaled(c.amount, 100, c.budget, 80) >= 0) {
      const reached = c.amount >= c.budget;
      insights.push({
        id: `budget-${c.category.id}`,
        title: `${c.category.name}: ${reached ? "orçamento atingido" : "perto do limite"}`,
        description: `${c.budgetPercent!.toFixed(0)}% de ${moneyMinor(c.budget)} utilizado. ${c.amount > c.budget ? `${moneyMinor(checkedSubtract(c.amount, c.budget))} acima do limite.` : `Restam ${moneyMinor(checkedSubtract(c.budget, c.amount))} para o mês.`}`,
        tone: "warning",
        priority: reached ? 90 : 75,
      });
    }
  }
  insights.push(
    ...detectAnomalies(current, history.records, catalog).filter(
      (a) => !insights.some((i) => i.id === `budget-${a.id}`),
    ),
  );
  if (
    (!partial || summary.income > 0) &&
    prior.income > 0 &&
    compareScaled(summary.income, 100, prior.income, 85) <= 0 &&
    checkedSubtract(prior.income, summary.income) >= 5000
  )
    insights.push({
      id: "income-drop",
      title: "Entradas abaixo do período anterior",
      description: `${moneyMinor(checkedSubtract(prior.income, summary.income))} a menos em receitas ${partial ? "até o mesmo dia" : "no mês"}. Confira se há recebimentos pendentes.`,
      tone: "warning",
      priority: 80,
    });
  const delta = checkedSubtract(summary.expenses, prior.expenses);
  if (
    prior.expenses > 0 &&
    Math.abs(delta) >= 5000 &&
    (delta > 0 || (!partial && summary.balance >= 0))
  )
    insights.push({
      id: "spending",
      title:
        delta > 0
          ? "O ritmo de gastos aumentou"
          : "Você reduziu suas despesas registradas",
      description: `${moneyMinor(delta < 0 ? checkedSubtract(zero, delta) : delta)} ${delta > 0 ? "a mais" : "a menos"} que ${partial ? "no mesmo intervalo do mês anterior" : "no mês anterior"}.`,
      tone: delta > 0 ? "warning" : "positive",
      priority: delta > 0 ? 60 : 20,
    });
  const projection = projectionMinor(items, selected, now);
  if (
    projection !== null &&
    history.months >= 2 &&
    history.expenses !== null &&
    compareScaled(projection, 100, history.expenses, 115) > 0 &&
    checkedSubtract(projection, history.expenses) >= 5000
  )
    insights.push({
      id: "projection",
      title: "O fechamento pode superar seu histórico",
      description: `Mantido o ritmo, saídas estimadas em ${moneyMinor(projection)}: ${moneyMinor(checkedSubtract(projection, history.expenses))} acima da média. Estimativa linear; depende de registros completos.`,
      tone: "warning",
      priority: 55,
    });
  const extra = checkedSubtract(summary.balance, prior.balance);
  if (
    !partial &&
    previous.some((t) => t.type !== "transfer") &&
    summary.balance > 0 &&
    extra >= 5000
  )
    insights.push({
      id: "savings",
      title: "Mais espaço para seus planos",
      description: `Sobraram ${moneyMinor(extra)} a mais que no mês anterior. Considere direcionar essa diferença à sua meta.`,
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

// Somente projeções de planejamento: nunca normalizar ou regravar o draft.
export function planningAmounts(settings: FinanceSettings) {
  const fixed = settings.fixedExpenses.reduce(
    (sum, f) => checkedAdd(sum, fromLegacyReais(f.amount, "settings")),
    zero,
  );
  const available = checkedSubtract(
    fromLegacyReais(settings.plannedIncome, "settings"),
    fixed,
  );
  return { fixed, available };
}
export function goalProgress(goal: Goal) {
  const target = fromLegacyReais(goal.targetAmount, "settings");
  const current = fromLegacyReais(goal.currentAmount, "settings");
  // Meta sem alvo positivo continua sendo um rascunho, não 0% calculado.
  const remaining = checkedSubtract(target, current);
  return {
    remaining: remaining < 0 ? zero : remaining,
    percent: target > 0 ? Math.round((current / target) * 100) : null,
  };
}
