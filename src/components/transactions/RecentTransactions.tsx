import type { FinanceSettings, Transaction } from "../../types/finance";
import { TransactionTable, sortTransactions } from "./TransactionTable";
export function RecentTransactions({
  transactions,
  settings,
}: {
  transactions: Transaction[];
  settings: FinanceSettings;
}) {
  const recent = sortTransactions(transactions).slice(0, 5);
  return (
    <section className="panel recent-panel">
      <div className="section-heading">
        <div>
          <h2>Últimas movimentações</h2>
          <p>Os registros mais recentes deste mês.</p>
        </div>
        <a className="text-link" href="#/transacoes">
          Ver todas →
        </a>
      </div>
      {recent.length ? (
        <TransactionTable transactions={recent} settings={settings} />
      ) : (
        <p className="empty-state">Nenhuma movimentação neste mês.</p>
      )}
    </section>
  );
}
