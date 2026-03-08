import { useCallback, useEffect, useMemo, useState } from "react";
import { canManageAssets } from "../../../lib/permissions";
import type {
  AlertDeliveryAttempt,
  AlertDeliverySettings,
  AlertDeliveryStats,
  AlertDispatchSummary,
  AlertItem,
  AuthUser,
} from "../../../lib/types";
import {
  acknowledgeAlertById,
  dispatchOpenAlertsNow,
  getAlerts,
  getDeliveryAttempts,
  getDeliverySettings,
  getDeliveryStats,
  runDispatchTick,
  saveDeliverySettings,
} from "../services/alertsService";
import type { AlertRuleFilter, AlertStatusFilter, AlertSummary, AttemptChannelFilter, AttemptStatusFilter } from "../types";

type UseAlertsPageStateParams = {
  currentUser: AuthUser;
  onAlertsChanged?: (openCount: number) => void;
};

export function useAlertsPageState({ currentUser, onAlertsChanged }: UseAlertsPageStateParams) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("open");
  const [ruleFilter, setRuleFilter] = useState<AlertRuleFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isTickRunning, setIsTickRunning] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dispatchSummary, setDispatchSummary] = useState<AlertDispatchSummary | null>(null);

  const [deliveryAttempts, setDeliveryAttempts] = useState<AlertDeliveryAttempt[]>([]);
  const [deliveryStats, setDeliveryStats] = useState<AlertDeliveryStats | null>(null);
  const [attemptChannel, setAttemptChannel] = useState<AttemptChannelFilter>("all");
  const [attemptStatus, setAttemptStatus] = useState<AttemptStatusFilter>("all");
  const [deliverySettings, setDeliverySettings] = useState<AlertDeliverySettings | null>(null);

  const canAcknowledge = canManageAssets(currentUser);

  const loadAlerts = useCallback(
    async (filter: AlertStatusFilter) => {
      try {
        setIsLoading(true);
        const data = await getAlerts(filter);
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
    },
    [onAlertsChanged]
  );

  const loadDeliveryAttempts = useCallback(async () => {
    if (!canAcknowledge) {
      setDeliveryAttempts([]);
      return;
    }

    try {
      const data = await getDeliveryAttempts({ channel: attemptChannel, statusFilter: attemptStatus });
      setDeliveryAttempts(data);
    } catch {
      setDeliveryAttempts([]);
    }
  }, [canAcknowledge, attemptChannel, attemptStatus]);

  const loadDeliverySettings = useCallback(async () => {
    if (!canAcknowledge) {
      setDeliverySettings(null);
      return;
    }

    try {
      const data = await getDeliverySettings();
      setDeliverySettings(data);
    } catch {
      setDeliverySettings(null);
    }
  }, [canAcknowledge]);

  const loadDeliveryStats = useCallback(async () => {
    if (!canAcknowledge) {
      setDeliveryStats(null);
      return;
    }

    try {
      const data = await getDeliveryStats();
      setDeliveryStats(data);
    } catch {
      setDeliveryStats(null);
    }
  }, [canAcknowledge]);

  useEffect(() => {
    void loadAlerts(statusFilter);
    void loadDeliveryAttempts();
    void loadDeliveryStats();
    void loadDeliverySettings();
  }, [statusFilter, loadAlerts, loadDeliveryAttempts, loadDeliveryStats, loadDeliverySettings]);

  useEffect(() => {
    void loadDeliveryAttempts();
  }, [attemptChannel, attemptStatus, loadDeliveryAttempts]);

  const visibleAlerts = useMemo(() => {
    if (ruleFilter === "all") {
      return alerts;
    }
    return alerts.filter((item) => item.rule_type === ruleFilter);
  }, [alerts, ruleFilter]);

  const summary = useMemo<AlertSummary>(() => {
    const open = visibleAlerts.filter((item) => item.status === "open").length;
    const acknowledged = visibleAlerts.filter((item) => item.status === "acknowledged").length;
    const critical = visibleAlerts.filter((item) => item.severity === "critical" || item.severity === "high").length;
    return { open, acknowledged, critical };
  }, [visibleAlerts]);

  const acknowledge = useCallback(
    async (alertId: string) => {
      if (!canAcknowledge) {
        return;
      }

      try {
        await acknowledgeAlertById(alertId);
        await loadAlerts(statusFilter);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to acknowledge alert.");
      }
    },
    [canAcknowledge, loadAlerts, statusFilter]
  );

  const dispatchOpenAlerts = useCallback(async () => {
    if (!canAcknowledge) {
      return;
    }

    try {
      setIsDispatching(true);
      const summary = await dispatchOpenAlertsNow();
      setDispatchSummary(summary);
      await Promise.all([loadAlerts(statusFilter), loadDeliveryAttempts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dispatch open alerts.");
    } finally {
      setIsDispatching(false);
    }
  }, [canAcknowledge, loadAlerts, loadDeliveryAttempts, statusFilter]);

  const dispatchTick = useCallback(
    async (force: boolean) => {
      if (!canAcknowledge) {
        return;
      }

      try {
        setIsTickRunning(true);
        const summary = await runDispatchTick(force);
        setDispatchSummary(summary);
        await Promise.all([loadAlerts(statusFilter), loadDeliveryAttempts(), loadDeliveryStats()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to run dispatch tick.");
      } finally {
        setIsTickRunning(false);
      }
    },
    [canAcknowledge, loadAlerts, loadDeliveryAttempts, loadDeliveryStats, statusFilter]
  );

  const persistDeliverySettings = useCallback(async () => {
    if (!canAcknowledge || !deliverySettings) {
      return;
    }

    try {
      setIsSavingSettings(true);
      const saved = await saveDeliverySettings(deliverySettings);
      setDeliverySettings(saved);
      await loadDeliveryStats();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save delivery settings.");
    } finally {
      setIsSavingSettings(false);
    }
  }, [canAcknowledge, deliverySettings, loadDeliveryStats]);

  function updateSettingsField<K extends keyof AlertDeliverySettings>(key: K, value: AlertDeliverySettings[K]) {
    setDeliverySettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return {
    alerts: visibleAlerts,
    summary,
    statusFilter,
    setStatusFilter,
    ruleFilter,
    setRuleFilter,
    isLoading,
    error,
    canAcknowledge,
    acknowledge,
    isDispatching,
    dispatchOpenAlerts,
    isTickRunning,
    dispatchTick,
    dispatchSummary,
    deliveryStats,
    deliverySettings,
    updateSettingsField,
    isSavingSettings,
    persistDeliverySettings,
    deliveryAttempts,
    attemptChannel,
    setAttemptChannel,
    attemptStatus,
    setAttemptStatus,
  };
}
