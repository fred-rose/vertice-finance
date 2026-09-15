import type { Account, Category, FinanceSettings } from "../types/finance";
export const accounts: Account[] = [
  {
    id: "principal",
    name: "Conta principal",
    type: "checking",
    initialBalance: 0,
    initialBalanceDate: "1900-01-01",
  },
  {
    id: "reserva",
    name: "Reserva pessoal",
    type: "savings",
    initialBalance: 0,
    initialBalanceDate: "1900-01-01",
  },
];
export const categories: Category[] = [
  { id: "food", name: "Alimentação", color: "#b1e6c5", type: "expense" },
  { id: "transport", name: "Transporte", color: "#9baad7", type: "expense" },
  { id: "leisure", name: "Lazer", color: "#dac499", type: "expense" },
  {
    id: "subscriptions",
    name: "Assinaturas",
    color: "#a597bb",
    type: "expense",
  },
  { id: "other", name: "Outros", color: "#6a8580", type: "expense" },
  { id: "shopping", name: "Compras", color: "#cdadbd", type: "expense" },
  { id: "income", name: "Receita", color: "#b1e6c5", type: "income" },
];
export const defaultSettings = (): FinanceSettings => ({
  accounts: accounts.map((a) => ({ ...a })),
  categories: categories.map((c) => ({ ...c })),
  goals: [],
  plannedIncome: 0,
  fixedExpenses: [],
  lowBalanceThreshold: 0,
});
