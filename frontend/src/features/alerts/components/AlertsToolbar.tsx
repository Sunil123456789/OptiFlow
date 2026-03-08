import type { AlertRuleFilter, AlertStatusFilter } from "../types";

type AlertsToolbarProps = {
  statusFilter: AlertStatusFilter;
  onStatusFilterChange: (value: AlertStatusFilter) => void;
  ruleFilter: AlertRuleFilter;
  onRuleFilterChange: (value: AlertRuleFilter) => void;
  canAcknowledge: boolean;
  isDispatching: boolean;
  onDispatchOpen: () => void;
  isTickRunning: boolean;
  onDispatchTick: (force: boolean) => void;
};

export function AlertsToolbar({
  statusFilter,
  onStatusFilterChange,
  ruleFilter,
  onRuleFilterChange,
  canAcknowledge,
  isDispatching,
  onDispatchOpen,
  isTickRunning,
  onDispatchTick,
}: AlertsToolbarProps) {
  return (
    <div className="action-row">
      <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as AlertStatusFilter)}>
        <option value="open">Open Alerts</option>
        <option value="acknowledged">Acknowledged Alerts</option>
        <option value="all">All Alerts</option>
      </select>

      <button className={ruleFilter === "all" ? "tab active" : "tab"} type="button" onClick={() => onRuleFilterChange("all")}>
        All Rules
      </button>
      <button
        className={ruleFilter === "low_stock" ? "tab active" : "tab"}
        type="button"
        onClick={() => onRuleFilterChange("low_stock")}
      >
        Low Stock
      </button>

      {canAcknowledge && (
        <button className="ghost-btn" type="button" onClick={onDispatchOpen} disabled={isDispatching}>
          {isDispatching ? "Dispatching..." : "Dispatch Open Alerts"}
        </button>
      )}
      {canAcknowledge && (
        <button className="ghost-btn" type="button" onClick={() => onDispatchTick(false)} disabled={isTickRunning}>
          {isTickRunning ? "Running Tick..." : "Run Auto Tick"}
        </button>
      )}
      {canAcknowledge && (
        <button className="ghost-btn" type="button" onClick={() => onDispatchTick(true)} disabled={isTickRunning}>
          Force Tick
        </button>
      )}

      {!canAcknowledge && <p className="state-note">Only asset managers can acknowledge alerts.</p>}
    </div>
  );
}
