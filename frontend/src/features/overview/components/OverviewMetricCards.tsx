import { MetricCard } from "../../../components/MetricCard";
import type { MetricCardData } from "../../../lib/types";

type OverviewMetricCardsProps = {
  cards: MetricCardData[];
};

export function OverviewMetricCards({ cards }: OverviewMetricCardsProps) {
  return (
    <div className="metric-grid">
      {cards.map((card) => (
        <MetricCard key={card.title} metric={card} />
      ))}
    </div>
  );
}
