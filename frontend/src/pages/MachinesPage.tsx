import { useEffect, useState } from "react";

import { Modal } from "../components/Modal";
import { createMachine, deleteMachine, exportMachines, fetchMachinesWithOptions, updateMachine } from "../lib/api";
import { exportToCsv, exportToPdfLikePrint } from "../lib/exporters";
import { canManageAssets } from "../lib/permissions";
import type { AuthUser } from "../lib/types";
import type { Machine } from "../lib/types";

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type MachinesPageProps = {
  currentUser: AuthUser;
};

export function MachinesPage({ currentUser }: MachinesPageProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newCriticality, setNewCriticality] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [newStatus, setNewStatus] = useState<"active" | "inactive" | "retired">("active");
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [editName, setEditName] = useState("");
  const [editCriticality, setEditCriticality] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [editStatus, setEditStatus] = useState<"active" | "inactive" | "retired">("active");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"machine_code" | "name" | "criticality" | "status">("machine_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  async function loadMachines(targetPage = page) {
    try {
      setIsLoading(true);
      const data = await fetchMachinesWithOptions(targetPage, pageSize, {
        q: query,
        sortBy,
        sortDir,
      });
      setMachines(data.items);
      setPage(data.pagination.page);
      setTotalPages(data.pagination.total_pages);
      setTotalItems(data.pagination.total);
      setError(null);
    } catch {
      setError("Could not load machines from backend.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMachines(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMachines(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sortBy, sortDir]);

  async function handleCreateMachine() {
    try {
      setIsCreating(true);
      await createMachine({
        machine_code: newCode.trim(),
        name: newName.trim(),
        criticality: newCriticality,
        status: newStatus,
      });
      setShowCreateForm(false);
      setNewCode("");
      setNewName("");
      setNewCriticality("medium");
      setNewStatus("active");
      await loadMachines(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create machine.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  function openEditModal(machine: Machine) {
    setEditingMachine(machine);
    setEditName(machine.name);
    setEditCriticality(machine.criticality);
    setEditStatus(machine.status);
  }

  function closeEditModal() {
    setEditingMachine(null);
    setEditName("");
    setEditCriticality("medium");
    setEditStatus("active");
  }

  async function handleSaveEditMachine() {
    if (!editingMachine || !editName.trim()) {
      return;
    }

    try {
      setIsSavingEdit(true);
      await updateMachine(editingMachine.id, {
        name: editName.trim(),
        criticality: editCriticality,
        status: editStatus,
      });
      closeEditModal();
      await loadMachines(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update machine.");
      }
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteMachine(machine: Machine) {
    const approved = window.confirm(`Delete ${machine.machine_code} (${machine.name})?`);
    if (!approved) {
      return;
    }

    try {
      await deleteMachine(machine.id);
      await loadMachines(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to delete machine.");
      }
    }
  }

  async function handleExportCsv() {
    try {
      const data = await exportMachines({ q: query, sortBy, sortDir });
      exportToCsv(
        "machines_export.csv",
        ["ID", "Code", "Name", "Criticality", "Status"],
        data.map((m) => [m.id, m.machine_code, m.name, m.criticality, m.status])
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to export machines.");
      }
    }
  }

  async function handleExportPdf() {
    try {
      const data = await exportMachines({ q: query, sortBy, sortDir });
      exportToPdfLikePrint(
        "Machines Export",
        ["ID", "Code", "Name", "Criticality", "Status"],
        data.map((m) => [m.id, m.machine_code, m.name, m.criticality, m.status])
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to export machines.");
      }
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Machine Registry</h2>
        <p>Track critical assets and keep maintenance plans linked to live machine states.</p>
      </div>

      <div className="action-row">
        <button
          className="primary-btn"
          type="button"
          disabled={!canManageAssets(currentUser)}
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          Add Machine
        </button>
        <button className="tab" type="button" onClick={handleExportCsv}>
          Export CSV
        </button>
        <button className="tab" type="button" onClick={handleExportPdf}>
          Export PDF
        </button>
        {!canManageAssets(currentUser) && (
          <p className="state-note">Only admin or maintenance manager can add/update machines.</p>
        )}
      </div>

      <div className="action-row">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code, name, criticality, status"
        />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="machine_code">Sort: Code</option>
          <option value="name">Sort: Name</option>
          <option value="criticality">Sort: Criticality</option>
          <option value="status">Sort: Status</option>
        </select>
        <select value={sortDir} onChange={(e) => setSortDir(e.target.value as typeof sortDir)}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      {showCreateForm && canManageAssets(currentUser) && (
        <div className="inline-form-card">
          <h3>Create Machine</h3>
          <div className="inline-form-grid">
            <label>
              Machine Code
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="MCH-NEW-001" />
            </label>
            <label>
              Name
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New Machine" />
            </label>
            <label>
              Criticality
              <select value={newCriticality} onChange={(e) => setNewCriticality(e.target.value as typeof newCriticality)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label>
              Status
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as typeof newStatus)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="retired">Retired</option>
              </select>
            </label>
          </div>
          <button
            className="primary-btn"
            type="button"
            onClick={handleCreateMachine}
            disabled={isCreating || !newCode.trim() || !newName.trim()}
          >
            {isCreating ? "Creating..." : "Save Machine"}
          </button>
        </div>
      )}

      {isLoading && <p className="state-note">Loading machines...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Code</th>
              <th>Name</th>
              <th>Criticality</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {machines.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.machine_code}</td>
                <td>{row.name}</td>
                <td>{toTitleCase(row.criticality)}</td>
                <td>{toTitleCase(row.status)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="tab"
                      type="button"
                      onClick={() => openEditModal(row)}
                      disabled={!canManageAssets(currentUser)}
                    >
                      Edit
                    </button>
                    <button
                      className="tab"
                      type="button"
                      onClick={() => handleDeleteMachine(row)}
                      disabled={!canManageAssets(currentUser)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && machines.length === 0 && (
              <tr>
                <td colSpan={6}>No machines found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <button className="tab" type="button" disabled={page <= 1} onClick={() => loadMachines(page - 1)}>
          Prev
        </button>
        <button className="tab" type="button" disabled={page >= totalPages} onClick={() => loadMachines(page + 1)}>
          Next
        </button>
        <p className="pagination-meta">
          Page {page} of {totalPages} | Total machines: {totalItems}
        </p>
      </div>

      <Modal
        open={editingMachine !== null}
        title={editingMachine ? `Edit ${editingMachine.machine_code}` : "Edit Machine"}
        onClose={closeEditModal}
        actions={
          <>
            <button className="tab" type="button" onClick={closeEditModal}>
              Cancel
            </button>
            <button className="primary-btn" type="button" onClick={handleSaveEditMachine} disabled={isSavingEdit || !editName.trim()}>
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="inline-form-grid">
          <label>
            Name
            <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Machine name" />
          </label>
          <label>
            Criticality
            <select value={editCriticality} onChange={(e) => setEditCriticality(e.target.value as typeof editCriticality)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label>
            Status
            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as typeof editStatus)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="retired">Retired</option>
            </select>
          </label>
        </div>
      </Modal>
    </section>
  );
}
