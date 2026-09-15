import { useMemo, useState } from "react";
import { Download, Search, Upload } from "lucide-react";
import type { FinanceSettings, Transaction } from "../../types/finance";
import { Dialog } from "../ui/Dialog";
import { TransactionTable, sortTransactions } from "./TransactionTable";
import { money } from "../../utils/format";
import { summarize } from "../../features/dashboard/calculations";
import { downloadTransactions } from "../../features/transactions/importExport";
export function TransactionsPage({
  transactions,
  settings,
  onEdit,
  onDelete,
  onImport,
}: {
  transactions: Transaction[];
  settings: FinanceSettings;
  onEdit: (t: Transaction) => void;
  onDelete: (id: string) => Promise<void>;
  onImport: () => void;
}) {
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("");
  const [type, setType] = useState("");
  const [account, setAccount] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Transaction>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(
    () =>
      sortTransactions(
        transactions.filter(
          (t) =>
            (!month || t.date.startsWith(month)) &&
            (!type || t.type === type) &&
            (!account ||
              t.accountId === account ||
              t.destinationAccountId === account) &&
            (!category || t.categoryId === category) &&
            t.description
              .toLocaleLowerCase()
              .includes(search.trim().toLocaleLowerCase()),
        ),
      ),
    [transactions, month, type, account, category, search],
  );
  const total = summarize(filtered);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  return (
    <section className="panel transactions-page">
      <div className="section-heading">
        <div>
          <h2>Seu histórico, em detalhes</h2>
          <p>
            Encontre e corrija lançamentos. O dashboard acompanha cada
            alteração.
          </p>
        </div>
        <div className="row-actions">
          <button className="secondary-button" onClick={onImport}>
            <Upload size={16} />
            Importar
          </button>
          <button
            className="secondary-button"
            disabled={!filtered.length}
            onClick={() => downloadTransactions(filtered, settings)}
          >
            <Download size={16} />
            Exportar CSV
          </button>
        </div>
      </div>
      <div className="transaction-filters">
        <label>
          <span>
            <Search size={13} /> Buscar descrição
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Mês
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Tipo
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="expense">Gasto</option>
            <option value="income">Receita</option>
            <option value="transfer">Transferência</option>
          </select>
        </label>
        <label>
          Conta
          <select
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {settings.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {settings.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="filter-summary">
        {filtered.length} lançamentos no filtro · Entradas {money(total.income)}{" "}
        · Saídas {money(total.expenses)} · Resultado {money(total.balance)}
        <span>
          Transferências não compõem o resultado. A exportação inclui todos os
          registros do filtro.
        </span>
      </p>
      {filtered.length ? (
        <TransactionTable
          transactions={filtered.slice(
            (currentPage - 1) * 20,
            currentPage * 20,
          )}
          settings={settings}
          onEdit={onEdit}
          onDelete={(t) => {
            setError("");
            setDeleting(t);
          }}
        />
      ) : (
        <p className="empty-state">
          Nenhum lançamento encontrado. Ajuste os filtros ou adicione sua
          primeira transação.
        </p>
      )}
      <div className="pagination">
        <button
          className="secondary-button"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          Anterior
        </button>
        <span>
          Página {currentPage} de {pages}
        </span>
        <button
          className="secondary-button"
          disabled={currentPage >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          Próxima
        </button>
      </div>
      {deleting && (
        <Dialog
          title="Excluir transação?"
          busy={busy}
          onClose={() => setDeleting(undefined)}
        >
          <p className="dialog-description">
            {deleting.description} · {money(deleting.amount)}. Esta ação remove
            o lançamento e recalcula seus totais.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setDeleting(undefined)}
            >
              Cancelar
            </button>
            <button
              className="danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(deleting.id);
                  setDeleting(undefined);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Não foi possível excluir. Tente novamente.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Excluindo…" : "Confirmar exclusão"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
