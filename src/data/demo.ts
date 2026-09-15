import type { Transaction } from "../types/finance";
// A demonstração acompanha o mês de abertura. Nenhum agregado é usado pela interface.
export function createDemoTransactions(now = new Date()): Transaction[] {
  const result: Transaction[] = [];
  const incomes = [6800, 7200, 7100, 7600, 7600, 8200];
  const expenses = [
    [900, 650, 650, 200, 1700],
    [1000, 580, 720, 200, 1450],
    [980, 600, 620, 250, 1400],
    [1050, 520, 580, 250, 1350],
    [1080, 580, 620, 270, 940],
    [1320, 480, 550, 250, 750],
  ];
  for (let i = 0; i < 6; i++) {
    const month = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    const day = Math.min(now.getDate(), 15);
    const push = (
      type: "income" | "expense",
      amount: number,
      category: string,
      description: string,
      d: number,
      recurring = false,
    ) =>
      result.push({
        id: `demo-${i}-${result.length}`,
        type,
        amount,
        categoryId: category,
        description,
        accountId: "principal",
        date: `${prefix}-${String(d).padStart(2, "0")}`,
        recurring,
        source: "demo",
      });
    push("income", incomes[i] - 1200, "income", "Salário", 1, true);
    push("income", 1200, "income", "Projeto freelance", Math.min(day, 8));
    // A fixed fixture schema, independent of the user's category catalog.
    ["food", "transport", "leisure", "subscriptions", "other"].forEach(
      (categoryId, c) => {
        const amount = expenses[i][c];
        if (c === 0) {
          push("expense", amount - 184, categoryId, "Compras e refeições", 1);
          push("expense", 184, categoryId, "Supermercado", day);
        } else if (c === 1) {
          push("expense", amount - 32, categoryId, "Transporte do mês", 1);
          push("expense", 32, categoryId, "Uber", day);
        } else
          push(
            "expense",
            amount,
            categoryId,
            [
              "",
              "",
              "Lazer e cultura",
              "Serviços digitais",
              "Despesas diversas",
            ][c],
            Math.min(day, 5),
            c === 3,
          );
      },
    );
  }
  return result;
}
