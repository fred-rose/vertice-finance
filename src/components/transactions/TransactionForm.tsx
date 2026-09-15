import { useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import type {
  FinanceSettings,
  NewTransaction,
  Transaction,
  TransactionType,
} from "../../types/finance";
import { localDate } from "../../utils/format";
import {
  parseAmount,
  validateTransaction,
} from "../../features/transactions/validation";
export function TransactionForm({
  settings,
  transaction,
  busy,
  setBusy,
  onSave,
  onClose,
}: {
  settings: FinanceSettings;
  transaction?: Transaction;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onSave: (input: NewTransaction) => Promise<void>;
  onClose: () => void;
}) {
  const [type, setType] = useState<TransactionType>(
    transaction?.type ?? "expense",
  );
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const base = {
      amount: parseAmount(String(form.get("amount"))),
      description: String(form.get("description")),
      categoryId: String(form.get("categoryId") ?? "transfer"),
      accountId: String(form.get("accountId")),
      date: String(form.get("date")),
      recurring: form.get("recurring") === "on",
    };
    const input: NewTransaction =
      type === "transfer"
        ? {
            ...base,
            type,
            destinationAccountId: String(form.get("destinationAccountId")),
          }
        : { ...base, type };
    setError("");
    try {
      const valid = validateTransaction(input, settings);
      setBusy(true);
      await onSave(valid);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível salvar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="type-selector" aria-label="Tipo de transação">
          {(["expense", "income", "transfer"] as const).map((value, i) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              className={type === value ? "selected" : ""}
              onClick={() => {
                setType(value);
                setError("");
              }}
            >
              {["Gasto", "Receita", "Transferência"][i]}
            </button>
          ))}
        </div>
        <label>
          Valor (R$)
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            required
            data-autofocus
            className="amount-input"
            defaultValue={transaction?.amount.toFixed(2).replace(".", ",")}
            aria-describedby="amount-help"
          />
        </label>
        <span id="amount-help" className="form-note">
          Ex.: 85,00 ou 1.250,50
        </span>
        <label>
          Descrição
          <input
            name="description"
            placeholder="Ex.: Mercado, salário, reserva…"
            maxLength={100}
            required
            defaultValue={transaction?.description}
          />
        </label>
        <div className="form-grid">
          {type !== "transfer" && (
            <label>
              Categoria
              <select
                key={type}
                name="categoryId"
                defaultValue={
                  transaction?.type === type
                    ? transaction.categoryId
                    : undefined
                }
              >
                {settings.categories
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            {type === "transfer" ? "Conta de origem" : "Conta"}
            <select name="accountId" defaultValue={transaction?.accountId}>
              {settings.accounts.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {type === "transfer" && (
            <label>
              Conta de destino
              <select
                name="destinationAccountId"
                defaultValue={
                  transaction?.destinationAccountId ?? settings.accounts[1]?.id
                }
              >
                {settings.accounts.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Data
            <input
              type="date"
              name="date"
              required
              min="1900-01-01"
              max={localDate()}
              defaultValue={transaction?.date ?? localDate()}
            />
          </label>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="recurring"
            defaultChecked={transaction?.recurring}
          />
          Transação recorrente
        </label>
        <p className="form-note">
          Marcação para identificar compromissos frequentes. Não cria cobranças
          ou lançamentos automáticos.
        </p>
        {type === "transfer" && (
          <p className="form-note">
            Move o saldo entre contas. Não altera entradas, saídas ou o
            resultado do mês.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button type="submit" className="primary-button save-button">
          {busy ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <Plus size={18} />
          )}{" "}
          {busy ? "Salvando…" : "Salvar transação"}
        </button>
      </fieldset>
    </form>
  );
}
