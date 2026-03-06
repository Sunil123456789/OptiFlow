import type {
  AutoGenerateWorkOrdersResult,
  AuditLog,
  AuthUser,
  DashboardSummary,
  Department,
  FailureLog,
  RollbackResult,
  KpiTrendPoint,
  Line,
  Machine,
  ImportHistoryItem,
  MasterImportResult,
  MaintenancePlan,
  PaginatedResponse,
  PlantIntegrityReport,
  RoleDefinition,
  RolePermissions,
  Station,
  UserRecord,
  WorkOrder,
} from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const TOKEN_KEY = "optiflow_access_token";

type LoginResponse = {
  access_token: string;
  token_type: string;
  user: AuthUser;
};

type MachineListOptions = {
  q?: string;
  sortBy?: "machine_code" | "name" | "criticality" | "status";
  sortDir?: "asc" | "desc";
};

type PlanListOptions = {
  q?: string;
  typeFilter?: "all" | "calendar" | "runtime";
  sortBy?: "plan_code" | "title" | "next_due" | "machine_name";
  sortDir?: "asc" | "desc";
};

type WorkOrderListOptions = {
  q?: string;
  statusFilter?: "all" | "open" | "in_progress" | "done" | "overdue" | "cancelled";
  priorityFilter?: "all" | "low" | "medium" | "high" | "critical";
  sortBy?: "work_order_code" | "machine_name" | "status" | "priority";
  sortDir?: "asc" | "desc";
};

type AuditLogListOptions = {
  q?: string;
  entityType?: "all" | "user" | "role" | "machine" | "plan" | "work_order" | "department" | "line" | "station" | "master_import" | "failure_log";
  actionFilter?: "all" | "create" | "update" | "delete";
  startDate?: string;
  endDate?: string;
  sortBy?: "event_at" | "actor_email" | "entity_type" | "action";
  sortDir?: "asc" | "desc";
};

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
    }),
  });

  if (!response.ok) {
    throw new Error("Invalid credentials");
  }

  const payload = (await response.json()) as LoginResponse;
  localStorage.setItem(TOKEN_KEY, payload.access_token);
  return payload.user;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function fetchAuthed<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: await authHeaders(),
  });

  if (response.status === 401) {
    clearSession();
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload?.detail) {
        detail = payload.detail;
      }
    } catch {
      // Keep fallback detail when response body is not JSON.
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

async function postAuthed<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    clearSession();
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (errorPayload?.detail) {
        detail = errorPayload.detail;
      }
    } catch {
      // Keep fallback detail when response body is not JSON.
    }
    throw new Error(detail);
  }

  return (await response.json()) as TResponse;
}

async function patchAuthed<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    clearSession();
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (errorPayload?.detail) {
        detail = errorPayload.detail;
      }
    } catch {
      // Keep fallback detail when response body is not JSON.
    }
    throw new Error(detail);
  }

  return (await response.json()) as TResponse;
}

async function deleteAuthed(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });

  if (response.status === 401) {
    clearSession();
    throw new Error("Session expired. Please login again.");
  }

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const errorPayload = (await response.json()) as { detail?: string };
      if (errorPayload?.detail) {
        detail = errorPayload.detail;
      }
    } catch {
      // Keep fallback detail when response body is not JSON.
    }
    throw new Error(detail);
  }
}

export async function fetchMe(): Promise<AuthUser> {
  return fetchAuthed<AuthUser>("/auth/me");
}

export async function fetchUsers(): Promise<UserRecord[]> {
  return fetchAuthed<UserRecord[]>("/users");
}

export async function fetchRoles(): Promise<RoleDefinition[]> {
  return fetchAuthed<RoleDefinition[]>("/roles");
}

export async function createRole(payload: { name: string; is_active?: boolean; permissions: RolePermissions }): Promise<RoleDefinition> {
  return postAuthed<RoleDefinition, typeof payload>("/roles", payload);
}

