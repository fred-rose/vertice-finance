import { captureCivilCut, type CivilDate } from "../../utils/civil";
import "./SettingsPage.css";
import {
  LocalConflictError,
  type WriteReceipt,
} from "../../services/transactionRepository";
import { useLayoutEffect, useRef, useState } from "react";
import { useInvalidated, useUnsavedWork } from "../../hooks/useUnsavedWork";
import { editableKey } from "../../hooks/unsavedWork";
import { InvalidatedWork } from "../ui/InvalidatedWork";
import { Download, Plus } from "lucide-react";
import type {
  Account,
  Goal,
  FinanceSettings,
  Transaction,
} from "../../types/finance";
import {
  accountBalance,
  planningAmounts,
  goalProgress,
} from "../../features/dashboard/calculations";
import { MoneyError } from "../../utils/money";
import { validateSettings } from "../../features/transactions/validation";
import { downloadTransactions } from "../../features/transactions/importExport";
import {
  calculationUnavailable,
  accountBalanceLabel,
  moneyMinor,
  moneyFromCalculation,
} from "../../utils/format";

export function SettingsPage({
  settings,
  today,
  revision,
  transactions,
  onSave,
  onRestore,
  invalidated = false,
  onDiscard,
  readonly = false,
  onExport,
}: {
  settings: FinanceSettings;
  today: CivilDate;
  revision: number;
  transactions: Transaction[];
  onSave: (
    settings: FinanceSettings,
    expectedRevision: number,
  ) => Promise<WriteReceipt>;
  onRestore: () => void;
  invalidated?: boolean;
  onDiscard: () => void;
  readonly?: boolean;
  onExport: () => Promise<void>;
}) {
  const work = useUnsavedWork("settings");
  const invalid = useInvalidated(invalidated);
  const base = useRef(editableKey(settings));
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [baseRevision, setBaseRevision] = useState(revision);
  const [conflicted, setConflicted] = useState(false);
  const [busy, setBusyState] = useState(false);
  const setBusy = (value: boolean) => {
    work.set({ busy: value });
    setBusyState(value);
  };
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [exportError, setExportError] = useState("");
  async function exportJSON() {
    if (work.get().busy || invalid.current) return;
    setExportError("");
    setBusy(true);
    try {
      await onExport();
    } catch {
      if (!invalid.current)
        setExportError(
          "Não foi possível preparar ou iniciar o download. Tente novamente com uma sessão válida.",
        );
    } finally {
      setBusy(false);
    }
  }
  function change(next: FinanceSettings) {
    if (invalid.current || readonly) return;
    work.set({ hasUnsavedWork: editableKey(next) !== base.current });
    setSaved(false);
    setDraft(next);
  }
  useLayoutEffect(() => {
    if (invalid.current) work.set({ invalidated: true });
  }, [invalidated, invalid, work]);
  function reset() {
    if (invalid.current) return;
    const next = structuredClone(settings);
    base.current = editableKey(next);
    work.set({ hasUnsavedWork: false });
    setDraft(next);
    setBaseRevision(revision);
    setConflicted(false);
    setError("");
    setSaved(false);
  }
  function request(action: () => void) {
    if (work.get().busy || invalid.current) return;
    if (work.get().hasUnsavedWork) setPending(() => action);
    else action();
  }
  let planning;
  try {
    planning = planningAmounts(draft);
  } catch (error) {
    if (!(error instanceof MoneyError)) throw error;
  }
  function balanceLabel(account: Account) {
    try {
      const balance = accountBalance(account, transactions, today);
      return balance === null
        ? accountBalanceLabel(null)
        : moneyFromCalculation(balance);
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      return calculationUnavailable;
    }
  }
  function goalLabel(goal: Goal) {
    if (!(goal.targetAmount > 0)) return "Defina o valor do objetivo.";
    try {
      const progress = goalProgress(goal);
      return `${progress.percent}% alcançado · faltam ${moneyMinor(progress.remaining)}`;
    } catch (error) {
      if (!(error instanceof MoneyError)) throw error;
      return calculationUnavailable;
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (readonly || conflicted || busy || work.get().busy || invalid.current)
      return;
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const applied = structuredClone(
        validateSettings(draft, false, captureCivilCut().today),
      );
      const receipt = await onSave(applied, baseRevision);
      if (invalid.current) return;
      base.current = editableKey(applied);
      work.set({ hasUnsavedWork: false });
      setDraft(applied);
      setBaseRevision(receipt.revision);
      setSaved(true);
    } catch (e) {
      setConflicted(e instanceof LocalConflictError);
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível salvar as configurações.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (invalid.current)
    return (
      <InvalidatedWork
        label="Configurações"
        text={JSON.stringify(draft, null, 2)}
        onDiscard={onDiscard}
      />
    );
  return (
    <form className="settings-page" onSubmit={save}>
      {pending && (
        <section
          className="panel settings-section"
          role="group"
          aria-label="Confirmar descarte"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setPending(null);
            }
          }}
        >
          <p>Há alterações não salvas.</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPending(null)}
          >
            Continuar editando
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={() => {
              if (work.get().busy) return;
              const action = pending;
              setPending(null);
              action();
            }}
          >
            Descartar e continuar
          </button>
        </section>
      )}
      <fieldset disabled={busy || readonly}>
        <section className="panel settings-section">
          <h2>Contas e ponto de partida</h2>
          <p>
            Informe o saldo no início da data escolhida. Movimentações a partir
            dessa data serão somadas a ele. O resultado mensal continua sendo
            receitas menos despesas.
          </p>
          {draft.accounts.map((a, i) => (
            <div className="settings-record" key={a.id}>
              <div className="settings-fields">
                <label>
                  Nome da conta
                  <input
                    required
                    maxLength={60}
                    value={a.name}
                    onChange={(e) =>
                      change({
                        ...draft,
                        accounts: draft.accounts.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Tipo de conta
                  <select
                    value={a.type}
                    onChange={(e) =>
                      change({
                        ...draft,
                        accounts: draft.accounts.map((x, j) =>
                          j === i
                            ? { ...x, type: e.target.value as typeof a.type }
                            : x,
                        ),
                      })
                    }
                  >
                    <option value="checking">Conta corrente</option>
                    <option value="savings">Reserva</option>
                    <option value="cash">Dinheiro</option>
                  </select>
                </label>
                <label>
                  Saldo inicial (R$)
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={a.initialBalance}
                    onChange={(e) =>
                      change({
                        ...draft,
                        accounts: draft.accounts.map((x, j) =>
                          j === i
                            ? { ...x, initialBalance: e.target.valueAsNumber }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Data do saldo inicial
                  <input
                    type="date"
                    required
                    min="1900-01-01"
                    max={today}
                    value={a.initialBalanceDate}
                    onChange={(e) =>
                      change({
                        ...draft,
                        accounts: draft.accounts.map((x, j) =>
                          j === i
                            ? { ...x, initialBalanceDate: e.target.value }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <p className="form-note">
                Saldo calculado até hoje: {balanceLabel(a)} · inclui o saldo
                inicial e as movimentações desde a data acima.
              </p>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              change({
                ...draft,
                accounts: [
                  ...draft.accounts,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    type: "checking",
                    initialBalance: 0,
                    initialBalanceDate: today,
                  },
                ],
              })
            }
          >
            <Plus size={15} />
            Adicionar conta
          </button>
        </section>
        <section className="panel settings-section">
          <h2>Categorias e orçamento mensal</h2>
          <p>
            Defina quanto pretende gastar em cada categoria. Alertas aparecem a
            partir de 80% do limite. Deixe zero para acompanhar sem orçamento.
          </p>
          {draft.categories.map((c, i) => (
            <div className="settings-record settings-fields" key={c.id}>
              <label>
                Nome da categoria
                <input
                  required
                  maxLength={60}
                  value={c.name}
                  onChange={(e) =>
                    change({
                      ...draft,
                      categories: draft.categories.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Tipo de categoria
                <select
                  disabled={transactions.some((t) => t.categoryId === c.id)}
                  value={c.type}
                  onChange={(e) =>
                    change({
                      ...draft,
                      categories: draft.categories.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              type: e.target.value as typeof c.type,
                              monthlyBudget: undefined,
                            }
                          : x,
                      ),
                    })
                  }
                >
                  <option value="expense">Gasto</option>
                  <option value="income">Receita</option>
                </select>
              </label>
              <label>
                Cor
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) =>
                    change({
                      ...draft,
                      categories: draft.categories.map((x, j) =>
                        j === i ? { ...x, color: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              {c.type === "expense" && (
                <label>
                  Limite mensal (R$)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={c.monthlyBudget ?? 0}
                    onChange={(e) =>
                      change({
                        ...draft,
                        categories: draft.categories.map((x, j) =>
                          j === i
                            ? { ...x, monthlyBudget: e.target.valueAsNumber }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
              )}
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              change({
                ...draft,
                categories: [
                  ...draft.categories,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    type: "expense",
                    color: "#b1e6c5",
                  },
                ],
              })
            }
          >
            <Plus size={15} />
            Adicionar categoria
          </button>
        </section>
        <details className="panel settings-section">
          <summary>
            Renda e compromissos fixos <span>Planeje o que cabe no mês</span>
          </summary>
          <p>
            Valores previstos ajudam a planejar. Só transações cadastradas
            entram no resultado realizado do dashboard.
          </p>
          <div className="settings-fields">
            <label>
              Renda mensal prevista (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.plannedIncome}
                onChange={(e) =>
                  change({ ...draft, plannedIncome: e.target.valueAsNumber })
                }
              />
            </label>
            <label>
              Avisar se o saldo das contas ficar abaixo de (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.lowBalanceThreshold}
                onChange={(e) =>
                  change({
                    ...draft,
                    lowBalanceThreshold: e.target.valueAsNumber,
                  })
                }
              />
            </label>
          </div>
          {draft.fixedExpenses.map((f, i) => (
            <div className="settings-record settings-fields" key={f.id}>
              <label>
                Compromisso fixo
                <input
                  required
                  maxLength={100}
                  value={f.description}
                  onChange={(e) =>
                    change({
                      ...draft,
                      fixedExpenses: draft.fixedExpenses.map((x, j) =>
                        j === i ? { ...x, description: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Valor mensal (R$)
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={f.amount}
                  onChange={(e) =>
                    change({
                      ...draft,
                      fixedExpenses: draft.fixedExpenses.map((x, j) =>
                        j === i ? { ...x, amount: e.target.valueAsNumber } : x,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="text-link danger-text"
                onClick={() =>
                  change({
                    ...draft,
                    fixedExpenses: draft.fixedExpenses.filter(
                      (x) => x.id !== f.id,
                    ),
                  })
                }
              >
                Remover compromisso
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              change({
                ...draft,
                fixedExpenses: [
                  ...draft.fixedExpenses,
                  { id: crypto.randomUUID(), description: "", amount: 0 },
                ],
              })
            }
          >
            <Plus size={15} />
            Adicionar despesa fixa
          </button>
          {!planning ? (
            <p className="form-note" role="status">
              {calculationUnavailable}
            </p>
          ) : (
            draft.plannedIncome > 0 && (
              <p className="planning-context">
                {moneyMinor(planning.available)} previstos após compromissos
                fixos ({moneyMinor(planning.fixed)}). Esse valor ainda precisa
                cobrir gastos variáveis e metas.
              </p>
            )
          )}
        </details>
        <details className="panel settings-section">
          <summary>
            Metas pessoais <span>Dê um destino à sua sobra</span>
          </summary>
          <p>
            Registre um objetivo e quanto já separou. Os valores de metas são
            informativos e não são somados ao saldo das contas.
          </p>
          {draft.goals.map((g, i) => (
            <div className="settings-record" key={g.id}>
              <div className="settings-fields">
                <label>
                  Nome da meta
                  <input
                    required
                    maxLength={100}
                    value={g.name}
                    onChange={(e) =>
                      change({
                        ...draft,
                        goals: draft.goals.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Objetivo (R$)
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={g.targetAmount}
                    onChange={(e) =>
                      change({
                        ...draft,
                        goals: draft.goals.map((x, j) =>
                          j === i
                            ? { ...x, targetAmount: e.target.valueAsNumber }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Já separado (R$)
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={g.currentAmount}
                    onChange={(e) =>
                      change({
                        ...draft,
                        goals: draft.goals.map((x, j) =>
                          j === i
                            ? { ...x, currentAmount: e.target.valueAsNumber }
                            : x,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Prazo
                  <input
                    type="date"
                    required
                    min="1900-01-01"
                    value={g.deadline}
                    onChange={(e) =>
                      change({
                        ...draft,
                        goals: draft.goals.map((x, j) =>
                          j === i ? { ...x, deadline: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
              </div>
              <p className="form-note">{goalLabel(g)}</p>
              <button
                type="button"
                className="text-link danger-text"
                onClick={() =>
                  change({
                    ...draft,
                    goals: draft.goals.filter((x) => x.id !== g.id),
                  })
                }
              >
                Remover meta
              </button>
            </div>
          ))}
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              change({
                ...draft,
                goals: [
                  ...draft.goals,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    targetAmount: 0,
                    currentAmount: 0,
                    deadline: today,
                  },
                ],
              })
            }
          >
            <Plus size={15} />
            Adicionar meta
          </button>
        </details>
        <div className="settings-save">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-mint">
              Configurações salvas. Seus cálculos foram atualizados.
            </p>
          )}
          {conflicted && (
            <div>
              <p>Atualizar descarta o conteúdo não salvo desta edição.</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => request(reset)}
              >
                Atualizar edição
              </button>
            </div>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={conflicted}
          >
            {busy ? "Salvando…" : "Salvar configurações"}
          </button>
        </div>
      </fieldset>
      <section className="panel settings-section">
        <h2>Seus dados, com você</h2>
        {exportError && <p role="alert">{exportError}</p>}
        <p>
          Os dados ficam neste navegador. Exporte transações em CSV para
          reimportar pela tela Transações. O arquivo JSON também guarda contas,
          orçamentos e metas. Restaure um backup JSON v2 para recuperar esse
          estado completo.
        </p>
        <div className="row-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy || readonly}
            onClick={() =>
              request(() => {
                reset();
                onRestore();
              })
            }
          >
            Restaurar backup JSON
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadTransactions(transactions, settings)}
          >
            <Download size={16} />
            Exportar transações
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void exportJSON()}
          >
            <Download size={16} />
            Exportar dados completos (JSON)
          </button>
        </div>
      </section>
    </form>
  );
}
