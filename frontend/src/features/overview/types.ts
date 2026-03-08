import type { DashboardSummary } from "../../lib/types";

export type OverviewPageState = {
  safeSummary: DashboardSummary;
  cards: { title: string; value: string; hint: string }[];
  pressureChartData: { name: string; value: number }[];
};

export const fallbackSummary: DashboardSummary = {
  total_machines: 0,
  open_work_orders: 0,
  overdue_work_orders: 0,
  downtime_hours_30d: 0,
  repair_cost_30d: 0,
  failure_count_30d: 0,
};
