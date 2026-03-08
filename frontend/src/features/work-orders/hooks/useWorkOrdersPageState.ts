import { useCallback, useEffect, useState } from "react";
import { exportToCsv, exportToPdfLikePrint } from "../../../lib/exporters";
import { canCreateWorkOrders, canUpdateWorkOrders } from "../../../lib/permissions";
import type { AuthUser, Machine, SparePart, WorkOrder, WorkOrderPartConsumption } from "../../../lib/types";
import {
  autoGenerateOrders,
  consumePart,
  createOrder,
  deleteOrder,
  exportOrders,
  getMachines,
  getOrderConsumptions,
  getSpareParts,
  getWorkOrders,
  updateOrder,
} from "../services/workOrdersService";
import type { SortDir, WorkOrderPriority, WorkOrderPriorityFilter, WorkOrderSortBy, WorkOrderStatus, WorkOrderStatusFilter } from "../types";

type UseWorkOrdersPageStateParams = {
  currentUser: AuthUser;
};

export function useWorkOrdersPageState({ currentUser }: UseWorkOrdersPageStateParams) {
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

  const [workOrderCode, setWorkOrderCode] = useState("");
  const [machineId, setMachineId] = useState<number>(1);
  const [status, setStatus] = useState<WorkOrderStatus>("open");
  const [priority, setPriority] = useState<WorkOrderPriority>("medium");

  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [editStatus, setEditStatus] = useState<WorkOrderStatus>("open");
  const [editPriority, setEditPriority] = useState<WorkOrderPriority>("medium");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<WorkOrderPriorityFilter>("all");
  const [sortBy, setSortBy] = useState<WorkOrderSortBy>("work_order_code");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [consumptionWorkOrder, setConsumptionWorkOrder] = useState<WorkOrder | null>(null);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [consumptions, setConsumptions] = useState<WorkOrderPartConsumption[]>([]);
  const [consumePartId, setConsumePartId] = useState<number>(0);
  const [consumeQuantity, setConsumeQuantity] = useState("1");
  const [consumeNotes, setConsumeNotes] = useState("");
  const [isConsumingPart, setIsConsumingPart] = useState(false);
  const [isLoadingConsumption, setIsLoadingConsumption] = useState(false);

  const canCreate = canCreateWorkOrders(currentUser);
  const canUpdate = canUpdateWorkOrders(currentUser);

  const loadWorkOrders = useCallback(
    async (targetPage = page) => {
      try {
        setIsLoading(true);
        const [ordersData, machinesData] = await Promise.all([
          getWorkOrders(targetPage, pageSize, {
            q: query,
            statusFilter,
            priorityFilter,
            sortBy,
            sortDir,
          }),
          getMachines(),
        ]);

        setWorkOrders(ordersData.items);
        setMachines(machinesData.items);
        setPage(ordersData.pagination.page);
        setTotalPages(ordersData.pagination.total_pages);
        setTotalItems(ordersData.pagination.total);
        setError(null);

        if (machinesData.items.length > 0) {
          setMachineId((prev) => (machinesData.items.some((machine) => machine.id === prev) ? prev : machinesData.items[0].id));
        }
      } catch {
        setError("Could not load work orders from backend.");
      } finally {
        setIsLoading(false);
      }
    },
    [page, pageSize, query, statusFilter, priorityFilter, sortBy, sortDir]
  );

  useEffect(() => {
    void loadWorkOrders(1);
  }, [loadWorkOrders]);

  async function createWorkOrderAction() {
    try {
      setIsCreating(true);
      await createOrder({
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
      setError(err instanceof Error ? err.message : "Failed to create work order.");
    } finally {
      setIsCreating(false);
    }
  }

  async function autoGenerateAction() {
    try {
      setIsAutoGenerating(true);
      const result = await autoGenerateOrders();
      setError(
        `Auto-generated ${result.generated} work order(s), skipped ${result.skipped_existing}, scanned ${result.scanned_plans} active plans.`
      );
      await loadWorkOrders(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to auto-generate work orders.");
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

  async function saveEditAction() {
    if (!editingWorkOrder) {
      return;
    }

    try {
      setIsSavingEdit(true);
      await updateOrder(editingWorkOrder.id, { status: editStatus, priority: editPriority });
      closeEditModal();
      await loadWorkOrders(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update work order.");
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function deleteOrderAction(workOrder: WorkOrder) {
    const approved = window.confirm(`Delete ${workOrder.work_order_code}?`);
    if (!approved) {
      return;
    }

    try {
      await deleteOrder(workOrder.id);
      await loadWorkOrders(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete work order.");
    }
  }

  async function exportCsvAction() {
    try {
      const data = await exportOrders({ q: query, statusFilter, priorityFilter, sortBy, sortDir });
      exportToCsv(
        "work_orders_export.csv",
        ["ID", "Code", "Machine", "Status", "Priority"],
        data.map((order) => [order.id, order.work_order_code, order.machine_name, order.status, order.priority])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export work orders.");
    }
  }

  async function exportPdfAction() {
    try {
      const data = await exportOrders({ q: query, statusFilter, priorityFilter, sortBy, sortDir });
      exportToPdfLikePrint(
        "Work Orders Export",
        ["ID", "Code", "Machine", "Status", "Priority"],
        data.map((order) => [order.id, order.work_order_code, order.machine_name, order.status, order.priority])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export work orders.");
    }
  }

  async function openConsumeModal(workOrder: WorkOrder) {
    setConsumptionWorkOrder(workOrder);
    setConsumePartId(0);
    setConsumeQuantity("1");
    setConsumeNotes("");

    try {
      setIsLoadingConsumption(true);
      const [partsData, consumptionData] = await Promise.all([getSpareParts(), getOrderConsumptions(workOrder.id)]);
      const activeParts = partsData.items.filter((part) => part.is_active);
      setSpareParts(activeParts);
      setConsumptions(consumptionData);
      if (activeParts.length > 0) {
        setConsumePartId(activeParts[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load spare parts and consumption history.");
    } finally {
      setIsLoadingConsumption(false);
    }
  }

  function closeConsumeModal() {
    setConsumptionWorkOrder(null);
    setConsumptions([]);
    setSpareParts([]);
    setConsumePartId(0);
    setConsumeQuantity("1");
    setConsumeNotes("");
  }

  async function consumePartAction() {
    if (!consumptionWorkOrder || consumePartId <= 0) {
      return;
    }

    try {
      setIsConsumingPart(true);
      await consumePart(consumptionWorkOrder.id, {
        part_id: consumePartId,
        quantity: Number(consumeQuantity),
        notes: consumeNotes.trim(),
      });

      const [partsData, consumptionData] = await Promise.all([
        getSpareParts(),
        getOrderConsumptions(consumptionWorkOrder.id),
      ]);
      const activeParts = partsData.items.filter((part) => part.is_active);
      setSpareParts(activeParts);
      setConsumptions(consumptionData);
      if (activeParts.length > 0 && !activeParts.some((part) => part.id === consumePartId)) {
        setConsumePartId(activeParts[0].id);
      }
      setConsumeQuantity("1");
      setConsumeNotes("");
      await loadWorkOrders(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to consume spare part.");
    } finally {
      setIsConsumingPart(false);
    }
  }

  return {
    workOrders,
    machines,
    page,
    totalPages,
    totalItems,
    isLoading,
    error,
    canCreate,
    canUpdate,

    showCreateForm,
    setShowCreateForm,
    isCreating,
    isAutoGenerating,

    workOrderCode,
    setWorkOrderCode,
    machineId,
    setMachineId,
    status,
    setStatus,
    priority,
    setPriority,

    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    priorityFilter,
    setPriorityFilter,
    sortBy,
    setSortBy,
    sortDir,
    setSortDir,

    editingWorkOrder,
    openEditModal,
    closeEditModal,
    editStatus,
    setEditStatus,
    editPriority,
    setEditPriority,
    isSavingEdit,

    consumptionWorkOrder,
    openConsumeModal,
    closeConsumeModal,
    spareParts,
    consumptions,
    consumePartId,
    setConsumePartId,
    consumeQuantity,
    setConsumeQuantity,
    consumeNotes,
    setConsumeNotes,
    isConsumingPart,
    isLoadingConsumption,

    loadWorkOrders,
    createWorkOrderAction,
    autoGenerateAction,
    saveEditAction,
    deleteOrderAction,
    exportCsvAction,
    exportPdfAction,
    consumePartAction,
  };
}