export async function updateRole(
  roleName: string,
  payload: Partial<{ permissions: RolePermissions; is_active: boolean }>
): Promise<RoleDefinition> {
  return patchAuthed<RoleDefinition, typeof payload>(`/roles/${encodeURIComponent(roleName)}`, payload);
}

export async function deleteRole(roleName: string): Promise<void> {
  return deleteAuthed(`/roles/${encodeURIComponent(roleName)}`);
}

export async function createUser(payload: {
  full_name: string;
  email: string;
  password: string;
  role: string;
  is_active: boolean;
}): Promise<UserRecord> {
  return postAuthed<UserRecord, typeof payload>("/users", payload);
}

export async function updateUser(
  userId: number,
  payload: Partial<{
    full_name: string;
    email: string;
    password: string;
    role: string;
    is_active: boolean;
  }>
): Promise<UserRecord> {
  return patchAuthed<UserRecord, typeof payload>(`/users/${userId}`, payload);
}

export async function deleteUser(userId: number): Promise<void> {
  return deleteAuthed(`/users/${userId}`);
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return fetchAuthed<DashboardSummary>("/dashboard/summary");
}

export async function fetchKpiTrends(days = 14): Promise<KpiTrendPoint[]> {
  const params = new URLSearchParams({ days: String(days) });
  return fetchAuthed<KpiTrendPoint[]>(`/dashboard/kpi-trends?${params.toString()}`);
}

export async function fetchAuditLogsWithOptions(
  page = 1,
  pageSize = 10,
  options: AuditLogListOptions
): Promise<PaginatedResponse<AuditLog>> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    q: options.q ?? "",
    entity_type: options.entityType ?? "all",
    action_filter: options.actionFilter ?? "all",
    start_date: options.startDate ?? "",
    end_date: options.endDate ?? "",
    sort_by: options.sortBy ?? "event_at",
    sort_dir: options.sortDir ?? "desc",
  });
  return fetchAuthed<PaginatedResponse<AuditLog>>(`/audit-logs?${params.toString()}`);
}

export async function exportAuditLogs(options: AuditLogListOptions): Promise<AuditLog[]> {
  const params = new URLSearchParams({
    q: options.q ?? "",
    entity_type: options.entityType ?? "all",
    action_filter: options.actionFilter ?? "all",
    start_date: options.startDate ?? "",
    end_date: options.endDate ?? "",
    sort_by: options.sortBy ?? "event_at",
    sort_dir: options.sortDir ?? "desc",
  });
  return fetchAuthed<AuditLog[]>(`/audit-logs/export?${params.toString()}`);
}

export async function fetchMachines(page = 1, pageSize = 10): Promise<PaginatedResponse<Machine>> {
  return fetchMachinesWithOptions(page, pageSize, {});
}

export async function fetchMachinesWithOptions(
  page = 1,
  pageSize = 10,
  options: MachineListOptions
): Promise<PaginatedResponse<Machine>> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    q: options.q ?? "",
    sort_by: options.sortBy ?? "machine_code",
    sort_dir: options.sortDir ?? "asc",
  });
  return fetchAuthed<PaginatedResponse<Machine>>(`/machines?${params.toString()}`);
}

export async function exportMachines(options: MachineListOptions): Promise<Machine[]> {
  const params = new URLSearchParams({
    q: options.q ?? "",
    sort_by: options.sortBy ?? "machine_code",
    sort_dir: options.sortDir ?? "asc",
  });
  return fetchAuthed<Machine[]>(`/machines/export?${params.toString()}`);
}

export async function fetchWorkOrders(page = 1, pageSize = 10): Promise<PaginatedResponse<WorkOrder>> {
  return fetchWorkOrdersWithOptions(page, pageSize, {});
}

