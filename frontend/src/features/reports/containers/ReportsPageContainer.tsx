import { useEffect, useState } from "react";

import { exportFailureLogs, exportKpiTrends, fetchReliabilityReport } from "../../../lib/api";
import { exportToCsv } from "../../../lib/exporters";
import type { AuthUser, ReliabilityReport } from "../../../lib/types";

type ReportsPageProps = {
  currentUser: AuthUser;
};

const todayIso = new Date().toISOString().slice(0, 10);

export function ReportsPage({ currentUser }: ReportsPageProps) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState(todayIso);
  const [report, setReport] = useState<ReliabilityReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadReport() {
    try {
      setIsLoading(true);
      const data = await fetchReliabilityReport({ startDate, endDate });
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reliability report.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExportFailureCsv() {
    try {
      const rows = await exportFailureLogs({ startDate, endDate, slaStatus: "all" });
      exportToCsv(
        "failure_logs_export.csv",
        ["ID", "Occurred At", "Machine", "Severity", "SLA Status", "Downtime Hours", "Repair Cost", "Root Cause"],
        rows.map((row) => [
          row.id,
          row.occurred_at,
          row.machine_name,
          row.severity,
          row.sla_status,
          row.downtime_hours,
          row.repair_cost,
          row.root_cause,
        ])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export failure logs.");
    }
  }

  async function handleExportKpiCsv() {
    try {
      const rows = await exportKpiTrends(30);
      exportToCsv(
        "kpi_trends_export.csv",
        ["Day", "Failures", "Downtime Hours", "Repair Cost"],
        rows.map((row) => [row.day, row.failures, row.downtime_hours, row.repair_cost])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export KPI trends.");
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Reliability Reports</h2>
        <p>
          {currentUser.full_name}, review MTBF/MTTR and downtime breakdowns, then export analysis-ready CSV reports.
        </p>
      </div>

      <p className="state-note">Need broader access? Ask admin to review your role in the Users permission matrix.</p>

      <div className="action-row">
        <label>
          Start date
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <button className="primary-btn" type="button" onClick={loadReport}>
          Run Report
        </button>
        <button className="tab" type="button" onClick={handleExportFailureCsv}>
          Export Failure Logs CSV
        </button>
        <button className="tab" type="button" onClick={handleExportKpiCsv}>
          Export KPI Trend CSV
        </button>
      </div>

      {isLoading && <p className="state-note">Loading reliability report...</p>}
      {error && <p className="state-note error">{error}</p>}

      {report && (
        <>
          <div className="metric-grid compact">
            <article className="metric-card">
              <p className="metric-title">Failures</p>
              <p className="metric-value">{report.failure_count}</p>
              <p className="metric-hint">From {report.start_date} to {report.end_date}</p>
            </article>
            <article className="metric-card">
              <p className="metric-title">MTBF</p>
              <p className="metric-value">{report.mtbf_hours} h</p>
              <p className="metric-hint">Mean time between failures</p>
            </article>
            <article className="metric-card">
              <p className="metric-title">MTTR</p>
              <p className="metric-value">{report.mttr_hours} h</p>
              <p className="metric-hint">Mean time to repair</p>
            </article>
            <article className="metric-card">
              <p className="metric-title">Downtime</p>
              <p className="metric-value">{report.total_downtime_hours} h</p>
              <p className="metric-hint">Total downtime in period</p>
            </article>
          </div>

          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>Failures</th>
                  <th>Downtime Hours</th>
                  <th>Repair Cost</th>
                </tr>
              </thead>
              <tbody>
                {report.downtime_by_machine.length === 0 && (
                  <tr>
                    <td colSpan={4}>No machine failures in selected period.</td>
                  </tr>
                )}
                {report.downtime_by_machine.map((row) => (
                  <tr key={row.machine_id}>
                    <td>{row.machine_name}</td>
                    <td>{row.failure_count}</td>
                    <td>{row.downtime_hours}</td>
                    <td>{Math.round(row.repair_cost).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Failures</th>
                  <th>Downtime Hours</th>
                </tr>
              </thead>
              <tbody>
                {report.downtime_by_line.length === 0 && (
                  <tr>
                    <td colSpan={3}>No line-level downtime in selected period.</td>
                  </tr>
                )}
                {report.downtime_by_line.map((row) => (
                  <tr key={row.line_name}>
                    <td>{row.line_name}</td>
                    <td>{row.failure_count}</td>
                    <td>{row.downtime_hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

