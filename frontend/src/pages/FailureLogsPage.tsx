import { useEffect, useMemo, useState } from "react";

import {
  createFailureLog,
  deleteFailureLog,
  fetchFailureLogs,
  fetchMachines,
} from "../lib/api";
import { canManageAssets } from "../lib/permissions";
import type { AuthUser, FailureLog, Machine } from "../lib/types";

type FailureLogsPageProps = {
  currentUser: AuthUser;
};

export function FailureLogsPage({ currentUser }: FailureLogsPageProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [logs, setLogs] = useState<FailureLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [machineId, setMachineId] = useState<number>(0);
  const [occurredAt, setOccurredAt] = useState("");
  const [downtimeHours, setDowntimeHours] = useState("1.0");
  const [repairCost, setRepairCost] = useState("0");
  const [rootCause, setRootCause] = useState("");
  const [notes, setNotes] = useState("");

  const canEdit = canManageAssets(currentUser);

  async function loadAll() {
    try {
      setIsLoading(true);
      const [logsData, machineData] = await Promise.all([
        fetchFailureLogs(),
        fetchMachines(1, 200),
      ]);
      setLogs(logsData);
      setMachines(machineData.items);
      if (machineData.items.length > 0 && machineId <= 0) {
        setMachineId(machineData.items[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load failure logs.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const downtime = logs.reduce((sum, row) => sum + row.downtime_hours, 0);
    const cost = logs.reduce((sum, row) => sum + row.repair_cost, 0);
    return {
      count: logs.length,
      downtime: downtime.toFixed(2),
      cost: Math.round(cost),
    };
  }, [logs]);

  async function handleCreateFailureLog() {
    if (!canEdit) {
      return;
    }
    if (machineId <= 0 || !occurredAt || !rootCause.trim()) {
      setError("Machine, occurred at, and root cause are required.");
      return;
    }

    try {
      await createFailureLog({
        machine_id: machineId,
        occurred_at: occurredAt,
        downtime_hours: Number(downtimeHours),
        repair_cost: Number(repairCost),
        root_cause: rootCause.trim(),
        notes: notes.trim(),
      });
      setOccurredAt("");
      setDowntimeHours("1.0");
      setRepairCost("0");
      setRootCause("");
      setNotes("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create failure log.");
    }
  }

  async function handleDeleteFailureLog(failureLogId: number) {
    if (!canEdit) {
      return;
    }
    const approved = window.confirm(`Delete failure log #${failureLogId}?`);
    if (!approved) {
      return;
    }

    try {
      await deleteFailureLog(failureLogId);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete failure log.");
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Failure Logs</h2>
        <p>Record breakdown events with downtime, repair spend, and root causes.</p>
      </div>

      {isLoading && <p className="state-note">Loading failure logs...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="metric-grid compact">
        <article className="metric-card">
          <p className="metric-title">Failure Events</p>
          <p className="metric-value">{totals.count}</p>
          <p className="metric-hint">Logged incidents</p>
        </article>
        <article className="metric-card">
          <p className="metric-title">Downtime Hours</p>
          <p className="metric-value">{totals.downtime}</p>
          <p className="metric-hint">Total recorded downtime</p>
        </article>
        <article className="metric-card">
          <p className="metric-title">Repair Cost</p>
          <p className="metric-value">INR {totals.cost.toLocaleString()}</p>
          <p className="metric-hint">Total recorded repair spend</p>
        </article>
      </div>

      <div className="inline-form-card">
        <h3>Add Failure Event</h3>
        {!canEdit && <p className="state-note">Only asset managers can add or delete failure logs.</p>}
        <div className="inline-form-grid">
          <label>
            Machine
            <select value={machineId} onChange={(event) => setMachineId(Number(event.target.value))}>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.machine_code} - {machine.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Occurred At
            <input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
          </label>
          <label>
            Downtime (hours)
            <input type="number" min="0" step="0.25" value={downtimeHours} onChange={(event) => setDowntimeHours(event.target.value)} />
          </label>
          <label>
            Repair Cost
            <input type="number" min="0" step="100" value={repairCost} onChange={(event) => setRepairCost(event.target.value)} />
          </label>
          <label>
            Root Cause
            <input type="text" value={rootCause} onChange={(event) => setRootCause(event.target.value)} placeholder="Example: sensor drift" />
          </label>
          <label>
            Notes
            <input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Extra context for maintenance review" />
          </label>
        </div>
        <button className="primary-btn" type="button" onClick={handleCreateFailureLog} disabled={!canEdit}>
          Add Failure Log
        </button>
      </div>

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Occurred At</th>
              <th>Machine</th>
              <th>Downtime</th>
              <th>Repair Cost</th>
              <th>Root Cause</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={8}>No failure logs available.</td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.id}</td>
                <td>{new Date(log.occurred_at).toLocaleString()}</td>
                <td>{log.machine_name}</td>
                <td>{log.downtime_hours}</td>
                <td>{Math.round(log.repair_cost).toLocaleString()}</td>
                <td>{log.root_cause}</td>
                <td>{log.notes || "-"}</td>
                <td>
                  <button className="ghost-btn" type="button" onClick={() => handleDeleteFailureLog(log.id)} disabled={!canEdit}>
                    Delete
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
