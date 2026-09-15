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
import { money } from "../../utils/format";
export function TrendChart({ data }: { data: ReturnType<typeof monthlyData> }) {
  const recorded = data.filter((month) => month.balance !== null);
  const average = recorded.length
    ? Math.round(
        recorded.reduce(
          (sum, month) => sum + Math.round(month.balance! * 100),
          0,
        ) / recorded.length,
      ) / 100
    : null;
  if (recorded.length < 2)
    return (
      <section className="panel trend-panel history-start">
        <div className="section-heading">
          <div>
            <h2>Tendência financeira</h2>
            <p>Seu histórico está começando.</p>
          </div>
          <span className="quiet-badge">Últimos 6 meses</span>
        </div>
        <p className="dialog-description">
          {recorded.length
            ? "Você já tem um mês registrado. Com pelo menos dois meses, será possível comparar a evolução do seu resultado."
            : "Ainda não há movimentações registradas neste intervalo para mostrar uma tendência."}
        </p>
        <a className="text-link" href="#/transacoes">
          Adicionar histórico ou importar uma planilha →
        </a>
      </section>
    );
  return (
    <section className="panel trend-panel">
      <div className="section-heading">
        <div>
          <h2>Tendência financeira</h2>
          <p>Uma visão de como você está evoluindo.</p>
        </div>
        <span className="quiet-badge">Últimos 6 meses</span>
      </div>
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
                <stop offset="0%" stopColor="#b1e6c5" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#b1e6c5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff0b" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#818a87", fontSize: 12 }}
              dy={12}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#818a87", fontSize: 11 }}
              tickFormatter={(value) =>
                `${value < 0 ? "−" : ""}${Math.abs(value) / 1000} mil`
              }
            />
            <Tooltip
              contentStyle={{
                background: "#202625",
                border: "1px solid #3a4540",
                borderRadius: 12,
                color: "#f1f3f1",
              }}
              formatter={(value, name) => [
                money(Number(value)),
                name === "balance" ? "Saldo líquido" : "Saídas",
              ]}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#b1e6c5"
              strokeWidth={2.5}
              fill="url(#balanceFill)"
              dot={{ r: 3, fill: "#b1e6c5", strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="expenses"
              stroke="#9e94b0"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              dot={{ r: 2, fill: "#9e94b0", strokeWidth: 0 }}
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
