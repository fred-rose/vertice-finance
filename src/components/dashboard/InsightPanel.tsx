import {
  ArrowDownRight,
  Lightbulb,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import type { Insight } from "../../types/finance";
export function InsightPanel({ insights }: { insights: Insight[] }) {
  return (
    <section className="insights-section">
      <div className="insight-heading">
        <h2>
          <Lightbulb size={18} />
          Requer sua atenção
        </h2>
        <span>Pequenas observações. Melhores decisões.</span>
      </div>
      <div className="insight-grid">
        {insights.length ? (
          insights.map((insight) => (
            <article className={`insight ${insight.tone}`} key={insight.id}>
              <span className="insight-icon">
                {insight.tone === "warning" ? (
                  <TriangleAlert size={18} />
                ) : insight.id === "spending" ? (
                  <ArrowDownRight size={19} />
                ) : (
                  <TrendingUp size={19} />
                )}
              </span>
              <div>
                <h3>{insight.title}</h3>
                <p>{insight.description}</p>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">
            Nenhum alerta relevante com os registros disponíveis. Continue
            mantendo seus lançamentos em dia.
          </p>
        )}
      </div>
    </section>
  );
}
