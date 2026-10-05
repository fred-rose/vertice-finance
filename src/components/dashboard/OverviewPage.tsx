import { useMemo } from "react";
import { Plus, Upload, Wallet } from "lucide-react";
import type {
  Account,
  FinanceSettings,
  Transaction,
} from "../../types/finance";
import { FinancialSummary } from "./FinancialSummary";
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
export function OverviewPage({
  transactions,
  settings,
  selected,
  onAdd,
  onImport,
}: {
  transactions: Transaction[];
  settings: FinanceSettings;
  selected: Date;
  onAdd: () => void;
  onImport: () => void;
}) {
  const dashboard = useMemo(() => {
    const periods = comparablePeriods(transactions, selected);
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
        insights: generateInsights(transactions, selected, settings),
        projection: closingProjection(transactions, selected),
      };
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      return undefined;
    }
  }, [transactions, selected, settings]);
  // Mantém a avaliação por render e o default temporal já existente.
  function balanceLabel(account: Account) {
    try {
      const balance = accountBalance(account, transactions);
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
          <button className="primary-button" onClick={onAdd}>
            <Plus size={18} />
            Adicionar primeira transação
          </button>
          <button className="secondary-button" onClick={onImport}>
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
        <button className="primary-button mobile-add" onClick={onAdd}>
          <Plus size={18} /> Adicionar transação
        </button>
        <RecentTransactions
          transactions={comparablePeriods(transactions, selected).current}
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
      <button className="primary-button mobile-add" onClick={onAdd}>
        <Plus size={18} />
        Adicionar transação
      </button>
      <div className="dashboard-sections">
        <InsightPanel insights={dashboard.insights} />
        <div className="charts-grid">
          <TrendChart data={dashboard.trend} average={dashboard.trendAverage} />
          {dashboard.current.some((t) => t.type === "expense") ? (
            <CategoryBreakdown
              data={dashboard.categories.filter(
                (c) => c.amount > 0 || !!c.monthlyBudget,
              )}
            />
          ) : (
            <section className="panel empty-state">
              <h2>Seus gastos por categoria</h2>
              <p>
                As categorias aparecem quando você registra gastos neste
                período.
              </p>
            </section>
          )}
        </div>
        {dashboard.projection !== null && (
          <p className="projection-note">
            No ritmo registrado: <b>{money(dashboard.projection)}</b> em saídas
            ao fechar o mês. Estimativa linear pelos dias corridos; despesas
            pontuais e registros incompletos podem alterar a previsão.
          </p>
        )}
        <RecentTransactions
          transactions={dashboard.current}
          settings={settings}
        />
        <details className="panel accounts-overview">
          <summary>
            Saldo das contas hoje{" "}
            <span>Saldo inicial + movimentações registradas</span>
          </summary>
          <div className="account-grid">
            {settings.accounts.map((a) => (
              <div key={a.id}>
                <span>{a.name}</span>
                <strong>{balanceLabel(a)}</strong>
                <small>
                  Desde {a.initialBalanceDate.split("-").reverse().join("/")} ·
                  inclui transferências
                </small>
              </div>
            ))}
          </div>
          <a href="#/configuracoes" className="text-link">
            Revisar saldos iniciais →
          </a>
        </details>
      </div>
    </>
  );
}
