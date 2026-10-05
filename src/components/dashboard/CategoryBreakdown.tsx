import { Utensils, Car, Sparkles, Repeat2, Shapes } from "lucide-react";
import type { aggregateCategories } from "../../features/dashboard/calculations";
import { changeLabel, moneyFromCalculation as money } from "../../utils/format";
const icons = {
  food: Utensils,
  transport: Car,
  leisure: Sparkles,
  subscriptions: Repeat2,
  other: Shapes,
};
export function CategoryBreakdown({
  data,
}: {
  data: ReturnType<typeof aggregateCategories>;
}) {
  return (
    <section className="panel categories-panel">
      <div className="section-heading">
        <div>
          <h2>Para onde vai seu dinheiro</h2>
          <p>Gastos por categoria neste mês.</p>
        </div>
      </div>
      <div className="category-stacked" aria-hidden="true">
        {data.map((category) => (
          <span
            key={category.id}
            style={{ width: `${category.share}%`, background: category.color }}
          />
        ))}
      </div>
      <div className="category-table-label">
        <span>CATEGORIA / PARTICIPAÇÃO</span>
        <span>VALOR / CONTEXTO</span>
      </div>
      {data.map((category) => {
        const Icon = icons[category.id as keyof typeof icons] ?? Shapes;
        return (
          <div
            className={`category-row ${category.attention ? "category-attention" : ""}`}
            key={category.id}
          >
            <span className="category-icon" style={{ color: category.color }}>
              <Icon size={17} />
            </span>
            <div className="category-name">
              {category.name}
              <small>
                {category.share.toFixed(1).replace(".", ",")}% do total
              </small>
            </div>
            <div className="category-value">
              {money(category.amount)}
              <small
                className={
                  category.change !== null && category.change <= 0
                    ? "text-mint"
                    : "text-muted"
                }
              >
                {category.budgetPercent !== null
                  ? `${category.budgetPercent.toFixed(0)}% de ${money(category.monthlyBudget!)}`
                  : `${changeLabel(category.change)}${category.change !== null ? " vs. período ant." : ""}`}
              </small>
            </div>
          </div>
        );
      })}
    </section>
  );
}
