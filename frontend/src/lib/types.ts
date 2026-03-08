export type DashboardSummary = {
  total_machines: number;
  open_work_orders: number;
  overdue_work_orders: number;
  downtime_hours_30d: number;
  repair_cost_30d: number;
  failure_count_30d: number;
};

export type KpiTrendPoint = {
  day: string;
  failures: number;
  downtime_hours: number;
  repair_cost: number;
};

export type AlertItem = {
  id: string;
  rule_type: "repeat_failure" | "overdue_plan" | "import_issue";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  triggered_at: string;
  status: "open" | "acknowledged";
  machine_id?: number | null;
  machine_name?: string | null;
  plan_id?: number | null;
  batch_id?: string | null;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
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
  source_plan_id?: number | null;
  created_at?: string | null;
  status: "open" | "in_progress" | "done" | "overdue" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
};

export type FailureLog = {
  id: number;
  machine_id: number;
  machine_name: string;
  occurred_at: string;
  severity: "low" | "medium" | "high" | "critical";
  downtime_hours: number;
  repair_cost: number;
  root_cause: string;
  notes: string;
  response_started_at?: string | null;
  resolved_at?: string | null;
  sla_response_target_hours: number;
  sla_resolution_target_hours: number;
  sla_status: "open" | "at_risk" | "breached" | "met";
};

export type FailureLogSlaSummary = {
  open_alerts: number;
  at_risk: number;
  breached: number;
  met: number;
};

export type MachineDowntimeStat = {
  machine_id: number;
  machine_name: string;
  failure_count: number;
  downtime_hours: number;
  repair_cost: number;
};

export type LineDowntimeStat = {
  line_name: string;
  failure_count: number;
  downtime_hours: number;
};

export type ReliabilityReport = {
  start_date: string;
  end_date: string;
  period_days: number;
  failure_count: number;
  total_downtime_hours: number;
  total_repair_cost: number;
  mtbf_hours: number;
  mttr_hours: number;
  downtime_by_machine: MachineDowntimeStat[];
  downtime_by_line: LineDowntimeStat[];
};

export type AutoGenerateWorkOrdersResult = {
  generated: number;
  skipped_existing: number;
  scanned_plans: number;
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
    | "master_import"
    | "failure_log"
    | "alert";
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
