import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard } from "../components/MetricCard";
import { fetchKpiTrends } from "../lib/api";
import type { DashboardSummary, KpiTrendPoint, MetricCardData } from "../lib/types";

type OverviewPageProps = {
  summary: DashboardSummary | null;
  isLoading: boolean;
  error: string | null;
};

const fallbackSummary: DashboardSummary = {
  total_machines: 0,
  open_work_orders: 0,
  overdue_work_orders: 0,
  downtime_hours_30d: 0,
  repair_cost_30d: 0,
  failure_count_30d: 0,
};

export function OverviewPage({ summary, isLoading, error }: OverviewPageProps) {
  const [trends, setTrends] = useState<KpiTrendPoint[]>([]);
  const safeSummary = summary ?? fallbackSummary;

  useEffect(() => {
    let mounted = true;
    fetchKpiTrends(14)
      .then((rows) => {
        if (mounted) {
          setTrends(rows);
        }
      })
      .catch(() => {
        if (mounted) {
          setTrends([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const cards: MetricCardData[] = [
    {
      title: "Total Machines",
      value: String(safeSummary.total_machines),
      hint: "Assets under monitoring",
    },
    {
      title: "Open Work Orders",
      value: String(safeSummary.open_work_orders),
      hint: "Active maintenance tasks",
    },
    {
      title: "Overdue Tasks",
      value: String(safeSummary.overdue_work_orders),
      hint: "Needs immediate scheduling",
    },
    {
      title: "Downtime (30d)",
      value: `${safeSummary.downtime_hours_30d} hrs`,
      hint: "Downtime impact",
    },
    {
      title: "Repair Cost (30d)",
      value: `INR ${safeSummary.repair_cost_30d.toLocaleString()}`,
      hint: "Direct maintenance spend",
    },
    {
      title: "Failures (30d)",
      value: String(safeSummary.failure_count_30d),
      hint: "Breakdowns logged",
    },
  ];

  const chartData = [
    { name: "Open", value: safeSummary.open_work_orders },
    { name: "Overdue", value: safeSummary.overdue_work_orders },
    { name: "Failures", value: safeSummary.failure_count_30d },
  ];

  return (
    <section className="page">
      <div className="page-head">
        <h2>Operations Overview</h2>
        <p>Single-screen visibility for maintenance health and execution risk.</p>
      </div>

      {isLoading && <p className="state-note">Loading dashboard summary...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="metric-grid">
        {cards.map((card) => (
          <MetricCard key={card.title} metric={card} />
        ))}
      </div>

      <article className="chart-card">
        <h3>Task Pressure Snapshot</h3>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
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
    </section>
  );
}
