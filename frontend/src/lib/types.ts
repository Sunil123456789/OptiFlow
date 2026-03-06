export type DashboardSummary = {
  total_machines: number;
  open_work_orders: number;
  overdue_work_orders: number;
  downtime_hours_30d: number;
  repair_cost_30d: number;
  failure_count_30d: number;
};

export type RolePermissions = {
  can_manage_users: boolean;
  can_manage_assets: boolean;
  can_create_work_orders: boolean;
  can_update_work_orders: boolean;
  can_import_master_data: boolean;
};

export type AuthUser = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  permissions: RolePermissions;
};

export type UserRecord = AuthUser & {
  is_active: boolean;
};

export type RoleDefinition = {
  name: string;
  is_system: boolean;
  is_active: boolean;
  permissions: RolePermissions;
};

export type MetricCardData = {
  title: string;
  value: string;
  hint: string;
};

export type Machine = {
  id: number;
  machine_code: string;
  name: string;
  criticality: "low" | "medium" | "high" | "critical";
  status: "active" | "inactive" | "retired";
};

export type WorkOrder = {
  id: number;
  work_order_code: string;
  machine_id: number;
  machine_name: string;
  status: "open" | "in_progress" | "done" | "overdue" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
};

export type MaintenancePlan = {
  id: number;
  plan_code: string;
  machine_id: number;
  machine_name: string;
  title: string;
  plan_type: "calendar" | "runtime";
  next_due: string;
  is_active: boolean;
};

export type PaginationMeta = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: PaginationMeta;
};

export type AuditLog = {
  id: number;
  event_at: string;
  actor_user_id: number;
  actor_email: string;
  actor_role: string;
  entity_type:
    | "user"
    | "role"
    | "machine"
    | "plan"
    | "work_order"
    | "department"
    | "line"
    | "station"
    | "master_import";
  entity_id: string;
  action: "create" | "update" | "delete";
  summary: string;
};

export type Department = {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
};

export type Line = {
  id: number;
  code: string;
  name: string;
  department_code: string;
  is_active: boolean;
};

export type Station = {
  id: number;
  code: string;
  name: string;
  line_code: string;
  is_active: boolean;
};

export type MasterImportResult = {
  batch_id: string;
  dry_run: boolean;
  departments_created: number;
  departments_updated: number;
  lines_created: number;
  lines_updated: number;
  stations_created: number;
  stations_updated: number;
  skipped_rows: number;
};

export type ImportHistoryItem = {
  batch_id: string;
  created_at: string;
  actor_email: string;
  source_file_name: string;
  dry_run: boolean;
  rollback_applied: boolean;
  summary: Record<string, string | number | boolean>;
};

export type RollbackResult = {
  batch_id: string;
  rolled_back_changes: number;
};

export type PlantIntegrityReport = {
  orphan_lines: number;
  orphan_stations: number;
  duplicate_department_codes: number;
  duplicate_line_codes: number;
  duplicate_station_codes: number;
  inactive_department_lines: number;
  inactive_line_stations: number;
};
