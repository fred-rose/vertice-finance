export type TransactionType = "income" | "expense" | "transfer";
interface TransactionBase {
  id: string;
  createdAt?: string;
  amount: number;
  categoryId: string;
  description: string;
  accountId: string;
  date: string;
  recurring: boolean;
  source?: "manual" | "import" | "demo";
}
export type Transaction = TransactionBase &
  (
    | { type: "income" | "expense"; destinationAccountId?: never }
    | { type: "transfer"; destinationAccountId: string }
  );
type WithoutIdentity<T> = T extends unknown
  ? Omit<T, "id" | "createdAt" | "source">
  : never;
export type NewTransaction = WithoutIdentity<Transaction>;
export interface Account {
  id: string;
  name: string;
  type: "checking" | "savings" | "cash";
  initialBalance: number;
  initialBalanceDate: string;
}
export interface Category {
  id: string;
  name: string;
  color: string;
  type: "income" | "expense";
  monthlyBudget?: number;
}
export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
}
export interface FinanceSettings {
  accounts: Account[];
  categories: Category[];
  goals: Goal[];
  plannedIncome: number;
  fixedExpenses: { id: string; description: string; amount: number }[];
  lowBalanceThreshold: number;
}
export interface FinanceSnapshot {
  transactions: Transaction[];
  settings: FinanceSettings;
}
export interface FinancialSummary {
  income: number;
  expenses: number;
  balance: number;
  savingsRate: number | null;
}
export interface Insight {
  id: string;
  title: string;
  description: string;
  tone: "warning" | "positive" | "neutral";
  priority?: number;
}
