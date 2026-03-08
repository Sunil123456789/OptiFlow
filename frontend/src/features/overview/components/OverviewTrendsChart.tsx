import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { KpiTrendPoint } from "../../../lib/types";

type OverviewTrendsChartProps = {
  trends: KpiTrendPoint[];
};

export function OverviewTrendsChart({ trends }: OverviewTrendsChartProps) {
  return (
    <article className="chart-card">
      <h3>14-Day Failure Trend</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trends} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.12)" />
            <XAxis dataKey="day" stroke="#c6d2cf" tickFormatter={(value) => value.slice(5)} />
            <YAxis stroke="#c6d2cf" />
            <Tooltip
              contentStyle={{
                background: "#0f1a1a",
                border: "1px solid #2e5f5d",
                borderRadius: "10px",
              }}
            />
            <Line type="monotone" dataKey="failures" stroke="#f2a93b" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="downtime_hours" stroke="#9fd3ca" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
