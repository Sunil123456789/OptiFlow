import { useMemo } from "react";
import type { DashboardSummary, MetricCardData } from "../../../lib/types";
import { fallbackSummary } from "../types";

export function useOverviewState(summary: DashboardSummary | null) {
  const safeSummary = summary ?? fallbackSummary;

  const cards = useMemo<MetricCardData[]>(
    () => [
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
    ],
    [safeSummary]
  );

  const pressureChartData = useMemo(
    () => [
      { name: "Open", value: safeSummary.open_work_orders },
      { name: "Overdue", value: safeSummary.overdue_work_orders },
      { name: "Failures", value: safeSummary.failure_count_30d },
    ],
    [safeSummary]
  );

  return { safeSummary, cards, pressureChartData };
}
