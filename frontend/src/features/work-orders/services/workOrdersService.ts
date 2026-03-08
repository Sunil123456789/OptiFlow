import {
  autoGenerateWorkOrders,
  consumeWorkOrderPart,
  createWorkOrder,
  deleteWorkOrder,
  exportWorkOrders,
  fetchMachines,
  fetchSpareParts,
  fetchWorkOrderPartConsumptions,
  fetchWorkOrdersWithOptions,
  updateWorkOrder,
} from "../../../lib/api";
import type { WorkOrderPriority, WorkOrderPriorityFilter, WorkOrderSortBy, WorkOrderStatus, WorkOrderStatusFilter, SortDir } from "../types";

export function getWorkOrders(page: number, pageSize: number, filters: {
  q: string;
  statusFilter: WorkOrderStatusFilter;
  priorityFilter: WorkOrderPriorityFilter;
  sortBy: WorkOrderSortBy;
  sortDir: SortDir;
}) {
  return fetchWorkOrdersWithOptions(page, pageSize, filters);
}

export function getMachines() {
  return fetchMachines(1, 100);
}

export function createOrder(payload: {
  work_order_code: string;
  machine_id: number;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
}) {
  return createWorkOrder(payload);
}

export function updateOrder(id: number, payload: Partial<{ status: WorkOrderStatus; priority: WorkOrderPriority }>) {
  return updateWorkOrder(id, payload);
}

export function deleteOrder(id: number) {
  return deleteWorkOrder(id);
}

export function exportOrders(filters: {
  q: string;
  statusFilter: WorkOrderStatusFilter;
  priorityFilter: WorkOrderPriorityFilter;
  sortBy: WorkOrderSortBy;
  sortDir: SortDir;
}) {
  return exportWorkOrders(filters);
}

export function autoGenerateOrders() {
  return autoGenerateWorkOrders();
}

export function getSpareParts() {
  return fetchSpareParts(1, 200);
}

export function getOrderConsumptions(workOrderId: number) {
  return fetchWorkOrderPartConsumptions(workOrderId);
}

export function consumePart(
  workOrderId: number,
  payload: { part_id: number; quantity: number; notes?: string }
) {
  return consumeWorkOrderPart(workOrderId, payload);
}
