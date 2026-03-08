import type { AlertDeliveryAttempt } from "../../../lib/types";
import type { AttemptChannelFilter, AttemptStatusFilter } from "../types";

type AlertDeliveryAttemptsCardProps = {
  deliveryAttempts: AlertDeliveryAttempt[];
  attemptChannel: AttemptChannelFilter;
  onAttemptChannelChange: (value: AttemptChannelFilter) => void;
  attemptStatus: AttemptStatusFilter;
  onAttemptStatusChange: (value: AttemptStatusFilter) => void;
};

export function AlertDeliveryAttemptsCard({
  deliveryAttempts,
  attemptChannel,
  onAttemptChannelChange,
  attemptStatus,
  onAttemptStatusChange,
}: AlertDeliveryAttemptsCardProps) {
  return (
    <div className="table-card">
      <h3>Recent Delivery Attempts</h3>
      <div className="action-row">
        <select value={attemptChannel} onChange={(e) => onAttemptChannelChange(e.target.value as AttemptChannelFilter)}>
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="webhook">Webhook</option>
        </select>
        <select value={attemptStatus} onChange={(e) => onAttemptStatusChange(e.target.value as AttemptStatusFilter)}>
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
  );
}
