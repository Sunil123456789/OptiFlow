import {
  acknowledgeAlert,
  dispatchAlertsTick,
  dispatchOpenAlerts,
  fetchAlertDeliveryAttempts,
  fetchAlertDeliverySettings,
  fetchAlertDeliveryStats,
  fetchAlerts,
  updateAlertDeliverySettings,
} from "../../../lib/api";
import type { AlertDeliverySettings } from "../../../lib/types";
import type { AlertStatusFilter, AttemptChannelFilter, AttemptStatusFilter } from "../types";

export function getAlerts(statusFilter: AlertStatusFilter) {
  return fetchAlerts(statusFilter);
}

export function getDeliveryAttempts(filters: { channel: AttemptChannelFilter; statusFilter: AttemptStatusFilter }) {
  return fetchAlertDeliveryAttempts({
    limit: 20,
    channel: filters.channel,
    statusFilter: filters.statusFilter,
    sinceHours: 72,
  });
}

export function getDeliverySettings() {
  return fetchAlertDeliverySettings();
}

export function getDeliveryStats() {
  return fetchAlertDeliveryStats(24);
}

export function acknowledgeAlertById(alertId: string) {
  return acknowledgeAlert(alertId);
}

export function dispatchOpenAlertsNow() {
  return dispatchOpenAlerts();
}

export function runDispatchTick(force: boolean) {
  return dispatchAlertsTick({ force });
}

export function saveDeliverySettings(settings: AlertDeliverySettings) {
  return updateAlertDeliverySettings(settings);
}