export async function fetchWorkOrdersWithOptions(
  page = 1,
  pageSize = 10,
  options: WorkOrderListOptions
): Promise<PaginatedResponse<WorkOrder>> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    q: options.q ?? "",
    status_filter: options.statusFilter ?? "all",
    priority_filter: options.priorityFilter ?? "all",
    sort_by: options.sortBy ?? "work_order_code",
    sort_dir: options.sortDir ?? "asc",
  });
  return fetchAuthed<PaginatedResponse<WorkOrder>>(`/work-orders?${params.toString()}`);
}

export async function exportWorkOrders(options: WorkOrderListOptions): Promise<WorkOrder[]> {
  const params = new URLSearchParams({
    q: options.q ?? "",
    status_filter: options.statusFilter ?? "all",
    priority_filter: options.priorityFilter ?? "all",
    sort_by: options.sortBy ?? "work_order_code",
    sort_dir: options.sortDir ?? "asc",
  });
  return fetchAuthed<WorkOrder[]>(`/work-orders/export?${params.toString()}`);
}

export async function fetchMaintenancePlans(page = 1, pageSize = 10): Promise<PaginatedResponse<MaintenancePlan>> {
  return fetchMaintenancePlansWithOptions(page, pageSize, {});
}

export async function fetchMaintenancePlansWithOptions(
  page = 1,
  pageSize = 10,
  options: PlanListOptions
): Promise<PaginatedResponse<MaintenancePlan>> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    q: options.q ?? "",
    plan_type: options.typeFilter ?? "all",
    sort_by: options.sortBy ?? "plan_code",
    sort_dir: options.sortDir ?? "asc",
  });
  return fetchAuthed<PaginatedResponse<MaintenancePlan>>(`/maintenance-plans?${params.toString()}`);
}

export async function exportMaintenancePlans(options: PlanListOptions): Promise<MaintenancePlan[]> {
  const params = new URLSearchParams({
    q: options.q ?? "",
    plan_type: options.typeFilter ?? "all",
    sort_by: options.sortBy ?? "plan_code",
    sort_dir: options.sortDir ?? "asc",
  });
  return fetchAuthed<MaintenancePlan[]>(`/maintenance-plans/export?${params.toString()}`);
}

export async function createMachine(payload: {
  machine_code: string;
  name: string;
  criticality: "low" | "medium" | "high" | "critical";
  status: "active" | "inactive" | "retired";
}): Promise<Machine> {
  return postAuthed<Machine, typeof payload>("/machines", payload);
}

export async function updateMachine(
  machineId: number,
  payload: Partial<{
    machine_code: string;
    name: string;
    criticality: "low" | "medium" | "high" | "critical";
    status: "active" | "inactive" | "retired";
  }>
): Promise<Machine> {
  return patchAuthed<Machine, typeof payload>(`/machines/${machineId}`, payload);
}

export async function deleteMachine(machineId: number): Promise<void> {
  return deleteAuthed(`/machines/${machineId}`);
}

export async function createMaintenancePlan(payload: {
  plan_code: string;
  machine_id: number;
  title: string;
  plan_type: "calendar" | "runtime";
  next_due: string;
  is_active: boolean;
}): Promise<MaintenancePlan> {
  return postAuthed<MaintenancePlan, typeof payload>("/maintenance-plans", payload);
}

export async function updateMaintenancePlan(
  planId: number,
  payload: Partial<{
    plan_code: string;
    machine_id: number;
    title: string;
    plan_type: "calendar" | "runtime";
    next_due: string;
    is_active: boolean;
  }>
): Promise<MaintenancePlan> {
  return patchAuthed<MaintenancePlan, typeof payload>(`/maintenance-plans/${planId}`, payload);
}

export async function deleteMaintenancePlan(planId: number): Promise<void> {
  return deleteAuthed(`/maintenance-plans/${planId}`);
}

export async function createWorkOrder(payload: {
  work_order_code: string;
  machine_id: number;
  status: "open" | "in_progress" | "done" | "overdue" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
}): Promise<WorkOrder> {
  return postAuthed<WorkOrder, typeof payload>("/work-orders", payload);
}

