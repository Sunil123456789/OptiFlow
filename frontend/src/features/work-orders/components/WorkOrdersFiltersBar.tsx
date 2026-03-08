import type { SortDir, WorkOrderPriorityFilter, WorkOrderSortBy, WorkOrderStatusFilter } from "../types";

type WorkOrdersFiltersBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: WorkOrderStatusFilter;
  onStatusFilterChange: (value: WorkOrderStatusFilter) => void;
  priorityFilter: WorkOrderPriorityFilter;
  onPriorityFilterChange: (value: WorkOrderPriorityFilter) => void;
  sortBy: WorkOrderSortBy;
  onSortByChange: (value: WorkOrderSortBy) => void;
  sortDir: SortDir;
  onSortDirChange: (value: SortDir) => void;
};

export function WorkOrdersFiltersBar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  sortBy,
  onSortByChange,
  sortDir,
  onSortDirChange,
}: WorkOrdersFiltersBarProps) {
  return (
    <div className="action-row">
      <input
        className="search-input"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search code, machine, status, priority"
      />
      <select value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value as WorkOrderStatusFilter)}>
        <option value="all">All Statuses</option>
        <option value="open">Open</option>
        <option value="in_progress">In Progress</option>
        <option value="done">Done</option>
        <option value="overdue">Overdue</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select value={priorityFilter} onChange={(e) => onPriorityFilterChange(e.target.value as WorkOrderPriorityFilter)}>
        <option value="all">All Priorities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="critical">Critical</option>
      </select>
      <select value={sortBy} onChange={(e) => onSortByChange(e.target.value as WorkOrderSortBy)}>
        <option value="work_order_code">Sort: Code</option>
        <option value="machine_name">Sort: Machine</option>
        <option value="status">Sort: Status</option>
        <option value="priority">Sort: Priority</option>
      </select>
      <select value={sortDir} onChange={(e) => onSortDirChange(e.target.value as SortDir)}>
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </select>
    </div>
  );
}
