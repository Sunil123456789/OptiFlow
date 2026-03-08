import type { AlertDeliverySettings } from "../../../lib/types";

type AlertDeliverySettingsCardProps = {
  deliverySettings: AlertDeliverySettings | null;
  isSavingSettings: boolean;
  onSaveSettings: () => void;
  onUpdateField: <K extends keyof AlertDeliverySettings>(key: K, value: AlertDeliverySettings[K]) => void;
};

export function AlertDeliverySettingsCard({
  deliverySettings,
  isSavingSettings,
  onSaveSettings,
  onUpdateField,
}: AlertDeliverySettingsCardProps) {
  return (
    <div className="table-card">
      <h3>Delivery Settings</h3>
      {!deliverySettings && <p className="state-note">Delivery settings unavailable.</p>}
      {deliverySettings && (
        <div className="inline-form-grid">
          <label>
            <input
              type="checkbox"
              checked={deliverySettings.auto_dispatch_enabled}
              onChange={(e) => onUpdateField("auto_dispatch_enabled", e.target.checked)}
            />
            Auto Dispatch Enabled
          </label>
          <label>
            <input
              type="checkbox"
              checked={deliverySettings.email_enabled}
              onChange={(e) => onUpdateField("email_enabled", e.target.checked)}
            />
            Email Channel Enabled
          </label>
          <label>
            Email To
            <input
              value={deliverySettings.email_to}
              onChange={(e) => onUpdateField("email_to", e.target.value)}
              placeholder="alerts@company.com"
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={deliverySettings.webhook_enabled}
              onChange={(e) => onUpdateField("webhook_enabled", e.target.checked)}
            />
            Webhook Channel Enabled
          </label>
          <label>
            Webhook URL
            <input
              value={deliverySettings.webhook_url}
              onChange={(e) => onUpdateField("webhook_url", e.target.value)}
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
              onChange={(e) => onUpdateField("max_retries", Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Backoff Seconds
            <input
              type="number"
              min={10}
              max={3600}
              value={deliverySettings.retry_backoff_seconds}
              onChange={(e) => onUpdateField("retry_backoff_seconds", Number(e.target.value) || 60)}
            />
          </label>
          <label>
            Cooldown Seconds
            <input
              type="number"
              min={0}
              max={86400}
              value={deliverySettings.cooldown_seconds}
              onChange={(e) => onUpdateField("cooldown_seconds", Number(e.target.value) || 0)}
            />
          </label>
          <button className="primary-btn" type="button" onClick={onSaveSettings} disabled={isSavingSettings}>
            {isSavingSettings ? "Saving..." : "Save Delivery Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
