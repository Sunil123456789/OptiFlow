import { useEffect, useState } from "react";

import { Modal } from "../components/Modal";
import {
  autoGenerateWorkOrders,
  createWorkOrder,
  deleteWorkOrder,
  exportWorkOrders,
  fetchMachines,
  fetchWorkOrdersWithOptions,
  updateWorkOrder,
} from "../lib/api";
import { exportToCsv, exportToPdfLikePrint } from "../lib/exporters";
import { canCreateWorkOrders, canUpdateWorkOrders } from "../lib/permissions";
import type { AuthUser } from "../lib/types";
import type { Machine, WorkOrder } from "../lib/types";

function toLabel(value: string): string {
  if (value.includes("_")) {
    return value
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

type WorkOrdersPageProps = {
  currentUser: AuthUser;
};

export function WorkOrdersPage({ currentUser }: WorkOrdersPageProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [workOrderCode, setWorkOrderCode] = useState("");
  const [machineId, setMachineId] = useState<number>(1);
  const [status, setStatus] = useState<"open" | "in_progress" | "done" | "overdue" | "cancelled">("open");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [editStatus, setEditStatus] = useState<"open" | "in_progress" | "done" | "overdue" | "cancelled">("open");
  const [editPriority, setEditPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "in_progress" | "done" | "overdue" | "cancelled">("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "low" | "medium" | "high" | "critical">("all");
  const [sortBy, setSortBy] = useState<"work_order_code" | "machine_name" | "status" | "priority">("work_order_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  async function loadWorkOrders(targetPage = page) {
    try {
      setIsLoading(true);
      const [ordersData, machinesData] = await Promise.all([
        fetchWorkOrdersWithOptions(targetPage, pageSize, {
          q: query,
          statusFilter,
          priorityFilter,
          sortBy,
          sortDir,
        }),
        fetchMachines(1, 100),
      ]);
      setWorkOrders(ordersData.items);
      setMachines(machinesData.items);
      setPage(ordersData.pagination.page);
      setTotalPages(ordersData.pagination.total_pages);
      setTotalItems(ordersData.pagination.total);
      setError(null);
      if (machinesData.items.length > 0) {
        setMachineId(machinesData.items[0].id);
      }
    } catch {
      setError("Could not load work orders from backend.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadWorkOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadWorkOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, priorityFilter, sortBy, sortDir]);

  async function handleCreateWorkOrder() {
    try {
      setIsCreating(true);
      await createWorkOrder({
        work_order_code: workOrderCode.trim(),
        machine_id: machineId,
        status,
        priority,
      });
      setShowCreateForm(false);
      setWorkOrderCode("");
      setStatus("open");
      setPriority("medium");
      await loadWorkOrders(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create work order.");
      }
    } finally {
      setIsCreating(false);
    }
  }

  async function handleAutoGenerateWorkOrders() {
    try {
      setIsAutoGenerating(true);
      const result = await autoGenerateWorkOrders();
      await loadWorkOrders(page);
      setError(
        `Auto-generated ${result.generated} work order(s), skipped ${result.skipped_existing}, scanned ${result.scanned_plans} active plans.`
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to auto-generate work orders.");
      }
    } finally {
      setIsAutoGenerating(false);
    }
  }

  function openEditModal(workOrder: WorkOrder) {
    setEditingWorkOrder(workOrder);
    setEditStatus(workOrder.status);
    setEditPriority(workOrder.priority);
  }

  function closeEditModal() {
    setEditingWorkOrder(null);
    setEditStatus("open");
    setEditPriority("medium");
  }

  async function handleSaveEditWorkOrder() {
    if (!editingWorkOrder) {
      return;
    }

    try {
      setIsSavingEdit(true);
      await updateWorkOrder(editingWorkOrder.id, { status: editStatus, priority: editPriority });
      closeEditModal();
      await loadWorkOrders(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update work order.");
      }
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleDeleteOrder(workOrder: WorkOrder) {
    const approved = window.confirm(`Delete ${workOrder.work_order_code}?`);
    if (!approved) {
      return;
    }

    try {
      await deleteWorkOrder(workOrder.id);
      await loadWorkOrders(page);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to delete work order.");
      }
    }
  }

  async function handleExportCsv() {
    try {
      const data = await exportWorkOrders({ q: query, statusFilter, priorityFilter, sortBy, sortDir });
      exportToCsv(
        "work_orders_export.csv",
        ["ID", "Code", "Machine", "Status", "Priority"],
        data.map((order) => [
          order.id,
          order.work_order_code,
          order.machine_name,
          order.status,
          order.priority,
        ])
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to export work orders.");
      }
    }
  }

  async function handleExportPdf() {
    try {
      const data = await exportWorkOrders({ q: query, statusFilter, priorityFilter, sortBy, sortDir });
      exportToPdfLikePrint(
        "Work Orders Export",
        ["ID", "Code", "Machine", "Status", "Priority"],
        data.map((order) => [
          order.id,
          order.work_order_code,
          order.machine_name,
          order.status,
          order.priority,
        ])
      );
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to export work orders.");
      }
    }
  }

  return (
    <section className="page">
      <div className="page-head">
        <h2>Work Orders</h2>
        <p>Execution queue for technicians with clear priority and status controls.</p>
      </div>

      <div className="action-row">
        <button
          className="primary-btn"
          type="button"
          disabled={!canCreateWorkOrders(currentUser)}
          onClick={() => setShowCreateForm((prev) => !prev)}
        >
          Create Work Order
        </button>
        <button className="tab" type="button" onClick={handleExportCsv}>
          Export CSV
        </button>
        <button className="tab" type="button" onClick={handleExportPdf}>
          Export PDF
        </button>
        <button
          className="tab"
          type="button"
          onClick={handleAutoGenerateWorkOrders}
          disabled={!canCreateWorkOrders(currentUser) || isAutoGenerating}
        >
          {isAutoGenerating ? "Generating..." : "Auto-Generate From Due Plans"}
        </button>
        {!canCreateWorkOrders(currentUser) && (
          <p className="state-note">Only admin or maintenance manager can create work orders.</p>
        )}
      </div>

      <div className="action-row">
        <input
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code, machine, status, priority"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as typeof priorityFilter)}>
          <option value="all">All Priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="work_order_code">Sort: Code</option>
          <option value="machine_name">Sort: Machine</option>
          <option value="status">Sort: Status</option>
          <option value="priority">Sort: Priority</option>
        </select>
        <select value={sortDir} onChange={(e) => setSortDir(e.target.value as typeof sortDir)}>
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>

      {showCreateForm && canCreateWorkOrders(currentUser) && (
        <div className="inline-form-card">
          <h3>Create Work Order</h3>
          <div className="inline-form-grid">
            <label>
              Work Order Code
              <input
                value={workOrderCode}
                onChange={(e) => setWorkOrderCode(e.target.value)}
                placeholder="WO-NEW-001"
              />
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
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
          </div>
          <button
            className="primary-btn"
            type="button"
            onClick={handleCreateWorkOrder}
            disabled={isCreating || !workOrderCode.trim() || machines.length === 0}
          >
            {isCreating ? "Creating..." : "Save Work Order"}
          </button>
        </div>
      )}

      {!canUpdateWorkOrders(currentUser) && (
        <p className="state-note">Your role has read-only access to work orders.</p>
      )}

      {isLoading && <p className="state-note">Loading work orders...</p>}
      {error && <p className="state-note error">{error}</p>}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Code</th>
              <th>Machine</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.work_order_code}</td>
                <td>{row.machine_name}</td>
                <td>{toLabel(row.status)}</td>
                <td>{toLabel(row.priority)}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="tab"
                      type="button"
                      onClick={() => openEditModal(row)}
                      disabled={!canUpdateWorkOrders(currentUser)}
                    >
                      Edit
                    </button>
                    <button
                      className="tab"
                      type="button"
                      onClick={() => handleDeleteOrder(row)}
                      disabled={!canCreateWorkOrders(currentUser)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && workOrders.length === 0 && (
              <tr>
                <td colSpan={6}>No work orders found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <button className="tab" type="button" disabled={page <= 1} onClick={() => loadWorkOrders(page - 1)}>
          Prev
        </button>
        <button className="tab" type="button" disabled={page >= totalPages} onClick={() => loadWorkOrders(page + 1)}>
          Next
        </button>
        <p className="pagination-meta">
          Page {page} of {totalPages} | Total work orders: {totalItems}
        </p>
      </div>

      <Modal
        open={editingWorkOrder !== null}
        title={editingWorkOrder ? `Edit ${editingWorkOrder.work_order_code}` : "Edit Work Order"}
        onClose={closeEditModal}
        actions={
          <>
            <button className="tab" type="button" onClick={closeEditModal}>
              Cancel
            </button>
            <button className="primary-btn" type="button" onClick={handleSaveEditWorkOrder} disabled={isSavingEdit}>
              {isSavingEdit ? "Saving..." : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="inline-form-grid">
          <label>
            Status
            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as typeof editStatus)}>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label>
            Priority
            <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as typeof editPriority)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
        </div>
      </Modal>
    </section>
  );
}
