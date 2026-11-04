import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { monthlyData } from "../../features/dashboard/calculations";
import { moneyFromCalculation as money } from "../../utils/format";
import { ArrowRight, Check, Clock3, TrendingUp } from "lucide-react";

function TrendHeading({ early = false }: { early?: boolean }) {
  return (
    <div className="section-heading">
      <div className="overview-section-title">
        <span className="overview-section-icon" aria-hidden="true">
          <TrendingUp size={19} />
        </span>
        <div>
          <h2>Tendência financeira</h2>
          <p>
            {early
              ? "Seu histórico está começando."
              : "Uma visão de como você está evoluindo."}
          </p>
        </div>
      </div>
      <span className="quiet-badge">Últimos 6 meses</span>
    </div>
  );
}
export function TrendChart({
  data,
  average,
}: {
  data: ReturnType<typeof monthlyData>;
  average: number | null;
}) {
  const recorded = data.filter((month) => month.balance !== null);
  // average foi calculado em centavos checked, antes da borda Recharts.
  if (recorded.length < 2)
    return (
      <section
        className="panel trend-panel history-start overview-lower-card"
        aria-label="Tendência financeira"
      >
        <TrendHeading early />
        <div className="overview-empty trend-early-state">
          <span className="overview-state-label">
            {recorded.length ? "Primeiro mês registrado" : "Histórico inicial"}
          </span>
          <h3>Seu próximo mês traz uma nova perspectiva.</h3>
          <p className="overview-empty-description">
            {recorded.length
              ? "Você já tem um mês registrado. Com pelo menos dois meses, será possível comparar a evolução do seu resultado."
              : "Ainda não há movimentações registradas neste intervalo para mostrar uma tendência."}
          </p>
          <div className="history-milestones">
            <span data-complete={!!recorded.length}>
              {recorded.length ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Clock3 size={14} aria-hidden="true" />
              )}
              Primeiro mês
            </span>
            <span>
              <Clock3 size={14} aria-hidden="true" />
              Comparação entre meses
            </span>
          </div>
          <a className="overview-detail-action" href="#/transacoes">
            Adicionar histórico ou importar uma planilha{" "}
            <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
        <p className="overview-module-note">
          A evolução aparece com pelo menos dois meses registrados. Lacunas não
          representam saldo zero.
        </p>
      </section>
    );
  return (
    <section
      className="panel trend-panel overview-lower-card"
      aria-label="Tendência financeira"
    >
      <TrendHeading />
      <div className="chart-legend">
        <span>
          <i className="legend-dot mint" />
          Saldo líquido
        </span>
        <span>
          <i className="legend-dot purple" />
          Saídas
        </span>
        <span className="chart-average">
          Saldo médio{" "}
          <b>{average === null ? "Sem histórico" : money(average)}</b>
        </span>
      </div>
      <div
        className="chart-container"
        role="img"
        aria-label={`Evolução mensal do saldo e das saídas. Saldo médio: ${average === null ? "sem histórico" : money(average)}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 15, right: 8, left: -14, bottom: 0 }}
          >
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--ov-accent, #b1e6c5)"
                  stopOpacity={0.18}
                />
                <stop
                  offset="100%"
                  stopColor="var(--ov-accent, #b1e6c5)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke="var(--ov-grid, #ffffff0b)"
              vertical={false}
            />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--ov-muted, #818a87)", fontSize: 12 }}
              dy={12}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--ov-muted, #818a87)", fontSize: 11 }}
              tickFormatter={(value) =>
                `${value < 0 ? "−" : ""}${Math.abs(value) / 1000} mil`
              }
            />
            <Tooltip
              contentStyle={{
                background: "var(--ov-tooltip, #202625)",
                border: "1px solid var(--ov-border, #3a4540)",
                borderRadius: 12,
                color: "var(--ov-foreground, #f1f3f1)",
              }}
              formatter={(value, name) => [
                money(Number(value)),
                name === "balance" ? "Saldo líquido" : "Saídas",
              ]}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="var(--ov-accent, #b1e6c5)"
              strokeWidth={2.5}
              fill="url(#balanceFill)"
              dot={{ r: 3, fill: "var(--ov-accent, #b1e6c5)", strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="expenses"
              stroke="var(--ov-secondary, #9e94b0)"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={{
                r: 2,
                fill: "var(--ov-secondary, #9e94b0)",
                strokeWidth: 0,
              }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-footnote">
        Média de {recorded.length} meses com registros · lacunas indicam
        ausência de dados · mês atual pode estar parcial
      </div>
    </section>
  );
}
