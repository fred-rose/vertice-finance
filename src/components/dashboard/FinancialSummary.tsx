import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import type { FinancialSummary as Summary } from "../../types/finance";
import type { compareSummaries } from "../../features/dashboard/calculations";
import { changeLabel, moneyFromCalculation as money } from "../../utils/format";
export function MetricCard({
  title,
  amount,
  change,
  expense = false,
}: {
  title: string;
  amount: number;
  change: number | null;
  expense?: boolean;
}) {
  const favorable = change !== null && (expense ? change <= 0 : change >= 0);
  return (
    <div className="secondary-metric">
      <div className="metric-label">
        <span className={`metric-icon ${expense ? "out" : ""}`}>
          {expense ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
        </span>
        {title}
      </div>
      <strong>{money(amount)}</strong>
      <p>
        <span
          className={
            change === null || change === 0
              ? "text-muted"
              : favorable
                ? "text-mint"
                : "danger-text"
          }
        >
          {changeLabel(change)}
        </span>
        {change !== null && " vs. período anterior"}
      </p>
    </div>
  );
}
export function FinancialSummary({
  current,
  previous,
  changes,
}: {
  current: Summary;
  previous: Summary;
  changes: ReturnType<typeof compareSummaries>["changes"];
}) {
  return (
    <section className="summary panel" aria-label="Resumo financeiro">
      <div className="primary-metric">
        <div className="metric-label">
          <Wallet size={17} />
          Saldo líquido do mês
          <span className="live-dot" />
        </div>
        <h2 className={current.balance < 0 ? "danger-text" : ""}>
          {money(current.balance)}
        </h2>
        <p>
          <span
            className={`change-pill ${previous.balance === 0 ? "neutral-change" : current.balance < previous.balance ? "negative-change" : ""}`}
          >
            {changeLabel(changes.balance)}
          </span>
          {previous.balance !== 0 && <span>vs. período anterior</span>}
        </p>
        <div className="balance-caption">
          O que entrou menos o que saiu. Mais clareza para decidir.
        </div>
      </div>
      <div className="secondary-metrics">
        <MetricCard
          title="Entradas"
          amount={current.income}
          change={changes.income}
        />
        <MetricCard
          title="Saídas"
          amount={current.expenses}
          change={changes.expenses}
          expense
        />
      </div>
    </section>
  );
}
