import { useEffect, useMemo, useState } from "react";

import {
  acknowledgeAlert,
  dispatchAlertsTick,
  dispatchOpenAlerts,
  fetchAlertDeliveryAttempts,
  fetchAlertDeliverySettings,
  fetchAlertDeliveryStats,
  fetchAlerts,
  updateAlertDeliverySettings,
} from "../lib/api";
import { canManageAssets } from "../lib/permissions";
import type {
  AlertDeliveryAttempt,
  AlertDeliverySettings,
  AlertDeliveryStats,
  AlertDispatchSummary,
  AlertItem,
  AuthUser,
} from "../lib/types";

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
  const [ruleFilter, setRuleFilter] = useState<"all" | AlertItem["rule_type"]>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isTickRunning, setIsTickRunning] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatchSummary, setDispatchSummary] = useState<AlertDispatchSummary | null>(null);
  const [deliveryAttempts, setDeliveryAttempts] = useState<AlertDeliveryAttempt[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<AlertDeliveryStats | null>(null);
  const [attemptChannel, setAttemptChannel] = useState<"all" | "email" | "webhook">("all");
  const [attemptStatus, setAttemptStatus] = useState<"all" | "sent" | "failed" | "skipped">("all");
  const [deliverySettings, setDeliverySettings] = useState<AlertDeliverySettings | null>(null);

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

  async function loadDeliveryAttempts() {
    if (!canAcknowledge) {
      setDeliveryAttempts([]);
      return;
    }
    try {
      const data = await fetchAlertDeliveryAttempts({
        limit: 20,
        channel: attemptChannel,
        statusFilter: attemptStatus,
        sinceHours: 72,
      });
      setDeliveryAttempts(data);
    } catch {
      // Keep alert loading resilient even if attempts endpoint is temporarily unavailable.
      setDeliveryAttempts([]);
    }
  }

  async function loadDeliverySettings() {
    if (!canAcknowledge) {
      setDeliverySettings(null);
      return;
    }
    try {
      const data = await fetchAlertDeliverySettings();
      setDeliverySettings(data);
    } catch {
      setDeliverySettings(null);
    }
  }

  async function loadDeliveryStats() {
    if (!canAcknowledge) {
      setDeliveryStats(null);
      return;
    }
    try {
      const data = await fetchAlertDeliveryStats(24);
      setDeliveryStats(data);
    } catch {
      setDeliveryStats(null);
    }
  }

  useEffect(() => {
    loadAlerts(statusFilter);
    loadDeliveryAttempts();
    loadDeliveryStats();
    loadDeliverySettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    loadDeliveryAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptChannel, attemptStatus]);

  const visibleAlerts = useMemo(() => {
    if (ruleFilter === "all") {
      return alerts;
    }
    return alerts.filter((item) => item.rule_type === ruleFilter);
  }, [alerts, ruleFilter]);

  const summary = useMemo(() => {
    const open = visibleAlerts.filter((item) => item.status === "open").length;
    const acknowledged = visibleAlerts.filter((item) => item.status === "acknowledged").length;
    const critical = visibleAlerts.filter((item) => item.severity === "critical" || item.severity === "high").length;
    return { open, acknowledged, critical };
  }, [visibleAlerts]);

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

  async function handleDispatchOpenAlerts() {
    if (!canAcknowledge) {
      return;
    }
    try {
      setIsDispatching(true);
      const summary = await dispatchOpenAlerts();
      setDispatchSummary(summary);
      await Promise.all([loadAlerts(statusFilter), loadDeliveryAttempts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dispatch open alerts.");
    } finally {
      setIsDispatching(false);
    }
  }

  async function handleDispatchTick(force: boolean) {
    if (!canAcknowledge) {
      return;
    }
    try {
      setIsTickRunning(true);
      const summary = await dispatchAlertsTick({ force });
      setDispatchSummary(summary);
      await Promise.all([loadAlerts(statusFilter), loadDeliveryAttempts(), loadDeliveryStats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run dispatch tick.");
    } finally {
      setIsTickRunning(false);
    }
  }

  async function handleSaveSettings() {
    if (!canAcknowledge || !deliverySettings) {
      return;
    }
    try {
      setIsSavingSettings(true);
      const saved = await updateAlertDeliverySettings(deliverySettings);
      setDeliverySettings(saved);
      await loadDeliveryStats();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save delivery settings.");
    } finally {
      setIsSavingSettings(false);
    }
  }

  function updateSettingsField<K extends keyof AlertDeliverySettings>(key: K, value: AlertDeliverySettings[K]) {
    setDeliverySettings((prev) => (prev ? { ...prev, [key]: value } : prev));
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
        {deliveryStats && (
          <article className="metric-card">
            <p className="metric-title">Delivery (24h)</p>
            <p className="metric-value">{deliveryStats.sent}</p>
            <p className="metric-hint">Sent {deliveryStats.sent} | Failed {deliveryStats.failed} | Skipped {deliveryStats.skipped}</p>
          </article>
        )}
      </div>

      <div className="action-row">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="open">Open Alerts</option>
          <option value="acknowledged">Acknowledged Alerts</option>
          <option value="all">All Alerts</option>
        </select>
        <button className={ruleFilter === "all" ? "tab active" : "tab"} type="button" onClick={() => setRuleFilter("all")}>
          All Rules
        </button>
        <button
          className={ruleFilter === "low_stock" ? "tab active" : "tab"}
          type="button"
          onClick={() => setRuleFilter("low_stock")}
        >
          Low Stock
        </button>
        {canAcknowledge && (
          <button className="ghost-btn" type="button" onClick={handleDispatchOpenAlerts} disabled={isDispatching}>
            {isDispatching ? "Dispatching..." : "Dispatch Open Alerts"}
          </button>
        )}
        {canAcknowledge && (
          <button className="ghost-btn" type="button" onClick={() => handleDispatchTick(false)} disabled={isTickRunning}>
            {isTickRunning ? "Running Tick..." : "Run Auto Tick"}
          </button>
        )}
        {canAcknowledge && (
          <button className="ghost-btn" type="button" onClick={() => handleDispatchTick(true)} disabled={isTickRunning}>
            Force Tick
          </button>
        )}
        {!canAcknowledge && <p className="state-note">Only asset managers can acknowledge alerts.</p>}
      </div>

      {dispatchSummary && (
        <p className="state-note">
          Dispatch summary: requested {dispatchSummary.requested}, sent {dispatchSummary.sent}, failed {dispatchSummary.failed}, skipped {dispatchSummary.skipped}
          {dispatchSummary.note ? ` (${dispatchSummary.note})` : ""}.
        </p>
      )}

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
            {!isLoading && visibleAlerts.length === 0 && (
              <tr>
                <td colSpan={7}>No alerts found for the selected filter.</td>
              </tr>
            )}
            {visibleAlerts.map((item) => (
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

      {canAcknowledge && (
        <div className="table-card">
          <h3>Delivery Settings</h3>
          {!deliverySettings && <p className="state-note">Delivery settings unavailable.</p>}
          {deliverySettings && (
            <div className="inline-form-grid">
              <label>
                <input
                  type="checkbox"
                  checked={deliverySettings.auto_dispatch_enabled}
                  onChange={(e) => updateSettingsField("auto_dispatch_enabled", e.target.checked)}
                />
                Auto Dispatch Enabled
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={deliverySettings.email_enabled}
                  onChange={(e) => updateSettingsField("email_enabled", e.target.checked)}
                />
                Email Channel Enabled
              </label>
              <label>
                Email To
                <input
                  value={deliverySettings.email_to}
                  onChange={(e) => updateSettingsField("email_to", e.target.value)}
                  placeholder="alerts@company.com"
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={deliverySettings.webhook_enabled}
                  onChange={(e) => updateSettingsField("webhook_enabled", e.target.checked)}
                />
                Webhook Channel Enabled
              </label>
              <label>
                Webhook URL
                <input
                  value={deliverySettings.webhook_url}
                  onChange={(e) => updateSettingsField("webhook_url", e.target.value)}
                  placeholder="https://example.com/hooks/alerts"
                />
              </label>
              <label>
                Max Attempts
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={deliverySettings.max_retries}
                  onChange={(e) => updateSettingsField("max_retries", Number(e.target.value) || 1)}
                />
              </label>
              <label>
                Backoff Seconds
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={deliverySettings.retry_backoff_seconds}
                  onChange={(e) => updateSettingsField("retry_backoff_seconds", Number(e.target.value) || 60)}
                />
              </label>
              <label>
                Cooldown Seconds
                <input
                  type="number"
                  min={0}
                  max={86400}
                  value={deliverySettings.cooldown_seconds}
                  onChange={(e) => updateSettingsField("cooldown_seconds", Number(e.target.value) || 0)}
                />
              </label>
              <button className="primary-btn" type="button" onClick={handleSaveSettings} disabled={isSavingSettings}>
                {isSavingSettings ? "Saving..." : "Save Delivery Settings"}
              </button>
            </div>
          )}
        </div>
      )}

      {canAcknowledge && (
        <div className="table-card">
          <h3>Recent Delivery Attempts</h3>
          <div className="action-row">
            <select value={attemptChannel} onChange={(e) => setAttemptChannel(e.target.value as typeof attemptChannel)}>
              <option value="all">All Channels</option>
              <option value="email">Email</option>
              <option value="webhook">Webhook</option>
            </select>
            <select value={attemptStatus} onChange={(e) => setAttemptStatus(e.target.value as typeof attemptStatus)}>
              <option value="all">All Status</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Alert ID</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Attempt</th>
                <th>Message</th>
                <th>Next Retry</th>
              </tr>
            </thead>
            <tbody>
              {deliveryAttempts.length === 0 && (
                <tr>
                  <td colSpan={7}>No delivery attempts recorded yet.</td>
                </tr>
              )}
              {deliveryAttempts.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.attempted_at).toLocaleString()}</td>
                  <td>{item.alert_id}</td>
                  <td>{item.channel}</td>
                  <td>{item.status}</td>
                  <td>{item.attempt_no}</td>
                  <td>{item.message}</td>
                  <td>{item.next_retry_at ? new Date(item.next_retry_at).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