export async function updateWorkOrder(
  workOrderId: number,
  payload: Partial<{
    work_order_code: string;
    machine_id: number;
    status: "open" | "in_progress" | "done" | "overdue" | "cancelled";
    priority: "low" | "medium" | "high" | "critical";
  }>
): Promise<WorkOrder> {
  return patchAuthed<WorkOrder, typeof payload>(`/work-orders/${workOrderId}`, payload);
}

export async function deleteWorkOrder(workOrderId: number): Promise<void> {
  return deleteAuthed(`/work-orders/${workOrderId}`);
}

export async function autoGenerateWorkOrders(): Promise<AutoGenerateWorkOrdersResult> {
  return postAuthed<AutoGenerateWorkOrdersResult, Record<string, never>>("/work-orders/auto-generate", {});
}

export async function fetchFailureLogs(): Promise<FailureLog[]> {
  return fetchAuthed<FailureLog[]>("/failure-logs");
}

export async function createFailureLog(payload: {
  machine_id: number;
  occurred_at: string;
  downtime_hours: number;
  repair_cost: number;
  root_cause: string;
  notes?: string;
}): Promise<FailureLog> {
  return postAuthed<FailureLog, typeof payload>("/failure-logs", payload);
}

export async function deleteFailureLog(failureLogId: number): Promise<void> {
  return deleteAuthed(`/failure-logs/${failureLogId}`);
}

export async function fetchDepartments(): Promise<Department[]> {
  return fetchAuthed<Department[]>("/departments");
}

export async function createDepartment(payload: { code: string; name: string; is_active: boolean }): Promise<Department> {
  return postAuthed<Department, typeof payload>("/departments", payload);
}

export async function deleteDepartment(code: string): Promise<void> {
  return deleteAuthed(`/departments/${encodeURIComponent(code)}`);
}

export async function fetchLines(): Promise<Line[]> {
  return fetchAuthed<Line[]>("/lines");
}

export async function createLine(payload: {
  code: string;
  name: string;
  department_code: string;
  is_active: boolean;
}): Promise<Line> {
  return postAuthed<Line, typeof payload>("/lines", payload);
}

export async function deleteLine(code: string): Promise<void> {
  return deleteAuthed(`/lines/${encodeURIComponent(code)}`);
}

export async function fetchStations(): Promise<Station[]> {
  return fetchAuthed<Station[]>("/stations");
}

export async function createStation(payload: {
  code: string;
  name: string;
  line_code: string;
  is_active: boolean;
}): Promise<Station> {
  return postAuthed<Station, typeof payload>("/stations", payload);
}

export async function deleteStation(code: string): Promise<void> {
  return deleteAuthed(`/stations/${encodeURIComponent(code)}`);
}

export async function importMasterDataCsv(csvText: string): Promise<MasterImportResult> {
  return postAuthed<
    MasterImportResult,
    { csv_text: string; dry_run: boolean; source_file_name?: string }
  >("/master-data/import-csv", { csv_text: csvText, dry_run: false });
}

export async function validateMasterDataCsv(csvText: string, sourceFileName?: string): Promise<MasterImportResult> {
  return postAuthed<
    MasterImportResult,
    { csv_text: string; dry_run: boolean; source_file_name?: string }
  >("/master-data/import-csv", { csv_text: csvText, dry_run: true, source_file_name: sourceFileName ?? "" });
}

export async function fetchImportHistory(): Promise<ImportHistoryItem[]> {
  return fetchAuthed<ImportHistoryItem[]>("/master-data/import-history");
}

export async function rollbackImportBatch(batchId: string): Promise<RollbackResult> {
  return postAuthed<RollbackResult, Record<string, never>>(`/master-data/import-history/${encodeURIComponent(batchId)}/rollback`, {});
}

export async function fetchPlantIntegrityChecks(): Promise<PlantIntegrityReport> {
  return fetchAuthed<PlantIntegrityReport>("/plant-mapping/integrity-checks");
}

