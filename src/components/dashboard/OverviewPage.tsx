import type { CivilDate, CivilMonth } from "../../utils/civil";
import { useMemo } from "react";
import {
  Plus,
  Upload,
  Wallet,
  PieChart,
  ArrowRight,
  WalletCards,
  ChevronDown,
  Landmark,
  Banknote,
} from "lucide-react";
import type {
  Account,
  FinanceSettings,
  Transaction,
} from "../../types/finance";
import { FinancialSummary } from "./FinancialSummary";
import { FinancialAnalyticsBento } from "./FinancialAnalyticsBento";
import { CategoryBreakdown } from "./CategoryBreakdown";
import { InsightPanel } from "./InsightPanel";
import { TrendChart } from "../charts/TrendChart";
import { RecentTransactions } from "../transactions/RecentTransactions";
import {
  accountBalance,
  aggregateCategories,
  closingProjection,
  comparablePeriods,
  generateInsights,
  monthlyData,
  monthlyBalanceAverage,
  compareSummaries,
} from "../../features/dashboard/calculations";
import {
  calculationUnavailable,
  accountBalanceLabel,
  moneyFromCalculation as money,
} from "../../utils/format";
import { MoneyError } from "../../utils/money";
import "./OverviewLower.css";
export function OverviewPage({
  transactions,
  settings,
  selected,
  today,
  onAdd,
  onImport,
  readonly = false,
}: {
  transactions: Transaction[];
  settings: FinanceSettings;
  selected: CivilMonth;
  today: CivilDate;
  onAdd: () => void;
  onImport: () => void;
  readonly?: boolean;
}) {
  const dashboard = useMemo(() => {
    const periods = comparablePeriods(transactions, selected, today);
    try {
      const comparison = compareSummaries(periods.current, periods.previous);
      return {
        ...periods,
        summary: comparison.current,
        prior: comparison.previous,
        changes: comparison.changes,
        categories: aggregateCategories(
          periods.current,
          periods.previous,
          settings.categories,
        ),
        trend: monthlyData(transactions, selected),
        trendAverage: monthlyBalanceAverage(transactions, selected),
        insights: generateInsights(transactions, selected, settings, today),
        projection: closingProjection(transactions, selected, today),
      };
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      return undefined;
    }
  }, [transactions, selected, settings, today]);
  // A mesma captura do App também rege os saldos e o fallback.
  function balanceLabel(account: Account) {
    try {
      const balance = accountBalance(account, transactions, today);
      return balance === null ? accountBalanceLabel(null) : money(balance);
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      return calculationUnavailable;
    }
  }
  if (!transactions.length)
    return (
      <section className="panel welcome-panel">
        <div className="welcome-symbol">
          <Wallet size={32} />
        </div>
        <span className="eyebrow">UM COMEÇO COM CLAREZA</span>
        <h2>
          Seu dashboard começa aqui<span>.</span>
        </h2>
        <p>
          Registre o que entra e o que sai. A cada movimento, você ganha uma
          visão mais clara do seu dinheiro.
        </p>
        <div className="welcome-actions">
          <button
            className="primary-button"
            disabled={readonly}
            onClick={onAdd}
          >
            <Plus size={18} />
            Adicionar primeira transação
          </button>
          <button
            className="secondary-button"
            disabled={readonly}
            onClick={onImport}
          >
            <Upload size={17} />
            Importar planilha
          </button>
          <a href="#/configuracoes" className="text-link">
            Configurar contas →
          </a>
        </div>
        <div className="welcome-steps">
          <span>
            <b>01</b> Defina suas contas e o saldo inicial
          </span>
          <span>
            <b>02</b> Adicione ou importe seus movimentos
          </span>
          <span>
            <b>03</b> Descubra o que merece atenção
          </span>
        </div>
        <p className="welcome-note">
          Seus dados são salvos neste navegador. Comece com um lançamento;
          configure o restante no seu ritmo.
        </p>
      </section>
    );
  if (!dashboard)
    return (
      <>
        <p className="form-error" role="status">
          {calculationUnavailable}
        </p>
        <button
          className="primary-button mobile-add"
          disabled={readonly}
          onClick={onAdd}
        >
          <Plus size={18} /> Adicionar transação
        </button>
        <RecentTransactions
          transactions={
            comparablePeriods(transactions, selected, today).current
          }
          settings={settings}
        />
      </>
    );
  return (
    <>
      {dashboard.current.length ? (
        <>
          <FinancialSummary
            current={dashboard.summary}
            previous={dashboard.prior}
            changes={dashboard.changes}
          />
          <p className="period-context">{dashboard.label}</p>
        </>
      ) : (
        <section className="panel empty-state">
          <h2>Nenhum lançamento neste mês</h2>
          <p>
            Escolha outro período ou registre uma movimentação. A falta de
            registros não significa saldo zero.
          </p>
        </section>
      )}
      <button
        className="primary-button mobile-add"
        disabled={readonly}
        onClick={onAdd}
      >
        <Plus size={18} />
        Adicionar transação
      </button>
      <div className="dashboard-sections">
        <InsightPanel insights={dashboard.insights} />
        <FinancialAnalyticsBento
          transactions={transactions}
          settings={settings}
          selected={selected}
          today={today}
        />
        <div className="overview-details">
          <div className="charts-grid">
            <TrendChart
              data={dashboard.trend}
              average={dashboard.trendAverage}
            />
            {dashboard.current.some((t) => t.type === "expense") ? (
              <CategoryBreakdown
                data={dashboard.categories.filter(
                  (c) => c.amount > 0 || !!c.monthlyBudget,
                )}
              />
            ) : (
              <section
                className="panel categories-panel overview-lower-card"
                aria-label="Gastos por categoria"
              >
                <div className="section-heading">
                  <div className="overview-section-title">
                    <span className="overview-section-icon" aria-hidden="true">
                      <PieChart size={19} />
                    </span>
                    <div>
                      <h2>Seus gastos por categoria</h2>
                      <p>Uma visão clara da distribuição das saídas.</p>
                    </div>
                  </div>
                </div>
                <div className="overview-empty categories-empty-state">
                  <span className="overview-state-label">
                    Aguardando despesas
                  </span>
                  <span className="overview-empty-symbol" aria-hidden="true">
                    <PieChart size={30} />
                  </span>
                  <h3>Cada gasto encontra seu lugar.</h3>
                  <p className="overview-empty-description">
                    As categorias aparecem quando você registra gastos neste
                    período.
                  </p>
                  <a className="overview-detail-action" href="#/transacoes">
                    Registrar uma despesa{" "}
                    <ArrowRight size={16} aria-hidden="true" />
                  </a>
                </div>
                <p className="overview-module-note">
                  Categorias, participação e orçamento, a partir dos seus
                  registros.
                </p>
              </section>
            )}
          </div>
          {dashboard.projection !== null && (
            <p className="projection-note">
              No ritmo registrado: <b>{money(dashboard.projection)}</b> em
              saídas ao fechar o mês. Estimativa linear pelos dias corridos;
              despesas pontuais e registros incompletos podem alterar a
              previsão.
            </p>
          )}
          <RecentTransactions
            transactions={dashboard.current}
            settings={settings}
          />
          <details className="panel accounts-overview overview-lower-card">
            <summary>
              <span className="overview-section-icon" aria-hidden="true">
                <WalletCards size={20} />
              </span>
              <span className="overview-accounts-title">
                <strong>Saldo das contas hoje</strong>
                <span>Saldo inicial + movimentações registradas</span>
              </span>
              <span className="overview-account-count">
                {settings.accounts.length}{" "}
                {settings.accounts.length === 1
                  ? "conta cadastrada"
                  : "contas cadastradas"}
              </span>
              <ChevronDown
                className="overview-disclosure"
                size={18}
                aria-hidden="true"
              />
            </summary>
            <div className="account-grid">
              {settings.accounts.map((a) => (
                <div key={a.id} className="overview-account-card">
                  <span className="overview-account-name">
                    <span className="overview-account-mark" aria-hidden="true">
                      {a.type === "cash" ? (
                        <Banknote size={17} />
                      ) : (
                        <Landmark size={17} />
                      )}
                    </span>
                    {a.name}
                  </span>
                  <strong>{balanceLabel(a)}</strong>
                  <small>
                    Desde {a.initialBalanceDate.split("-").reverse().join("/")}{" "}
                    · inclui transferências
                  </small>
                </div>
              ))}
            </div>
            <a href="#/configuracoes" className="text-link">
              Revisar saldos iniciais →
            </a>
          </details>
        </div>
      </div>
    </>
  );
}
