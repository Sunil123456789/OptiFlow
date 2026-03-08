import { OverviewMetricCards, OverviewPressureChart, OverviewTrendsChart } from "../features/overview/components";
import { useOverviewState } from "../features/overview/hooks/useOverviewState";
import { useOverviewTrends } from "../features/overview/hooks/useOverviewTrends";
import type { DashboardSummary } from "../lib/types";

type OverviewPageProps = {
  summary: DashboardSummary | null;
  isLoading: boolean;
  error: string | null;
};

export function OverviewPage({ summary, isLoading, error }: OverviewPageProps) {
  const { cards, pressureChartData } = useOverviewState(summary);
  const { trends } = useOverviewTrends(14);

  return (
    <section className="page">
      <div className="page-head">
        <h2>Operations Overview</h2>
        <p>Single-screen visibility for maintenance health and execution risk.</p>
      </div>

      {isLoading && <p className="state-note">Loading dashboard summary...</p>}
      {error && <p className="state-note error">{error}</p>}

      <OverviewMetricCards cards={cards} />
      <OverviewPressureChart data={pressureChartData} />
      <OverviewTrendsChart trends={trends} />
    </section>
  );
}
