import { useEffect, useState } from "react";

import { Modal } from "../components/Modal";
import {
  createMaintenancePlan,
  deleteMaintenancePlan,
  exportMaintenancePlans,
  fetchMachines,
  fetchMaintenancePlansWithOptions,
  updateMaintenancePlan,
} from "../lib/api";
import { exportToCsv, exportToPdfLikePrint } from "../lib/exporters";
import { canManageAssets } from "../lib/permissions";
import type { AuthUser } from "../lib/types";
import type { Machine, MaintenancePlan } from "../lib/types";

function toLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type PlansPageProps = {
  currentUser: AuthUser;
};

export function PlansPage({ currentUser }: PlansPageProps) {
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
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
  const [planCode, setPlanCode] = useState("");
  const [machineId, setMachineId] = useState<number>(1);
  const [title, setTitle] = useState("");
  const [planType, setPlanType] = useState<"calendar" | "runtime">("calendar");
  const [nextDue, setNextDue] = useState("");
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPlanType, setEditPlanType] = useState<"calendar" | "runtime">("calendar");
  const [editNextDue, setEditNextDue] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "calendar" | "runtime">("all");
  const [sortBy, setSortBy] = useState<"plan_code" | "title" | "next_due">("plan_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  async function loadPlans(targetPage = page) {
    try {
      setIsLoading(true);
      const [plansData, machineData] = await Promise.all([
        fetchMaintenancePlansWithOptions(targetPage, pageSize, {
          q: query,
          typeFilter,
          sortBy,
          sortDir,
        }),
        fetchMachines(1, 100),
      ]);
      setPlans(plansData.items);
      setMachines(machineData.items);
      setPage(plansData.pagination.page);
      setTotalPages(plansData.pagination.total_pages);
      setTotalItems(plansData.pagination.total);
      setError(null);
      if (machineData.items.length > 0) {
        setMachineId(machineData.items[0].id);
      }
    } catch {
      setError("Could not load maintenance plans from backend.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPlans(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadPlans(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, typeFilter, sortBy, sortDir]);

  async function handleCreatePlan() {
    try {
      setIsCreating(true);
      await createMaintenancePlan({
        plan_code: planCode.trim(),
        machine_id: machineId,
        title: title.trim(),
        plan_type: planType,
        next_due: nextDue.trim(),
        is_active: true,
      });
      setShowCreateForm(false);
      setPlanCode("");
      setTitle("");
      setPlanType("calendar");
      setNextDue("");
      await loadPlans(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create maintenance plan.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  function openEditModal(plan: MaintenancePlan) {
    setEditingPlan(plan);
    setEditTitle(plan.title);
    setEditPlanType(plan.plan_type);
    setEditNextDue(plan.next_due);
    setEditActive(plan.is_active);
  }

  function closeEditModal() {
    setEditingPlan(null);
    setEditTitle("");
    setEditPlanType("calendar");
    setEditNextDue("");
    setEditActive(true);
  }

  async function handleSaveEditPlan() {
    if (!editingPlan || !editTitle.trim() || !editNextDue.trim()) {
      return;
    }

    try {
      setIsSavingEdit(true);
      await updateMaintenancePlan(editingPlan.id, {
        title: editTitle.trim(),
        plan_type: editPlanType,
        next_due: editNextDue.trim(),
        is_active: editActive,
      });
      closeEditModal();
      await loadPlans(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update plan.");
      }
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeletePlan(plan: MaintenancePlan) {
    const approved = window.confirm(`Delete ${plan.plan_code} (${plan.title})?`);
    if (!approved) {
      return;
    }

    try {
      await deleteMaintenancePlan(plan.id);
      await loadPlans(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to delete plan.");
      }
    }
  }

  async function handleExportCsv() {
    try {
      const data = await exportMaintenancePlans({ q: query, typeFilter, sortBy, sortDir });
      exportToCsv(
        "maintenance_plans_export.csv",
        ["ID", "Plan Code", "Machine", "Title", "Type", "Next Due", "Active"],
        data.map((plan) => [
          plan.id,
          plan.plan_code,
          plan.machine_name,
          plan.title,
          plan.plan_type,
          plan.next_due,
          plan.is_active,
        ])
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to export plans.");
      }
    }
  }

  async function handleExportPdf() {
    try {
      const data = await exportMaintenancePlans({ q: query, typeFilter, sortBy, sortDir });
      exportToPdfLikePrint(
        "Maintenance Plans Export",
        ["ID", "Plan Code", "Machine", "Title", "Type", "Next Due", "Active"],
        data.map((plan) => [
          plan.id,
          plan.plan_code,
          plan.machine_name,
          plan.title,
          plan.plan_type,
          plan.next_due,
          plan.is_active,
        ])
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to export plans.");
      }
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Maintenance Plans</h2>
        <p>Prevent failure by scheduling checks before machine health degrades.</p>
      </div>

      <div className="action-row">
        <button
          className="primary-btn"
          type="button"
          disabled={!canManageAssets(currentUser)}
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          Create Plan
        </button>
        <button className="tab" type="button" onClick={handleExportCsv}>
          Export CSV
        </button>
        <button className="tab" type="button" onClick={handleExportPdf}>
          Export PDF
        </button>
        {!canManageAssets(currentUser) && (
          <p className="state-note">Only admin or maintenance manager can create plans.</p>
        )}
      </div>

      <div className="action-row">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code, title, machine, due"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}>
          <option value="all">All Types</option>
          <option value="calendar">Calendar</option>
          <option value="runtime">Runtime</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="plan_code">Sort: Plan Code</option>
          <option value="title">Sort: Title</option>
          <option value="next_due">Sort: Next Due</option>
        </select>
        <select value={sortDir} onChange={(e) => setSortDir(e.target.value as typeof sortDir)}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      {showCreateForm && canManageAssets(currentUser) && (
        <div className="inline-form-card">
          <h3>Create Maintenance Plan</h3>
          <div className="inline-form-grid">
            <label>
              Plan Code
              <input value={planCode} onChange={(e) => setPlanCode(e.target.value)} placeholder="PLN-NEW-001" />
            </label>
            <label>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Monthly check" />
            </label>
            <label>
              Machine
              <select value={machineId} onChange={(e) => setMachineId(Number(e.target.value))}>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.machine_code} - {machine.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plan Type
              <select value={planType} onChange={(e) => setPlanType(e.target.value as typeof planType)}>
                <option value="calendar">Calendar</option>
                <option value="runtime">Runtime</option>
              </select>
            </label>
            <label>
              Next Due
              <input value={nextDue} onChange={(e) => setNextDue(e.target.value)} placeholder="In 7 days" />
            </label>
          </div>
          <button
            className="primary-btn"
            type="button"
            onClick={handleCreatePlan}
            disabled={isCreating || !planCode.trim() || !title.trim() || !nextDue.trim() || machines.length === 0}
          >
            {isCreating ? "Creating..." : "Save Plan"}
          </button>
        </div>
      )}

      {isLoading && <p className="state-note">Loading maintenance plans...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="metric-grid compact">
        {plans.map((item) => (
          <article key={item.id} className="metric-card">
            <p className="metric-title">{item.plan_code} - {item.machine_name}</p>
            <p className="metric-value">{item.title}</p>
            <p className="metric-hint">
              Type: {toLabel(item.plan_type)} | Next due: {item.next_due}
            </p>
            <div className="row-actions">
              <button
                className="tab"
                type="button"
                  onClick={() => openEditModal(item)}
                disabled={!canManageAssets(currentUser)}
              >
                Edit
              </button>
              <button
                className="tab"
                type="button"
                onClick={() => handleDeletePlan(item)}
                disabled={!canManageAssets(currentUser)}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
        {!isLoading && plans.length === 0 && (
          <article className="metric-card">
            <p className="metric-title">No plans found</p>
            <p className="metric-hint">Create a maintenance plan to get started.</p>
          </article>
        )}
      </div>

      <div className="pagination-row">
        <button className="tab" type="button" disabled={page <= 1} onClick={() => loadPlans(page - 1)}>
          Prev
        </button>
        <button className="tab" type="button" disabled={page >= totalPages} onClick={() => loadPlans(page + 1)}>
          Next
        </button>
        <p className="pagination-meta">
          Page {page} of {totalPages} | Total plans: {totalItems}
        </p>
      </div>

      <Modal
        open={editingPlan !== null}
        title={editingPlan ? `Edit ${editingPlan.plan_code}` : "Edit Plan"}
        onClose={closeEditModal}
        actions={
          <>
            <button className="tab" type="button" onClick={closeEditModal}>
              Cancel
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={handleSaveEditPlan}
              disabled={isSavingEdit || !editTitle.trim() || !editNextDue.trim()}
            >
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="inline-form-grid">
          <label>
            Title
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Plan title" />
          </label>
          <label>
            Plan Type
            <select value={editPlanType} onChange={(e) => setEditPlanType(e.target.value as typeof editPlanType)}>
              <option value="calendar">Calendar</option>
              <option value="runtime">Runtime</option>
            </select>
          </label>
          <label>
            Next Due
            <input value={editNextDue} onChange={(e) => setEditNextDue(e.target.value)} placeholder="In 7 days" />
          </label>
          <label>
            Active
            <select value={editActive ? "yes" : "no"} onChange={(e) => setEditActive(e.target.value === "yes")}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      </Modal>
    </section>
  );
}
