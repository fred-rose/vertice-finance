import { defaultSettings } from "../../src/data/catalog";
import type { BackupV2 } from "../../src/features/transactions/backup";

export function backupFixture(): BackupV2 {
  const settings = defaultSettings();
  settings.accounts[0].initialBalance = 5000;
  settings.accounts[1].initialBalance = 2000;
  settings.accounts.forEach((a) => {
    a.initialBalanceDate = "2026-09-01";
  });
  settings.categories[0].monthlyBudget = 800;
  settings.plannedIncome = 3000;
  settings.lowBalanceThreshold = 300;
  settings.fixedExpenses = [
    { id: "fixed-1", description: "Aluguel", amount: 500 },
  ];
  settings.goals = [
    {
      id: "goal-1",
      name: "Reserva",
      targetAmount: 9000,
      currentAmount: 2000,
      deadline: "2027-01-01",
    },
  ];
  const base = {
    date: "2026-09-10",
    recurring: false,
    createdAt: "2026-09-10T12:00:00.000Z",
    accountId: "principal",
    source: "manual" as const,
  };
  return {
    version: 2,
    exportedAt: "2026-09-15T15:00:00.000Z",
    settings,
    transactions: [
      {
        ...base,
        id: "z-income",
        type: "income",
        categoryId: "income",
        description: "Receita restaurada",
        amount: 2000,
      },
      {
        ...base,
        id: "a-expense",
        type: "expense",
        categoryId: "food",
        description: "Gasto restaurado",
        amount: 500,
        source: "import",
      },
      {
        ...base,
        id: "t-transfer",
        type: "transfer",
        categoryId: "transfer",
        destinationAccountId: "reserva",
        description: "Transferência restaurada",
        amount: 1000,
      },
    ],
  };
}
