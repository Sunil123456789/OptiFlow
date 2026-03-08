import type { AlertItem } from "../../../lib/types";

function severityLabel(severity: AlertItem["severity"]): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

type AlertsTableProps = {
  alerts: AlertItem[];
  isLoading: boolean;
  canAcknowledge: boolean;
  onAcknowledge: (alertId: string) => void;
};

export function AlertsTable({ alerts, isLoading, canAcknowledge, onAcknowledge }: AlertsTableProps) {
  return (
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
                  onClick={() => onAcknowledge(item.id)}
                >
                  Acknowledge
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
