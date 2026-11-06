import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Pencil,
  Repeat2,
  Trash2,
} from "lucide-react";
import type { FinanceSettings, Transaction } from "../../types/finance";
import { money, shortDate } from "../../utils/format";
export const sortTransactions = (rows: Transaction[]) =>
  [...rows].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
      b.id.localeCompare(a.id),
  );
export function TransactionTable({
  transactions,
  settings,
  onEdit,
  onDelete,
  readonly = false,
  mobileCards = false,
}: {
  transactions: Transaction[];
  settings: FinanceSettings;
  onEdit?: (t: Transaction) => void;
  onDelete?: (t: Transaction) => void;
  readonly?: boolean;
  mobileCards?: boolean;
}) {
  return (
    <div className={`table-scroll${mobileCards ? " transaction-cards" : ""}`}>
      <table role={mobileCards ? "table" : undefined}>
        <thead role={mobileCards ? "rowgroup" : undefined}>
          <tr role={mobileCards ? "row" : undefined}>
            <th>TRANSAÇÃO</th>
            <th>CATEGORIA</th>
            <th>CONTA</th>
            <th>DATA</th>
            <th>VALOR</th>
            {onEdit && <th>AÇÕES</th>}
          </tr>
        </thead>
        <tbody role={mobileCards ? "rowgroup" : undefined}>
          {transactions.map((t) => (
            <tr key={t.id} role={mobileCards ? "row" : undefined}>
              <td role={mobileCards ? "cell" : undefined}>
                <div className="transaction-description">
                  <span className={`transaction-icon ${t.type}`}>
                    {t.type === "income" ? (
                      <ArrowDownLeft size={17} />
                    ) : t.type === "transfer" ? (
                      <ArrowLeftRight size={17} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </span>
                  <span>
                    {t.description}
                    {mobileCards && (
                      <small className="transaction-card-only transaction-card-status">
                        Status:{" "}
                        {t.recurring ? "Recorrente" : "Lançamento único"}
                        {t.source === "demo" && " · Demonstração"}
                      </small>
                    )}
                    {t.source === "demo" && (
                      <small className="demo-tag">Demonstração</small>
                    )}
                  </span>
                  {t.recurring && (
                    <span title="Marcada como recorrente">
                      <Repeat2 size={13} />
                    </span>
                  )}
                </div>
              </td>
              <td
                role={mobileCards ? "cell" : undefined}
                data-label={mobileCards ? "Categoria" : undefined}
              >
                <span className="table-category">
                  {t.type === "transfer"
                    ? "Transferência"
                    : (settings.categories.find((c) => c.id === t.categoryId)
                        ?.name ?? "Categoria não cadastrada")}
                </span>
              </td>
              <td
                role={mobileCards ? "cell" : undefined}
                data-label={mobileCards ? "Conta" : undefined}
              >
                {settings.accounts.find((a) => a.id === t.accountId)?.name ??
                  "Conta não cadastrada"}
                {t.type === "transfer" &&
                  ` → ${settings.accounts.find((a) => a.id === t.destinationAccountId)?.name ?? "Destino não cadastrado"}`}
              </td>
              <td
                role={mobileCards ? "cell" : undefined}
                title={t.date}
                data-label={mobileCards ? "Data" : undefined}
              >
                {shortDate(t.date)} {t.date.slice(0, 4)}
              </td>
              <td
                role={mobileCards ? "cell" : undefined}
                data-label={mobileCards ? "Valor" : undefined}
                className={`transaction-value ${t.type === "income" ? "text-mint" : ""}`}
              >
                {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
                {money(t.amount)}
              </td>
              {onEdit && (
                <td role={mobileCards ? "cell" : undefined}>
                  <div className="row-actions">
                    <button
                      disabled={readonly}
                      className="icon-button"
                      aria-label={`Editar ${t.description}`}
                      onClick={() => onEdit(t)}
                    >
                      <Pencil size={16} />
                      {mobileCards && (
                        <span className="transaction-card-only">Editar</span>
                      )}
                    </button>
                    <button
                      disabled={readonly}
                      className="icon-button danger-text"
                      aria-label={`Excluir ${t.description}`}
                      onClick={() => onDelete?.(t)}
                    >
                      <Trash2 size={16} />
                      {mobileCards && (
                        <span className="transaction-card-only">Excluir</span>
                      )}
                    </button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
