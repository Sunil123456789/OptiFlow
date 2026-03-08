import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type OverviewPressureChartProps = {
  data: { name: string; value: number }[];
};

export function OverviewPressureChart({ data }: OverviewPressureChartProps) {
  return (
    <article className="chart-card">
      <h3>Task Pressure Snapshot</h3>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.12)" />
            <XAxis dataKey="name" stroke="#c6d2cf" />
            <YAxis stroke="#c6d2cf" />
            <Tooltip
              contentStyle={{
                background: "#0f1a1a",
                border: "1px solid #2e5f5d",
                borderRadius: "10px",
              }}
            />
            <Bar dataKey="value" fill="#f2a93b" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
