import type { AuthUser } from "../lib/types";
import {
  AlertDeliveryAttemptsCard,
  AlertDeliverySettingsCard,
  AlertsSummaryCards,
  AlertsTable,
  AlertsToolbar,
} from "../features/alerts/components";
import { useAlertsPageState } from "../features/alerts/hooks/useAlertsPageState";

type AlertsPageProps = {
  currentUser: AuthUser;
  onAlertsChanged?: (openCount: number) => void;
};

export function AlertsPage({ currentUser, onAlertsChanged }: AlertsPageProps) {
  const {
    alerts,
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
  } = useAlertsPageState({ currentUser, onAlertsChanged });

  return (
    <section className="page">
      <div className="page-head">
        <h2>Alerts</h2>
        <p>Operational alerts for repeated failures, overdue plans, import issues, and low spare-part stock.</p>
      </div>

      <AlertsSummaryCards summary={summary} deliveryStats={deliveryStats} />
      <AlertsToolbar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        ruleFilter={ruleFilter}
        onRuleFilterChange={setRuleFilter}
        canAcknowledge={canAcknowledge}
        isDispatching={isDispatching}
        onDispatchOpen={dispatchOpenAlerts}
        isTickRunning={isTickRunning}
        onDispatchTick={dispatchTick}
      />

      {dispatchSummary && (
        <p className="state-note">
          Dispatch summary: requested {dispatchSummary.requested}, sent {dispatchSummary.sent}, failed {dispatchSummary.failed}, skipped {dispatchSummary.skipped}
          {dispatchSummary.note ? ` (${dispatchSummary.note})` : ""}.
        </p>
      )}

      {isLoading && <p className="state-note">Loading alerts...</p>}
      {error && <p className="state-note error">{error}</p>}

      <AlertsTable alerts={alerts} isLoading={isLoading} canAcknowledge={canAcknowledge} onAcknowledge={acknowledge} />

      {canAcknowledge && (
        <AlertDeliverySettingsCard
          deliverySettings={deliverySettings}
          isSavingSettings={isSavingSettings}
          onSaveSettings={persistDeliverySettings}
          onUpdateField={updateSettingsField}
        />
      )}

      {canAcknowledge && (
        <AlertDeliveryAttemptsCard
          deliveryAttempts={deliveryAttempts}
          attemptChannel={attemptChannel}
          onAttemptChannelChange={setAttemptChannel}
          attemptStatus={attemptStatus}
          onAttemptStatusChange={setAttemptStatus}
        />
      )}
    </section>
  );
}
