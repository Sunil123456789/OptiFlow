import { useEffect, useState } from "react";

import { Modal } from "../components/Modal";
import { exportAuditLogs, fetchAuditLogsWithOptions } from "../lib/api";
import { exportToCsv, exportToPdfLikePrint } from "../lib/exporters";
import { canManageUsers } from "../lib/permissions";
import type { AuditLog, AuthUser } from "../lib/types";

function toLabel(value: string): string {
  if (value.includes("_")) {
    return value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type AuditLogsPageProps = {
  currentUser: AuthUser;
};

export function AuditLogsPage({ currentUser }: AuditLogsPageProps) {
  const [events, setEvents] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState<
    "all" | "user" | "role" | "machine" | "plan" | "work_order" | "department" | "line" | "station" | "master_import"
  >("all");
  const [actionFilter, setActionFilter] = useState<"all" | "create" | "update" | "delete">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState<"event_at" | "actor_email" | "entity_type" | "action">("event_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedEvent, setSelectedEvent] = useState<AuditLog | null>(null);

  async function loadAuditLogs(targetPage = page) {
    try {
      setIsLoading(true);
      const data = await fetchAuditLogsWithOptions(targetPage, pageSize, {
        q: query,
        entityType,
        actionFilter,
        startDate,
        endDate,
        sortBy,
        sortDir,
      });
      setEvents(data.items);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.total_pages);
      setTotalItems(data.pagination.total);
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Could not load audit logs from backend.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAuditLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAuditLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, entityType, actionFilter, startDate, endDate, sortBy, sortDir]);

  async function handleExportCsv() {
    try {
      const data = await exportAuditLogs({ q: query, entityType, actionFilter, startDate, endDate, sortBy, sortDir });
      exportToCsv(
        "audit_logs_export.csv",
        ["ID", "Event At", "Actor", "Role", "Entity", "Entity ID", "Action", "Summary"],
        data.map((item) => [
          item.id,
          item.event_at,
          item.actor_email,
          item.actor_role,
          item.entity_type,
          item.entity_id,
          item.action,
          item.summary,
        ])
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to export audit logs.");
      }
    }
  }

  async function handleExportPdf() {
    try {
      const data = await exportAuditLogs({ q: query, entityType, actionFilter, startDate, endDate, sortBy, sortDir });
      exportToPdfLikePrint(
        "Audit Logs Export",
        ["ID", "Event At", "Actor", "Role", "Entity", "Entity ID", "Action", "Summary"],
        data.map((item) => [
          item.id,
          item.event_at,
          item.actor_email,
          item.actor_role,
          item.entity_type,
          item.entity_id,
          item.action,
          item.summary,
        ])
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to export audit logs.");
      }
    }
  }

  if (!canManageUsers(currentUser)) {
    return (
      <section className="page">
        <div className="page-head">
          <h2>Audit Logs</h2>
          <p>Only admin can view audit logs.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Audit Logs</h2>
        <p>Trace every create, update, and delete action across users, assets, plans, and work orders.</p>
      </div>

      <div className="action-row">
        <button className="tab" type="button" onClick={handleExportCsv}>
          Export CSV
        </button>
        <button className="tab" type="button" onClick={handleExportPdf}>
          Export PDF
        </button>
      </div>

      <div className="action-row">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actor, role, entity, action, summary"
        />
        <select value={entityType} onChange={(e) => setEntityType(e.target.value as typeof entityType)}>
          <option value="all">All Entities</option>
          <option value="user">User</option>
          <option value="role">Role</option>
          <option value="machine">Machine</option>
          <option value="plan">Plan</option>
          <option value="work_order">Work Order</option>
          <option value="department">Department</option>
          <option value="line">Line</option>
          <option value="station">Station</option>
          <option value="master_import">Master Import</option>
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}>
          <option value="all">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
        </select>
        <label>
          From
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="event_at">Sort: Event Time</option>
          <option value="actor_email">Sort: Actor Email</option>
          <option value="entity_type">Sort: Entity Type</option>
          <option value="action">Sort: Action</option>
        </select>
        <select value={sortDir} onChange={(e) => setSortDir(e.target.value as typeof sortDir)}>
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
      </div>

      {isLoading && <p className="state-note">Loading audit logs...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Event Time (UTC)</th>
              <th>Actor</th>
              <th>Role</th>
              <th>Entity</th>
              <th>Entity ID</th>
              <th>Action</th>
              <th>Summary</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{new Date(row.event_at).toLocaleString()}</td>
                <td>{row.actor_email}</td>
                <td>{toLabel(row.actor_role)}</td>
                <td>{toLabel(row.entity_type)}</td>
                <td>{row.entity_id}</td>
                <td>{toLabel(row.action)}</td>
                <td>{row.summary}</td>
                <td>
                  <button className="tab" type="button" onClick={() => setSelectedEvent(row)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && events.length === 0 && (
              <tr>
                <td colSpan={9}>No audit events found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <button className="tab" type="button" disabled={page <= 1} onClick={() => loadAuditLogs(page - 1)}>
          Prev
        </button>
        <button className="tab" type="button" disabled={page >= totalPages} onClick={() => loadAuditLogs(page + 1)}>
          Next
        </button>
        <p className="pagination-meta">
          Page {page} of {totalPages} | Total events: {totalItems}
        </p>
      </div>

      <Modal
        open={selectedEvent !== null}
        title={selectedEvent ? `Audit Event #${selectedEvent.id}` : "Audit Event"}
        onClose={() => setSelectedEvent(null)}
      >
        {selectedEvent && (
          <div className="inline-form-grid">
            <p>
              <strong>Event Time:</strong> {new Date(selectedEvent.event_at).toLocaleString()}
            </p>
            <p>
              <strong>Actor:</strong> {selectedEvent.actor_email}
            </p>
            <p>
              <strong>Actor Role:</strong> {toLabel(selectedEvent.actor_role)}
            </p>
            <p>
              <strong>Entity Type:</strong> {toLabel(selectedEvent.entity_type)}
            </p>
            <p>
              <strong>Entity ID:</strong> {selectedEvent.entity_id}
            </p>
            <p>
              <strong>Action:</strong> {toLabel(selectedEvent.action)}
            </p>
            <p>
              <strong>Summary:</strong> {selectedEvent.summary}
            </p>
          </div>
        )}
      </Modal>
    </section>
  );
}
