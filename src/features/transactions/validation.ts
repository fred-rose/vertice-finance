import type { FinanceSettings, NewTransaction } from "../../types/finance";
import { localDate } from "../../utils/format";

export function parseAmount(text: string, decimal: "," | "." = ","): number {
  let value = text.trim().replace(/R\$|\s/g, "");
  if (decimal === ",") {
    if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(value)) return NaN;
    value = value.replace(/\./g, "").replace(",", ".");
  } else {
    if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return NaN;
    value = value.replace(/,/g, "");
  }
  return Number(value);
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return (
    Number.isFinite(date.getTime()) &&
    localDate(date) === value &&
    value >= "1900-01-01"
  );
}
export function validateTransaction(
  input: NewTransaction,
  settings: FinanceSettings,
): NewTransaction {
  if (!["income", "expense", "transfer"].includes(input.type))
    throw new Error("Tipo de transação inválido.");
  if (
    !Number.isFinite(input.amount) ||
    input.amount < 0.01 ||
    input.amount > 999999999 ||
    Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.00001
  )
    throw new Error(
      "Informe um valor entre R$ 0,01 e R$ 999.999.999,00, com até duas casas decimais.",
    );
  if (!input.description?.trim() || input.description.trim().length > 100)
    throw new Error("A descrição deve ter entre 1 e 100 caracteres.");
  if (!validDate(input.date) || input.date > localDate())
    throw new Error("Informe uma data válida, até hoje.");
  if (!settings.accounts.some((a) => a.id === input.accountId))
    throw new Error("Selecione uma conta válida.");
  if (typeof input.recurring !== "boolean")
    throw new Error("Marcação de recorrência inválida.");
  if (input.type === "transfer") {
    if (
      input.destinationAccountId === input.accountId ||
      !settings.accounts.some((a) => a.id === input.destinationAccountId)
    )
      throw new Error("Selecione uma conta de destino diferente da origem.");
    return {
      ...input,
      categoryId: "transfer",
      description: input.description.trim(),
      amount: Math.round(input.amount * 100) / 100,
    };
  }
  if (
    !settings.categories.some(
      (c) => c.id === input.categoryId && c.type === input.type,
    )
  )
    throw new Error("Selecione uma categoria compatível com o tipo.");
  return {
    ...input,
    destinationAccountId: undefined,
    description: input.description.trim(),
    amount: Math.round(input.amount * 100) / 100,
  };
}
export function validateSettings(settings: FinanceSettings): FinanceSettings {
  const monetary = (n: number, negative = false) =>
    Number.isFinite(n) &&
    (negative || n >= 0) &&
    Math.abs(n) <= 999999999 &&
    Math.abs(n * 100 - Math.round(n * 100)) < 0.00001;
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
      a.initialBalanceDate > localDate()
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
    Math.round(t.amount * 100),
    t.categoryId,
    t.description.trim().toLowerCase(),
    t.accountId,
    t.destinationAccountId ?? "",
    t.date,
    t.recurring,
  ]);
