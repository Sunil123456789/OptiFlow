export type WorkOrderStatus = "open" | "in_progress" | "done" | "overdue" | "cancelled";
export type WorkOrderPriority = "low" | "medium" | "high" | "critical";

export type WorkOrderStatusFilter = "all" | WorkOrderStatus;
export type WorkOrderPriorityFilter = "all" | WorkOrderPriority;
export type WorkOrderSortBy = "work_order_code" | "machine_name" | "status" | "priority";
export type SortDir = "asc" | "desc";
