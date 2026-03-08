import { useEffect, useMemo, useState } from "react";

import { acknowledgeAlert, fetchAlerts } from "../lib/api";
import { canManageAssets } from "../lib/permissions";
import type { AlertItem, AuthUser } from "../lib/types";

type AlertsPageProps = {
  currentUser: AuthUser;
  onAlertsChanged?: (openCount: number) => void;
};

function severityLabel(severity: AlertItem["severity"]): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

export function AlertsPage({ currentUser, onAlertsChanged }: AlertsPageProps) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "acknowledged">("open");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canAcknowledge = canManageAssets(currentUser);

  async function loadAlerts(filter = statusFilter) {
    try {
      setIsLoading(true);
      const data = await fetchAlerts(filter);
      setAlerts(data);
      setError(null);
      if (onAlertsChanged) {
        const openCount = data.filter((item) => item.status === "open").length;
        onAlertsChanged(openCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const summary = useMemo(() => {
    const open = alerts.filter((item) => item.status === "open").length;
    const acknowledged = alerts.filter((item) => item.status === "acknowledged").length;
    const critical = alerts.filter((item) => item.severity === "critical" || item.severity === "high").length;
    return { open, acknowledged, critical };
  }, [alerts]);

  async function handleAcknowledge(alertId: string) {
    if (!canAcknowledge) {
      return;
    }
    try {
      await acknowledgeAlert(alertId);
      await loadAlerts(statusFilter);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge alert.");
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Alerts</h2>
        <p>Operational alerts for repeated failures, overdue plans, import issues, and low spare-part stock.</p>
      </div>

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
      </div>

      <div className="action-row">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="open">Open Alerts</option>
          <option value="acknowledged">Acknowledged Alerts</option>
          <option value="all">All Alerts</option>
        </select>
        {!canAcknowledge && <p className="state-note">Only asset managers can acknowledge alerts.</p>}
      </div>

      {isLoading && <p className="state-note">Loading alerts...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Title</th>
              <th>Description</th>
              <th>Triggered</th>
              <th>Status</th>
              <th>Context</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && alerts.length === 0 && (
              <tr>
                <td colSpan={7}>No alerts found for the selected filter.</td>
              </tr>
            )}
            {alerts.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className={`badge severity-${item.severity}`}>{severityLabel(item.severity)}</span>
                </td>
                <td>{item.title}</td>
                <td>{item.description}</td>
                <td>{new Date(item.triggered_at).toLocaleString()}</td>
                <td>{item.status === "acknowledged" ? `Acknowledged by ${item.acknowledged_by ?? "-"}` : "Open"}</td>
                <td>
                  {item.machine_name ? `Machine: ${item.machine_name}` : "-"}
                  {item.batch_id ? ` | Batch: ${item.batch_id}` : ""}
                </td>
                <td>
                  <button
                    className="ghost-btn"
                    type="button"
                    disabled={!canAcknowledge || item.status === "acknowledged"}
                    onClick={() => handleAcknowledge(item.id)}
                  >
                    Acknowledge
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
