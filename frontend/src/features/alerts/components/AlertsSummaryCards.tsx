import type { AlertDeliveryStats } from "../../../lib/types";
import type { AlertSummary } from "../types";

type AlertsSummaryCardsProps = {
  summary: AlertSummary;
  deliveryStats: AlertDeliveryStats | null;
};

export function AlertsSummaryCards({ summary, deliveryStats }: AlertsSummaryCardsProps) {
  return (
    <div className="metric-grid compact">
      <article className="metric-card">
        <p className="metric-title">Open Alerts</p>
        <p className="metric-value">{summary.open}</p>
        <p className="metric-hint">Needs action</p>
      </article>
      <article className="metric-card">
        <p className="metric-title">Acknowledged</p>
        <p className="metric-value">{summary.acknowledged}</p>
        <p className="metric-hint">Already reviewed</p>
      </article>
      <article className="metric-card">
        <p className="metric-title">High Priority</p>
        <p className="metric-value">{summary.critical}</p>
        <p className="metric-hint">High and critical alerts</p>
      </article>
      {deliveryStats && (
        <article className="metric-card">
          <p className="metric-title">Delivery (24h)</p>
          <p className="metric-value">{deliveryStats.sent}</p>
          <p className="metric-hint">
            Sent {deliveryStats.sent} | Failed {deliveryStats.failed} | Skipped {deliveryStats.skipped}
          </p>
        </article>
      )}
    </div>
  );
}
