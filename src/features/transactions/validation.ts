import type { FinanceSettings, NewTransaction } from "../../types/finance";
import {
  civilDate,
  isCivilDate,
  captureCivilCut,
  type CivilDate,
} from "../../utils/civil";
import {
  fromLegacyReais,
  hasLegacyPrecision,
  MoneyError,
  parseMinorUnits,
  toLegacyReais,
} from "../../utils/money";

export function parseAmount(text: string, decimal: "," | "." = ","): number {
  try {
    const value = parseMinorUnits(text, decimal);
    // API legada: sinal do zero e NaN de parsing continuam nas bordas da UI.
    return value === 0 && text.includes("-") ? -0 : toLegacyReais(value);
  } catch (error) {
    if (error instanceof MoneyError) return NaN;
    throw error;
  }
}
export function validDate(value: string): boolean {
  return isCivilDate(value);
}

export function validateTransaction(
  input: NewTransaction,
  settings: FinanceSettings,
  options: {
    structural?: boolean;
    today?: CivilDate;
    accountIds?: ReadonlySet<string>;
    categoryTypes?: ReadonlyMap<string, string>;
  } = {},
): NewTransaction {
  if (!["income", "expense", "transfer"].includes(input.type))
    throw new Error("Tipo de transação inválido.");
  if (
    !Number.isFinite(input.amount) ||
    input.amount < 0.01 ||
    input.amount > 999999999 ||
    !hasLegacyPrecision(input.amount, "transaction")
  )
    throw new Error(
      "Informe um valor entre R$ 0,01 e R$ 999.999.999,00, com até duas casas decimais.",
    );
  if (!input.description?.trim() || input.description.trim().length > 100)
    throw new Error("A descrição deve ter entre 1 e 100 caracteres.");
  if (
    !validDate(input.date) ||
    (!options.structural &&
      input.date > civilDate(options.today ?? captureCivilCut().today))
  )
    throw new Error("Informe uma data válida, até hoje.");
  const hasAccount = (id: string | undefined) =>
    id !== undefined &&
    (options.accountIds
      ? options.accountIds.has(id)
      : settings.accounts.some((a) => a.id === id));
  if (!hasAccount(input.accountId))
    throw new Error("Selecione uma conta válida.");
  if (typeof input.recurring !== "boolean")
    throw new Error("Marcação de recorrência inválida.");
  if (input.type === "transfer") {
    if (
      input.destinationAccountId === input.accountId ||
      !hasAccount(input.destinationAccountId)
    )
      throw new Error("Selecione uma conta de destino diferente da origem.");
    return {
      ...input,
      categoryId: "transfer",
      description: input.description.trim(),
      amount: toLegacyReais(fromLegacyReais(input.amount)),
    };
  }
  if (
    !(options.categoryTypes
      ? options.categoryTypes.get(input.categoryId) === input.type
      : settings.categories.some(
          (c) => c.id === input.categoryId && c.type === input.type,
        ))
  )
    throw new Error("Selecione uma categoria compatível com o tipo.");
  return {
    ...input,
    destinationAccountId: undefined,
    description: input.description.trim(),
    amount: toLegacyReais(fromLegacyReais(input.amount)),
  };
}
export function validateSettings(
  settings: FinanceSettings,
  structural = false,
  today?: CivilDate,
): FinanceSettings {
  const cutoff = structural
    ? undefined
    : civilDate(today ?? captureCivilCut().today);
  const monetary = (n: number, negative = false) =>
    Number.isFinite(n) &&
    (negative || n >= 0) &&
    Math.abs(n) <= 999999999 &&
    hasLegacyPrecision(n, "settings");
  const unique = (items: { id: string; name: string }[]) =>
    new Set(items.map((x) => x.id)).size === items.length &&
    new Set(items.map((x) => x.name.trim().toLocaleLowerCase())).size ===
      items.length;
  if (
    !settings.accounts.length ||
    !unique(settings.accounts) ||
    !unique(settings.categories)
  )
    throw new Error("Contas e categorias precisam ter nomes únicos.");
  for (const a of settings.accounts)
    if (
      !a.id ||
      !a.name.trim() ||
      a.name.length > 60 ||
      !["checking", "savings", "cash"].includes(a.type) ||
      !monetary(a.initialBalance, true) ||
      !validDate(a.initialBalanceDate) ||
      (!structural && a.initialBalanceDate > cutoff!)
    )
      throw new Error("Revise nome, saldo e data inicial das contas.");
  for (const c of settings.categories)
    if (
      !c.id ||
      !c.name.trim() ||
      c.name.length > 60 ||
      !["income", "expense"].includes(c.type) ||
      !/^#[0-9a-f]{6}$/i.test(c.color) ||
      (c.monthlyBudget !== undefined && !monetary(c.monthlyBudget))
    )
      throw new Error("Revise as categorias e seus orçamentos.");
  if (
    !settings.categories.some((c) => c.type === "expense") ||
    !settings.categories.some((c) => c.type === "income")
  )
    throw new Error(
      "Mantenha ao menos uma categoria de gasto e uma de receita.",
    );
  if (
    !monetary(settings.plannedIncome) ||
    !monetary(settings.lowBalanceThreshold)
  )
    throw new Error(
      "Renda prevista e limite de saldo devem ser valores positivos ou zero.",
    );
  for (const f of settings.fixedExpenses)
    if (!f.description.trim() || !monetary(f.amount) || f.amount <= 0)
      throw new Error("Revise suas despesas fixas.");
  for (const g of settings.goals)
    if (
      !g.name.trim() ||
      !monetary(g.targetAmount) ||
      g.targetAmount <= 0 ||
      !monetary(g.currentAmount) ||
      !validDate(g.deadline)
    )
      throw new Error("Revise o nome, valores e prazo das metas.");
  return settings;
}
export const transactionSignature = (t: NewTransaction) =>
  JSON.stringify([
    t.type,
    fromLegacyReais(t.amount),
    t.categoryId,
    t.description.trim().toLowerCase(),
    t.accountId,
    t.destinationAccountId ?? "",
    t.date,
    t.recurring,
  ]);
