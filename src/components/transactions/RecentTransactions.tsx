import type { FinanceSettings, Transaction } from "../../types/finance";
import { TransactionTable, sortTransactions } from "./TransactionTable";
import { ArrowRight, ArrowLeftRight, ReceiptText } from "lucide-react";
export function RecentTransactions({
  transactions,
  settings,
}: {
  transactions: Transaction[];
  settings: FinanceSettings;
}) {
  const recent = sortTransactions(transactions).slice(0, 5);
  return (
    <section
      className="panel recent-panel overview-lower-card"
      aria-label="Últimas movimentações"
    >
      <div className="section-heading">
        <div className="overview-section-title">
          <span className="overview-section-icon" aria-hidden="true">
            <ArrowLeftRight size={19} />
          </span>
          <div>
            <h2>Últimas movimentações</h2>
            <p>Os registros mais recentes deste mês.</p>
          </div>
        </div>
        <a className="text-link overview-heading-action" href="#/transacoes">
          Ver todas <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
      {recent.length ? (
        <>
          <div className="overview-list-caption">
            <span>Atividade registrada</span>
            <span>
              {recent.length}{" "}
              {recent.length === 1 ? "registro exibido" : "registros exibidos"}
            </span>
          </div>
          <TransactionTable transactions={recent} settings={settings} />
        </>
      ) : (
        <div className="overview-empty recent-empty-state">
          <span className="overview-empty-symbol" aria-hidden="true">
            <ReceiptText size={25} />
          </span>
          <div>
            <h3>Nenhuma movimentação neste mês.</h3>
            <p className="overview-empty-description">
              Entradas, saídas e transferências aparecem aqui conforme você
              registra seus movimentos.
            </p>
          </div>
          <a className="overview-detail-action" href="#/transacoes">
            Registrar ou importar <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      )}
    </section>
  );
}
