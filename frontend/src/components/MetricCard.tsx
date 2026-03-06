import type { MetricCardData } from "../lib/types";

type MetricCardProps = {
  metric: MetricCardData;
};

export function MetricCard({ metric }: MetricCardProps) {
  return (
    <article className="metric-card">
      <p className="metric-title">{metric.title}</p>
      <p className="metric-value">{metric.value}</p>
      <p className="metric-hint">{metric.hint}</p>
    </article>
  );
}
