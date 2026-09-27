import {
  LocalConflictError,
  type WriteReceipt,
} from "../../services/transactionRepository";
import { useState } from "react";
import { Download, Plus } from "lucide-react";
import type { FinanceSettings, Transaction } from "../../types/finance";
import { accountBalance } from "../../features/dashboard/calculations";
import { validateSettings } from "../../features/transactions/validation";
import {
  downloadBackup,
  downloadTransactions,
} from "../../features/transactions/importExport";
import { accountBalanceLabel, localDate, money } from "../../utils/format";

export function SettingsPage({
  settings,
  revision,
  transactions,
  onSave,
  onRestore,
}: {
  settings: FinanceSettings;
  revision: number;
  transactions: Transaction[];
  onSave: (
    settings: FinanceSettings,
    expectedRevision: number,
  ) => Promise<WriteReceipt>;
  onRestore: () => void;
}) {
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [baseRevision, setBaseRevision] = useState(revision);
  const [conflicted, setConflicted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  function change(next: FinanceSettings) {
    setSaved(false);
    setDraft(next);
  }
  const fixed =
    draft.fixedExpenses.reduce(
      (sum, f) => sum + Math.round(f.amount * 100),
      0,
    ) / 100;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (conflicted || busy) return;
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const applied = structuredClone(validateSettings(draft));
      const receipt = await onSave(applied, baseRevision);
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
  return (
    <form className="settings-page" onSubmit={save}>
      <fieldset disabled={busy}>
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
                    max={localDate()}
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
                Saldo calculado até hoje:{" "}
                {accountBalanceLabel(accountBalance(a, transactions))} · inclui
                o saldo inicial e as movimentações desde a data acima.
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
                    initialBalanceDate: localDate(),
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
          {draft.plannedIncome > 0 && (
            <p className="planning-context">
              {money(draft.plannedIncome - fixed)} previstos após compromissos
              fixos ({money(fixed)}). Esse valor ainda precisa cobrir gastos
              variáveis e metas.
            </p>
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
              <p className="form-note">
                {g.targetAmount > 0
                  ? `${Math.round((g.currentAmount / g.targetAmount) * 100)}% alcançado · faltam ${money(Math.max(0, g.targetAmount - g.currentAmount))}`
                  : "Defina o valor do objetivo."}
              </p>
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
                    deadline: localDate(),
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
                onClick={() => {
                  setDraft(structuredClone(settings));
                  setBaseRevision(revision);
                  setConflicted(false);
                  setError("");
                  setSaved(false);
                }}
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
            disabled={busy}
            onClick={onRestore}
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
            onClick={() => downloadBackup(settings, transactions)}
          >
            <Download size={16} />
            Exportar dados completos (JSON)
          </button>
        </div>
      </section>
    </form>
  );
}
