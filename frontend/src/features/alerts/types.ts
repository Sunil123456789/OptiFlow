import type { AlertItem } from "../../lib/types";

export type AlertStatusFilter = "all" | "open" | "acknowledged";
export type AlertRuleFilter = "all" | AlertItem["rule_type"];
export type AttemptChannelFilter = "all" | "email" | "webhook";
export type AttemptStatusFilter = "all" | "sent" | "failed" | "skipped";

export type AlertSummary = {
  open: number;
  acknowledged: number;
  critical: number;
};
