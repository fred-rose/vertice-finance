import type { AnalyticsBentoProps } from "../ui/analytics-bento";
import type { FinanceSettings, Transaction } from "../../types/finance";
import {
  aggregateCategories,
  comparablePeriods,
  compareSummaries,
  summarize,
} from "../../features/dashboard/calculations";
import {
  civilMonthLabel,
  civilDate,
  dateMonth,
  daysInMonth,
  monthParts,
  shiftMonth,
  shiftDateMonth,
  type CivilDate,
  type CivilMonth,
} from "../../utils/civil";
import { changeLabel, moneyFromCalculation as money } from "../../utils/format";

const recorded = (items: Transaction[]) =>
  items.some((item) => item.type !== "transfer");

/** Map existing calculation results to the original component; no persistence or monetary arithmetic. */
export function financialAnalyticsData(
  transactions: Transaction[],
  settings: FinanceSettings,
  selected: CivilMonth,
  today: CivilDate,
): AnalyticsBentoProps {
  const periods = comparablePeriods(transactions, selected, today);
  const comparison = compareSummaries(periods.current, periods.previous);
  const [year, month] = monthParts(selected);
  const days =
    selected === dateMonth(today)
      ? Number(today.slice(8))
      : daysInMonth(year, month);
  const cut = selected + "-" + String(days).padStart(2, "0");
  const forYear = (value: number) =>
    transactions.filter(
      (item) =>
        item.date.startsWith(String(value) + "-") &&
        item.date <=
          String(value) +
            cut.slice(4, 8) +
            String(Math.min(days, daysInMonth(value, month))).padStart(2, "0"),
    );
  const currentYear = forYear(year),
    priorYear = forYear(year - 1);
  const annual = compareSummaries(currentYear, priorYear);
  const prior = comparablePeriods(
    transactions,
    shiftMonth(selected, -1),
    periods.partial ? shiftDateMonth(today, -1) : civilDate(selected + "-01"),
  );
  const priorComparison = compareSummaries(periods.previous, prior.previous);
  const categoryPeriods = [periods.current, periods.previous, currentYear];
  const categories = categoryPeriods.map((items, index) =>
    aggregateCategories(
      items,
      index === 2 ? priorYear : [],
      settings.categories,
    ),
  );
  const catalog = [
    ...new Map(categories.flat().map((item) => [item.id, item])).values(),
  ].filter((item) =>
    categories.some((items) =>
      items.some((entry) => entry.id === item.id && entry.amount > 0),
    ),
  );
  const labels = ["Mês", "Anterior", "Ano até o mês"];
  const comparisons = [comparison, priorComparison, annual];
  const priorRecords = [periods.previous, prior.previous, priorYear];
  const series = Array.from({ length: 6 }, (_, i) =>
    shiftMonth(selected, i - 5),
  ).flatMap((date) => {
    const items = comparablePeriods(transactions, date, today).current;
    return recorded(items)
      ? [{ label: civilMonthLabel(date), value: summarize(items).income }]
      : [];
  });
  const daily = recorded(periods.current)
    ? Array.from({ length: days }, (_, i) =>
        summarize(
          periods.current.filter(
            (item) => Number(item.date.slice(8)) === i + 1,
          ),
        ),
      )
    : [];
  const years = [
    year,
    ...new Set(
      transactions
        .filter(
          (item) =>
            item.type !== "transfer" && Number(item.date.slice(0, 4)) < year,
        )
        .map((item) => Number(item.date.slice(0, 4))),
    ),
  ]
    .sort((a, b) => b - a)
    .slice(0, 3);
  return {
    currency: "R$ ",
    credit: true,
    revenue: {
      label: "Receitas registradas",
      value: recorded(periods.current) ? comparison.current.income : null,
      delta: recorded(periods.current)
        ? changeLabel(comparison.changes.income)
        : "Sem registros",
      note: periods.partial
        ? `Até o dia ${days} · comparação com o mês anterior`
        : "Comparação com o mês anterior",
      caption: "Últimos 6 meses · meses com lançamentos",
      series,
    },
    sessions: {
      label: "Despesas registradas",
      value: recorded(periods.current) ? comparison.current.expenses : null,
      delta: recorded(periods.current)
        ? changeLabel(comparison.changes.expenses)
        : "Sem registros",
      note: "Entradas e saídas registradas por dia; transferências excluídas.",
      desktop: [daily.map((item) => item.income)],
      mobile: [daily.map((item) => item.expenses)],
      labels: {
        desktop: "Entradas",
        mobile: "Saídas",
        prior: "Período anterior",
        current: civilMonthLabel(selected),
        points: daily.map((_, i) => `Dia ${i + 1}`),
      },
    },
    categories: {
      title: "Despesas por categoria",
      groups: catalog.map((item) => {
        const color = /^#[0-9a-f]{6}$/i.test(item.color)
          ? item.color
          : "#6a8580";
        const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
        return {
          id: item.id,
          name: item.name,
          color,
          ink: (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114 > 155000
            ? "dark"
            : "light") as "dark" | "light",
        };
      }),
      periods: categoryPeriods.map((items, i) => ({
        label: labels[i],
        total: recorded(items) ? comparisons[i].current.expenses : null,
        delta: recorded(items)
          ? changeLabel(comparisons[i].changes.expenses)
          : "Sem registros",
        compare: recorded(priorRecords[i])
          ? `Antes: ${money(comparisons[i].previous.expenses)}`
          : "Sem base anterior",
      })),
      items: catalog.map((item) => ({
        name: item.name,
        group: item.id,
        values: categories.map(
          (items) => items.find((entry) => entry.id === item.id)?.amount ?? 0,
        ),
      })),
    },
    seasonality: {
      title: "Sazonalidade das despesas",
      axis: [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ],
      years: years.map((value) => {
        const items = forYear(value),
          before = forYear(value - 1);
        const totals = compareSummaries(items, before);
        const available = recorded(items);
        return {
          label: String(value),
          values: Array.from(
            { length: 12 },
            (_, i) =>
              summarize(
                items.filter((item) => Number(item.date.slice(5, 7)) === i + 1),
              ).expenses,
          ),
          stats: [
            {
              label: "Receitas no recorte",
              value: available ? totals.current.income : null,
              delta: available
                ? changeLabel(totals.changes.income)
                : "Sem registros",
              note: "vs. mesmo recorte anterior",
            },
            {
              label: "Despesas no recorte",
              value: available ? totals.current.expenses : null,
              delta: available
                ? changeLabel(totals.changes.expenses)
                : "Sem registros",
              note: "vs. mesmo recorte anterior",
              inverse: true,
            },
          ],
          rows: [
            {
              label: "Recorte de cada ano",
              value: `Até ${String(Math.min(days, daysInMonth(value, month))).padStart(2, "0")}/${String(month).padStart(2, "0")}`,
            },
            {
              label: "Lançamentos financeiros",
              value: String(
                items.filter((item) => item.type !== "transfer").length,
              ),
            },
          ],
        };
      }),
    },
  };
}
