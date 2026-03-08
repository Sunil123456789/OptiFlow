from datetime import datetime, timedelta, timezone
import csv
import json
import logging
from logging.handlers import RotatingFileHandler
from math import ceil
from io import StringIO
from typing import Literal
from urllib import error as urllib_error
from urllib import request as urllib_request

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from jose import JWTError, jwt
from redis import Redis
from fastapi.security import OAuth2PasswordBearer

from app.api.routers import (
    build_assets_router,
    build_admin_router,
    build_auth_router,
    build_dashboard_router,
    build_incidents_router,
    build_maintenance_router,
    build_master_data_router,
    build_plant_mapping_router,
    build_reports_router,
    build_system_router,
)
from app.config import settings
from app.alert_deliveries_store import AlertDeliveriesStore
from app.alert_delivery_settings_store import AlertDeliverySettingsStore
from app.alerts_store import AlertsStore
from app.audit_store import AuditStore
from app.database import db_healthcheck
from app.departments_store import DepartmentsStore
from app.failure_logs_store import FailureLogsStore
from app.lines_store import LinesStore
from app.machines_store import MachinesStore
from app.plans_store import PlansStore
from app.roles_store import RolesStore
from app.spare_parts_store import SparePartsStore
from app.stations_store import StationsStore
from app.import_history_store import ImportHistoryStore
from app.users_store import UsersStore
from app.work_order_parts_store import WorkOrderPartsStore
from app.work_orders_store import WorkOrdersStore

app = FastAPI(title="OptiFlow API", version="0.1.0")
machines_store = MachinesStore()
plans_store = PlansStore()
users_store = UsersStore()
roles_store = RolesStore()
work_orders_store = WorkOrdersStore()
work_order_parts_store = WorkOrderPartsStore()
audit_store = AuditStore()
departments_store = DepartmentsStore()
lines_store = LinesStore()
stations_store = StationsStore()
spare_parts_store = SparePartsStore()
import_history_store = ImportHistoryStore()
failure_logs_store = FailureLogsStore()
alerts_store = AlertsStore()
alert_deliveries_store = AlertDeliveriesStore()
alert_delivery_settings_store = AlertDeliverySettingsStore()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
logger = logging.getLogger("optiflow.api")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)
    file_handler = RotatingFileHandler("optiflow-api.log", maxBytes=1_000_000, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(file_handler)


class MachineBase(BaseModel):
    machine_code: str = Field(min_length=3, max_length=80)
    name: str = Field(min_length=2, max_length=150)
    criticality: Literal["low", "medium", "high", "critical"]
    status: Literal["active", "inactive", "retired"]


class MachineCreate(MachineBase):
    pass


class MachineUpdate(BaseModel):
    machine_code: str | None = Field(default=None, min_length=3, max_length=80)
    name: str | None = Field(default=None, min_length=2, max_length=150)
    criticality: Literal["low", "medium", "high", "critical"] | None = None
    status: Literal["active", "inactive", "retired"] | None = None


class Machine(MachineBase):
    id: int


class SparePartBase(BaseModel):
    part_code: str = Field(min_length=3, max_length=80)
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=80)
    stock_qty: int = Field(ge=0)
    reorder_level: int = Field(ge=0)
    unit_cost: float = Field(ge=0)
    is_active: bool = True


class SparePartCreate(SparePartBase):
    pass


class SparePartUpdate(BaseModel):
    part_code: str | None = Field(default=None, min_length=3, max_length=80)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    category: str | None = Field(default=None, min_length=2, max_length=80)
    stock_qty: int | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)
    unit_cost: float | None = Field(default=None, ge=0)
    is_active: bool | None = None


class SparePart(SparePartBase):
    id: int


class WorkOrderBase(BaseModel):
    work_order_code: str = Field(min_length=4, max_length=40)
    machine_id: int = Field(gt=0)
    status: Literal["open", "in_progress", "done", "overdue", "cancelled"]
    priority: Literal["low", "medium", "high", "critical"]


class WorkOrderCreate(WorkOrderBase):
    pass


class WorkOrderUpdate(BaseModel):
    work_order_code: str | None = Field(default=None, min_length=4, max_length=40)
    machine_id: int | None = Field(default=None, gt=0)
    status: Literal["open", "in_progress", "done", "overdue", "cancelled"] | None = None
    priority: Literal["low", "medium", "high", "critical"] | None = None


class WorkOrder(WorkOrderBase):
    id: int
    machine_name: str
    created_at: str | None = None
    source_plan_id: int | None = None


class WorkOrderPartConsumptionCreate(BaseModel):
    part_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    notes: str = Field(default="", max_length=300)


class WorkOrderPartConsumption(BaseModel):
    id: int
    work_order_id: int
    part_id: int
    part_code: str
    part_name: str
    quantity: int
    unit_cost: float
    total_cost: float
    consumed_at: str
    consumed_by: str
    notes: str


class FailureLogBase(BaseModel):
    machine_id: int = Field(gt=0)
    occurred_at: str = Field(min_length=10, max_length=40)
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    downtime_hours: float = Field(gt=0)
    repair_cost: float = Field(ge=0)
    root_cause: str = Field(min_length=3, max_length=200)
    notes: str = Field(default="", max_length=500)


class FailureLogCreate(FailureLogBase):
    pass


class FailureLog(FailureLogBase):
    id: int
    machine_name: str
    response_started_at: str | None = None
    resolved_at: str | None = None
    sla_response_target_hours: int
    sla_resolution_target_hours: int
    sla_status: Literal["open", "at_risk", "breached", "met"]


class FailureLogSlaUpdate(BaseModel):
    severity: Literal["low", "medium", "high", "critical"] | None = None
    response_started_at: str | None = None
    resolved_at: str | None = None


class FailureLogSlaSummary(BaseModel):
    open_alerts: int
    at_risk: int
    breached: int
    met: int


class MachineDowntimeStat(BaseModel):
    machine_id: int
    machine_name: str
    failure_count: int
    downtime_hours: float
    repair_cost: float


class LineDowntimeStat(BaseModel):
    line_name: str
    failure_count: int
    downtime_hours: float


class ReliabilityReport(BaseModel):
    start_date: str
    end_date: str
    period_days: int
    failure_count: int
    total_downtime_hours: float
    total_repair_cost: float
    mtbf_hours: float
    mttr_hours: float
    downtime_by_machine: list[MachineDowntimeStat]
    downtime_by_line: list[LineDowntimeStat]


class KpiTrendPoint(BaseModel):
    day: str
    failures: int
    downtime_hours: float
    repair_cost: float


class AlertItem(BaseModel):
    id: str
    rule_type: Literal["repeat_failure", "overdue_plan", "import_issue", "low_stock"]
    severity: Literal["low", "medium", "high", "critical"]
    title: str
    description: str
    triggered_at: str
    status: Literal["open", "acknowledged"]
    machine_id: int | None = None
    machine_name: str | None = None
    plan_id: int | None = None
    batch_id: str | None = None
    acknowledged_at: str | None = None
    acknowledged_by: str | None = None


class AlertDeliveryAttempt(BaseModel):
    id: int
    alert_id: str
    channel: Literal["email", "webhook"]
    status: Literal["sent", "failed", "skipped"]
    attempt_no: int
    attempted_at: str
    target: str
    message: str
    response_code: int | None = None
    next_retry_at: str | None = None


class AlertDispatchResult(BaseModel):
    alert_id: str
    channel: Literal["email", "webhook"]
    status: Literal["sent", "failed", "skipped"]
    attempt_no: int
    message: str


class AlertDispatchSummary(BaseModel):
    requested: int
    sent: int
    failed: int
    skipped: int
    results: list[AlertDispatchResult]
    note: str | None = None


class AlertDispatchTickRequest(BaseModel):
    force: bool = False


class AlertDeliverySettings(BaseModel):
    email_enabled: bool
    email_to: str
    webhook_enabled: bool
    webhook_url: str
    webhook_timeout_seconds: int
    max_retries: int
    retry_backoff_seconds: int
    cooldown_seconds: int
    auto_dispatch_enabled: bool


class AlertDeliverySettingsUpdate(BaseModel):
    email_enabled: bool | None = None
    email_to: str | None = Field(default=None, max_length=300)
    webhook_enabled: bool | None = None
    webhook_url: str | None = Field(default=None, max_length=500)
    webhook_timeout_seconds: int | None = Field(default=None, ge=1, le=60)
    max_retries: int | None = Field(default=None, ge=1, le=10)
    retry_backoff_seconds: int | None = Field(default=None, ge=10, le=3600)
    cooldown_seconds: int | None = Field(default=None, ge=0, le=86400)
    auto_dispatch_enabled: bool | None = None


class AlertDeliveryStats(BaseModel):
    sent: int
    failed: int
    skipped: int
    window_hours: int


class AutoGenerateWorkOrdersResult(BaseModel):
    generated: int
    skipped_existing: int
    scanned_plans: int


class PlanBase(BaseModel):
    plan_code: str = Field(min_length=4, max_length=40)
    machine_id: int = Field(gt=0)
    title: str = Field(min_length=3, max_length=160)
    plan_type: Literal["calendar", "runtime"]
    next_due: str = Field(min_length=2, max_length=80)
    is_active: bool = True


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    plan_code: str | None = Field(default=None, min_length=4, max_length=40)
    machine_id: int | None = Field(default=None, gt=0)
    title: str | None = Field(default=None, min_length=3, max_length=160)
    plan_type: Literal["calendar", "runtime"] | None = None
    next_due: str | None = Field(default=None, min_length=2, max_length=80)
    is_active: bool | None = None


class Plan(PlanBase):
    id: int
    machine_name: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthUser(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    permissions: "RolePermissions"


class RolePermissions(BaseModel):
    can_manage_users: bool = False
    can_manage_assets: bool = False
    can_create_work_orders: bool = False
    can_update_work_orders: bool = False
    can_import_master_data: bool = False


class RoleDefinition(BaseModel):
    name: str
    is_system: bool
    is_active: bool
    permissions: RolePermissions


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    is_active: bool = True
    permissions: RolePermissions


class RoleUpdate(BaseModel):
    permissions: RolePermissions | None = None
    is_active: bool | None = None


class UserAdminView(AuthUser):
    is_active: bool


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=120)
    role: str = Field(min_length=2, max_length=60)
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: str | None = Field(default=None, min_length=5, max_length=160)
    password: str | None = Field(default=None, min_length=6, max_length=120)
    role: str | None = Field(default=None, min_length=2, max_length=60)
    is_active: bool | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: AuthUser


class PaginationMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class MachinesListResponse(BaseModel):
    items: list[Machine]
    pagination: PaginationMeta


class SparePartsListResponse(BaseModel):
    items: list[SparePart]
    pagination: PaginationMeta


class PlansListResponse(BaseModel):
    items: list[Plan]
    pagination: PaginationMeta


class WorkOrdersListResponse(BaseModel):
    items: list[WorkOrder]
    pagination: PaginationMeta


class AuditEvent(BaseModel):
    id: int
    event_at: str
    actor_user_id: int
    actor_email: str
    actor_role: str
    entity_type: str
    entity_id: str
    action: str
    summary: str


class AuditListResponse(BaseModel):
    items: list[AuditEvent]
    pagination: PaginationMeta


class DepartmentBase(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class Department(DepartmentBase):
    id: int


class LineBase(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    department_code: str = Field(min_length=2, max_length=30)
    is_active: bool = True


class LineCreate(LineBase):
    pass


class Line(LineBase):
    id: int


class StationBase(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    line_code: str = Field(min_length=2, max_length=30)
    is_active: bool = True


class StationCreate(StationBase):
    pass


class Station(StationBase):
    id: int


class MasterImportCsvPayload(BaseModel):
    csv_text: str = Field(min_length=20)
    dry_run: bool = False
    source_file_name: str = Field(default="", max_length=200)


class MasterImportResult(BaseModel):
    batch_id: str
    dry_run: bool
    departments_created: int
    departments_updated: int
    lines_created: int
    lines_updated: int
    stations_created: int
    stations_updated: int
    skipped_rows: int


class ImportHistoryItem(BaseModel):
    batch_id: str
    created_at: str
    actor_email: str
    source_file_name: str
    dry_run: bool
    rollback_applied: bool
    summary: dict[str, int | str | bool]


class RollbackResult(BaseModel):
    batch_id: str
    rolled_back_changes: int


class PlantIntegrityReport(BaseModel):
    orphan_lines: int
    orphan_stations: int
    duplicate_department_codes: int
    duplicate_line_codes: int
    duplicate_station_codes: int
    inactive_department_lines: int
    inactive_line_stations: int

allowed_origins = [origin.strip() for origin in settings.cors_allow_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    started = datetime.now(timezone.utc)
    response = await call_next(request)
    elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
    logger.info("%s %s -> %s (%sms)", request.method, request.url.path, response.status_code, elapsed_ms)
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error at %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


def redis_healthcheck() -> bool:
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    return bool(client.ping())


def create_access_token(subject: str) -> str:
    expires_delta = timedelta(minutes=settings.access_token_expire_minutes)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict[str, object]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        email = payload.get("sub")
        if not isinstance(email, str):
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = users_store.get_by_email(email)
    if user is None or not user.get("is_active", False):
        raise credentials_exception

    return user


def get_permissions_for_role(role_name: str) -> RolePermissions:
    role = roles_store.get(role_name)
    if role is None:
        return RolePermissions()
    if not bool(role.get("is_active", True)):
        return RolePermissions()

    permissions = role.get("permissions", {})
    return RolePermissions(
        can_manage_users=bool(permissions.get("can_manage_users", False)),
        can_manage_assets=bool(permissions.get("can_manage_assets", False)),
        can_create_work_orders=bool(permissions.get("can_create_work_orders", False)),
        can_update_work_orders=bool(permissions.get("can_update_work_orders", False)),
        can_import_master_data=bool(permissions.get("can_import_master_data", False)),
    )


def auth_user_from_row(user: dict[str, object]) -> AuthUser:
    role = str(user["role"])
    return AuthUser(
        id=int(user["id"]),
        full_name=str(user["full_name"]),
        email=str(user["email"]),
        role=role,
        permissions=get_permissions_for_role(role),
    )


def require_permission(permission_name: Literal["can_manage_users", "can_manage_assets", "can_create_work_orders", "can_update_work_orders", "can_import_master_data"]):
    def _permission_guard(current_user: dict[str, object] = Depends(get_current_user)) -> dict[str, object]:
        role = str(current_user.get("role", ""))
        permissions = get_permissions_for_role(role)
        if not bool(getattr(permissions, permission_name, False)):
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user

    return _permission_guard


@app.get("/api/v1/audit-logs", response_model=AuditListResponse)
def list_audit_logs(
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    q: str = Query(default=""),
    entity_type: Literal["all", "user", "role", "machine", "plan", "work_order", "department", "line", "station", "master_import", "failure_log", "alert", "spare_part"] = Query(default="all"),
    action_filter: Literal["all", "create", "update", "delete"] = Query(default="all"),
    start_date: str = Query(default=""),
    end_date: str = Query(default=""),
    sort_by: Literal["event_at", "actor_email", "entity_type", "action"] = Query(default="event_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
) -> AuditListResponse:
    start_at = _parse_date_param(start_date, is_end=False)
    end_at = _parse_date_param(end_date, is_end=True)
    all_items = _filter_sort_audit_events(q, entity_type, action_filter, start_at, end_at, sort_by, sort_dir)
    paged, meta = paginate_items(all_items, page, page_size)
    return AuditListResponse(items=[AuditEvent(**event) for event in paged], pagination=meta)


@app.get("/api/v1/audit-logs/export", response_model=list[AuditEvent])
def export_audit_logs(
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    q: str = Query(default=""),
    entity_type: Literal["all", "user", "role", "machine", "plan", "work_order", "department", "line", "station", "master_import", "failure_log", "alert", "spare_part"] = Query(default="all"),
    action_filter: Literal["all", "create", "update", "delete"] = Query(default="all"),
    start_date: str = Query(default=""),
    end_date: str = Query(default=""),
    sort_by: Literal["event_at", "actor_email", "entity_type", "action"] = Query(default="event_at"),
    sort_dir: Literal["asc", "desc"] = Query(default="desc"),
) -> list[AuditEvent]:
    start_at = _parse_date_param(start_date, is_end=False)
    end_at = _parse_date_param(end_date, is_end=True)
    all_items = _filter_sort_audit_events(q, entity_type, action_filter, start_at, end_at, sort_by, sort_dir)
    return [AuditEvent(**event) for event in all_items]


def _work_order_with_machine_name(work_order: dict[str, object]) -> WorkOrder:
    machine = machines_store.get(int(work_order["machine_id"]))
    machine_name = machine["name"] if machine else "Unknown Machine"
    return WorkOrder(**work_order, machine_name=machine_name)


def _failure_log_with_machine_name(failure_log: dict[str, object]) -> FailureLog:
    machine = machines_store.get(int(failure_log["machine_id"]))
    machine_name = machine["name"] if machine else "Unknown Machine"
    severity = str(failure_log.get("severity", "medium")).lower()
    if severity not in {"low", "medium", "high", "critical"}:
        severity = "medium"

    response_target, resolution_target = _sla_targets_by_severity(severity)
    sla_status = _compute_failure_log_sla_status(
        occurred_at=str(failure_log.get("occurred_at", "")),
        response_started_at=str(failure_log.get("response_started_at", "")) if failure_log.get("response_started_at") else None,
        resolved_at=str(failure_log.get("resolved_at", "")) if failure_log.get("resolved_at") else None,
        response_target_hours=response_target,
        resolution_target_hours=resolution_target,
    )

    return FailureLog(
        **failure_log,
        severity=severity,
        machine_name=machine_name,
        response_started_at=str(failure_log.get("response_started_at")) if failure_log.get("response_started_at") else None,
        resolved_at=str(failure_log.get("resolved_at")) if failure_log.get("resolved_at") else None,
        sla_response_target_hours=response_target,
        sla_resolution_target_hours=resolution_target,
        sla_status=sla_status,
    )


def _sla_targets_by_severity(severity: str) -> tuple[int, int]:
    targets = {
        "low": (24, 72),
        "medium": (8, 24),
        "high": (4, 12),
        "critical": (1, 4),
    }
    return targets.get(severity, targets["medium"])


def _compute_failure_log_sla_status(
    occurred_at: str,
    response_started_at: str | None,
    resolved_at: str | None,
    response_target_hours: int,
    resolution_target_hours: int,
) -> Literal["open", "at_risk", "breached", "met"]:
    occurred = _safe_parse_datetime(occurred_at)
    response_deadline = occurred + timedelta(hours=response_target_hours)
    resolution_deadline = occurred + timedelta(hours=resolution_target_hours)
    now = datetime.now(timezone.utc)

    response_time = _safe_parse_datetime(response_started_at) if response_started_at else None
    resolved_time = _safe_parse_datetime(resolved_at) if resolved_at else None

    response_breached = response_time is None and now > response_deadline
    if response_time is not None and response_time > response_deadline:
        response_breached = True

    resolution_breached = resolved_time is None and now > resolution_deadline
    if resolved_time is not None and resolved_time > resolution_deadline:
        resolution_breached = True

    if response_breached or resolution_breached:
        return "breached"

    if resolved_time is not None:
        return "met"

    if now >= (resolution_deadline - timedelta(hours=2)):
        return "at_risk"

    return "open"


def _line_bucket_for_machine(machine: dict[str, object] | None) -> str:
    if machine is None:
        return "Unknown"
    machine_code = str(machine.get("machine_code", ""))
    parts = machine_code.split("-")
    if len(parts) >= 2 and parts[1].strip():
        return parts[1].strip().upper()
    return "UNASSIGNED"


def _build_reliability_report(start_at: datetime, end_at: datetime) -> ReliabilityReport:
    failures = [
        item
        for item in failure_logs_store.list()
        if start_at <= _safe_parse_datetime(str(item.get("occurred_at", ""))) <= end_at
    ]
    failures.sort(key=lambda item: _safe_parse_datetime(str(item.get("occurred_at", ""))))

    total_downtime = round(sum(float(item.get("downtime_hours", 0)) for item in failures), 2)
    total_repair_cost = round(sum(float(item.get("repair_cost", 0)) for item in failures), 2)

    period_hours = max(1.0, (end_at - start_at).total_seconds() / 3600)
    failure_count = len(failures)
    mtbf_hours = round(period_hours / failure_count, 2) if failure_count > 0 else round(period_hours, 2)
    mttr_hours = round(total_downtime / failure_count, 2) if failure_count > 0 else 0.0

    machine_stats: dict[int, dict[str, object]] = {}
    line_stats: dict[str, dict[str, object]] = {}
    for item in failures:
        machine_id = int(item.get("machine_id", 0))
        machine = machines_store.get(machine_id)
        machine_name = str(machine.get("name", "Unknown Machine")) if machine else "Unknown Machine"
        line_name = _line_bucket_for_machine(machine)

        row = machine_stats.setdefault(
            machine_id,
            {
                "machine_id": machine_id,
                "machine_name": machine_name,
                "failure_count": 0,
                "downtime_hours": 0.0,
                "repair_cost": 0.0,
            },
        )
        row["failure_count"] = int(row["failure_count"]) + 1
        row["downtime_hours"] = float(row["downtime_hours"]) + float(item.get("downtime_hours", 0))
        row["repair_cost"] = float(row["repair_cost"]) + float(item.get("repair_cost", 0))

        line_row = line_stats.setdefault(
            line_name,
            {"line_name": line_name, "failure_count": 0, "downtime_hours": 0.0},
        )
        line_row["failure_count"] = int(line_row["failure_count"]) + 1
        line_row["downtime_hours"] = float(line_row["downtime_hours"]) + float(item.get("downtime_hours", 0))

    downtime_by_machine = [
        MachineDowntimeStat(
            machine_id=int(row["machine_id"]),
            machine_name=str(row["machine_name"]),
            failure_count=int(row["failure_count"]),
            downtime_hours=round(float(row["downtime_hours"]), 2),
            repair_cost=round(float(row["repair_cost"]), 2),
        )
        for row in sorted(machine_stats.values(), key=lambda item: float(item["downtime_hours"]), reverse=True)
    ]
    downtime_by_line = [
        LineDowntimeStat(
            line_name=str(row["line_name"]),
            failure_count=int(row["failure_count"]),
            downtime_hours=round(float(row["downtime_hours"]), 2),
        )
        for row in sorted(line_stats.values(), key=lambda item: float(item["downtime_hours"]), reverse=True)
    ]

    return ReliabilityReport(
        start_date=start_at.date().isoformat(),
        end_date=end_at.date().isoformat(),
        period_days=max(1, (end_at.date() - start_at.date()).days + 1),
        failure_count=failure_count,
        total_downtime_hours=total_downtime,
        total_repair_cost=total_repair_cost,
        mtbf_hours=mtbf_hours,
        mttr_hours=mttr_hours,
        downtime_by_machine=downtime_by_machine,
        downtime_by_line=downtime_by_line,
    )


def _safe_parse_datetime(raw: str) -> datetime:
    normalized = raw.strip()
    if not normalized:
        return datetime.now(timezone.utc)
    try:
        return _parse_iso_datetime(normalized)
    except ValueError:
        return datetime.now(timezone.utc)


def _plan_due_soon(next_due: str) -> bool:
    normalized = next_due.strip().lower()
    if not normalized:
        return False
    if "today" in normalized or "tomorrow" in normalized or "overdue" in normalized:
        return True
    if normalized.startswith("in ") and "day" in normalized:
        digits = "".join(ch for ch in normalized if ch.isdigit())
        if digits:
            return int(digits) <= 1
    return False


def _next_auto_work_order_code() -> str:
    base = datetime.now(timezone.utc).strftime("AUTO-%Y%m%d")
    existing_codes = {str(row.get("work_order_code", "")).upper() for row in work_orders_store.list()}
    index = 1
    while True:
        candidate = f"{base}-{index:03d}"
        if candidate.upper() not in existing_codes:
            return candidate
        index += 1


def _is_plan_overdue(next_due: str) -> bool:
    return "overdue" in next_due.strip().lower()


def _sort_alerts(items: list[dict[str, object]]) -> list[dict[str, object]]:
    severity_rank = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    return sorted(
        items,
        key=lambda item: (
            -severity_rank.get(str(item.get("severity", "low")), 1),
            _safe_parse_datetime(str(item.get("triggered_at", ""))),
        ),
        reverse=True,
    )


def _build_alert_candidates() -> list[dict[str, object]]:
    alerts: list[dict[str, object]] = []

    recent_cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    failures = [
        item
        for item in failure_logs_store.list()
        if _safe_parse_datetime(str(item.get("occurred_at", ""))) >= recent_cutoff
    ]
    failures_by_machine: dict[int, list[dict[str, object]]] = {}
    for item in failures:
        machine_id = int(item.get("machine_id", 0))
        if machine_id <= 0:
            continue
        failures_by_machine.setdefault(machine_id, []).append(item)

    for machine_id, machine_failures in failures_by_machine.items():
        if len(machine_failures) < 2:
            continue

        machine = machines_store.get(machine_id)
        machine_name = str(machine["name"]) if machine else "Unknown Machine"
        latest = max(machine_failures, key=lambda row: _safe_parse_datetime(str(row.get("occurred_at", ""))))
        latest_cause = str(latest.get("root_cause", "unknown cause"))

        alerts.append(
            {
                "id": f"repeat-failure-machine-{machine_id}",
                "rule_type": "repeat_failure",
                "severity": "high",
                "title": f"Repeated failures on {machine_name}",
                "description": f"{len(machine_failures)} failures in the last 7 days. Latest cause: {latest_cause}",
                "triggered_at": str(latest.get("occurred_at", datetime.now(timezone.utc).isoformat())),
                "machine_id": machine_id,
                "machine_name": machine_name,
                "plan_id": None,
                "batch_id": None,
            }
        )

    for plan in plans_store.list():
        if not bool(plan.get("is_active", True)):
            continue
        if not _is_plan_overdue(str(plan.get("next_due", ""))):
            continue

        machine = machines_store.get(int(plan.get("machine_id", 0)))
        machine_name = str(machine["name"]) if machine else "Unknown Machine"
        alerts.append(
            {
                "id": f"overdue-plan-{int(plan.get('id', 0))}",
                "rule_type": "overdue_plan",
                "severity": "medium",
                "title": f"Overdue maintenance plan: {plan.get('plan_code', 'Unknown')}",
                "description": f"Plan '{plan.get('title', '')}' is overdue for machine {machine_name}.",
                "triggered_at": datetime.now(timezone.utc).isoformat(),
                "machine_id": int(plan.get("machine_id", 0)),
                "machine_name": machine_name,
                "plan_id": int(plan.get("id", 0)),
                "batch_id": None,
            }
        )

    for batch in import_history_store.list():
        if bool(batch.get("dry_run", False)):
            continue
        summary = dict(batch.get("summary", {}))
        skipped_rows = int(summary.get("skipped_rows", 0))
        rollback_applied = bool(batch.get("rollback_applied", False))
        if skipped_rows <= 0 and not rollback_applied:
            continue

        batch_id = str(batch.get("batch_id", ""))
        alerts.append(
            {
                "id": f"import-issue-{batch_id}",
                "rule_type": "import_issue",
                "severity": "medium",
                "title": "Master data import needs attention",
                "description": f"Batch {batch_id} had {skipped_rows} skipped rows; rollback_applied={str(rollback_applied).lower()}.",
                "triggered_at": str(batch.get("created_at", datetime.now(timezone.utc).isoformat())),
                "machine_id": None,
                "machine_name": None,
                "plan_id": None,
                "batch_id": batch_id,
            }
        )

    for part in spare_parts_store.list():
        if not bool(part.get("is_active", True)):
            continue
        stock_qty = int(part.get("stock_qty", 0))
        reorder_level = int(part.get("reorder_level", 0))
        if stock_qty > reorder_level:
            continue

        part_id = int(part.get("id", 0))
        part_code = str(part.get("part_code", "UNKNOWN"))
        part_name = str(part.get("name", "Spare Part"))
        severity = "critical" if stock_qty == 0 else "high"
        alerts.append(
            {
                "id": f"low-stock-part-{part_id}",
                "rule_type": "low_stock",
                "severity": severity,
                "title": f"Low stock: {part_code}",
                "description": f"{part_name} is at {stock_qty} unit(s), reorder level is {reorder_level}.",
                "triggered_at": datetime.now(timezone.utc).isoformat(),
                "machine_id": None,
                "machine_name": None,
                "plan_id": None,
                "batch_id": None,
            }
        )

    return _sort_alerts(alerts)


def _decorate_alerts_with_state(alerts: list[dict[str, object]]) -> list[AlertItem]:
    state_by_id = {str(row.get("id", "")): row for row in alerts_store.list()}
    result: list[AlertItem] = []
    for alert in alerts:
        alert_id = str(alert["id"])
        state = state_by_id.get(alert_id)
        acknowledged = bool(state and state.get("acknowledged", False))
        result.append(
            AlertItem(
                id=alert_id,
                rule_type=str(alert["rule_type"]),
                severity=str(alert["severity"]),
                title=str(alert["title"]),
                description=str(alert["description"]),
                triggered_at=str(alert["triggered_at"]),
                status="acknowledged" if acknowledged else "open",
                machine_id=int(alert["machine_id"]) if alert.get("machine_id") is not None else None,
                machine_name=str(alert["machine_name"]) if alert.get("machine_name") else None,
                plan_id=int(alert["plan_id"]) if alert.get("plan_id") is not None else None,
                batch_id=str(alert["batch_id"]) if alert.get("batch_id") else None,
                acknowledged_at=str(state.get("acknowledged_at")) if state and state.get("acknowledged_at") else None,
                acknowledged_by=str(state.get("acknowledged_by")) if state and state.get("acknowledged_by") else None,
            )
        )
    return result


def _get_alert_delivery_settings() -> AlertDeliverySettings:
    persisted = alert_delivery_settings_store.get()
    return AlertDeliverySettings(
        email_enabled=bool(persisted.get("email_enabled", settings.alert_delivery_email_enabled)),
        email_to=str(persisted.get("email_to", settings.alert_delivery_email_to)).strip(),
        webhook_enabled=bool(persisted.get("webhook_enabled", settings.alert_delivery_webhook_enabled)),
        webhook_url=str(persisted.get("webhook_url", settings.alert_delivery_webhook_url)).strip(),
        webhook_timeout_seconds=max(1, int(persisted.get("webhook_timeout_seconds", settings.alert_delivery_webhook_timeout_seconds))),
        max_retries=max(1, int(persisted.get("max_retries", settings.alert_delivery_max_retries))),
        retry_backoff_seconds=max(10, int(persisted.get("retry_backoff_seconds", settings.alert_delivery_retry_backoff_seconds))),
        cooldown_seconds=max(0, int(persisted.get("cooldown_seconds", settings.alert_delivery_cooldown_seconds))),
        auto_dispatch_enabled=bool(persisted.get("auto_dispatch_enabled", settings.alert_delivery_auto_dispatch_enabled)),
    )


def _enabled_alert_channels(delivery_settings: AlertDeliverySettings) -> list[Literal["email", "webhook"]]:
    channels: list[Literal["email", "webhook"]] = []
    if delivery_settings.email_enabled:
        channels.append("email")
    if delivery_settings.webhook_enabled:
        channels.append("webhook")
    return channels


def _record_delivery_attempt(
    alert_id: str,
    channel: Literal["email", "webhook"],
    status: Literal["sent", "failed", "skipped"],
    attempt_no: int,
    target: str,
    message: str,
    response_code: int | None = None,
    next_retry_at: str | None = None,
) -> AlertDeliveryAttempt:
    created = alert_deliveries_store.create(
        {
            "alert_id": alert_id,
            "channel": channel,
            "status": status,
            "attempt_no": attempt_no,
            "target": target,
            "message": message,
            "response_code": response_code,
            "next_retry_at": next_retry_at,
        }
    )
    return AlertDeliveryAttempt(**created)


def _send_email_alert(alert: AlertItem, delivery_settings: AlertDeliverySettings) -> tuple[Literal["sent", "failed"], str, int | None]:
    recipient = delivery_settings.email_to.strip()
    if not recipient:
        return "failed", "Email recipient is not configured", None

    detail = f"Simulated email queued for {recipient}"
    return "sent", detail, 202


def _send_webhook_alert(
    alert: AlertItem,
    delivery_settings: AlertDeliverySettings,
) -> tuple[Literal["sent", "failed"], str, int | None]:
    webhook_url = delivery_settings.webhook_url.strip()
    if not webhook_url:
        return "failed", "Webhook URL is not configured", None

    body = {
        "alert_id": alert.id,
        "rule_type": alert.rule_type,
        "severity": alert.severity,
        "title": alert.title,
        "description": alert.description,
        "triggered_at": alert.triggered_at,
        "machine_id": alert.machine_id,
        "machine_name": alert.machine_name,
        "batch_id": alert.batch_id,
        "plan_id": alert.plan_id,
    }
    payload = json.dumps(body).encode("utf-8")
    req = urllib_request.Request(
        webhook_url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json", "X-OptiFlow-Event": "alert.triggered"},
    )

    try:
        with urllib_request.urlopen(req, timeout=delivery_settings.webhook_timeout_seconds) as response:
            status_code = int(response.getcode())
            if 200 <= status_code < 300:
                detail = f"Webhook delivered with HTTP {status_code}"
                return "sent", detail, status_code

            detail = f"Webhook returned HTTP {status_code}"
            return "failed", detail, status_code
    except (urllib_error.URLError, urllib_error.HTTPError, TimeoutError) as exc:
        detail = f"Webhook error: {exc}"
        return "failed", detail, None


def _is_retry_waiting(last_attempt: dict[str, object]) -> tuple[bool, str | None]:
    retry_at_raw = str(last_attempt.get("next_retry_at", "")).strip()
    if not retry_at_raw:
        return False, None
    try:
        retry_at = _safe_parse_datetime(retry_at_raw)
    except ValueError:
        return False, None
    if retry_at > datetime.now(timezone.utc):
        return True, retry_at.isoformat()
    return False, None


def _is_cooldown_active(last_attempt: dict[str, object], cooldown_seconds: int) -> tuple[bool, str | None]:
    if cooldown_seconds <= 0:
        return False, None
    attempted_at = str(last_attempt.get("attempted_at", "")).strip()
    if not attempted_at:
        return False, None
    cooldown_until = _safe_parse_datetime(attempted_at) + timedelta(seconds=cooldown_seconds)
    if cooldown_until > datetime.now(timezone.utc):
        return True, cooldown_until.isoformat()
    return False, None


def _dispatch_channel(
    alert: AlertItem,
    channel: Literal["email", "webhook"],
    delivery_settings: AlertDeliverySettings,
) -> AlertDispatchResult:
    if alert_deliveries_store.has_success(alert.id, channel):
        attempt_no = alert_deliveries_store.count_attempts(alert.id, channel) + 1
        _record_delivery_attempt(
            alert.id,
            channel,
            "skipped",
            attempt_no,
            "configured",
            "Already delivered successfully for this alert",
        )
        return AlertDispatchResult(
            alert_id=alert.id,
            channel=channel,
            status="skipped",
            attempt_no=attempt_no,
            message="Already delivered successfully for this alert",
        )

    last_attempt = alert_deliveries_store.latest_attempt(alert.id, channel)
    if last_attempt:
        waiting, retry_at = _is_retry_waiting(last_attempt)
        if waiting:
            attempt_no = alert_deliveries_store.count_attempts(alert.id, channel) + 1
            message = f"Retry scheduled at {retry_at}"
            _record_delivery_attempt(alert.id, channel, "skipped", attempt_no, "configured", message, next_retry_at=retry_at)
            return AlertDispatchResult(alert_id=alert.id, channel=channel, status="skipped", attempt_no=attempt_no, message=message)

        cooling_down, cooldown_until = _is_cooldown_active(last_attempt, delivery_settings.cooldown_seconds)
        if cooling_down:
            attempt_no = alert_deliveries_store.count_attempts(alert.id, channel) + 1
            message = f"Cooldown active until {cooldown_until}"
            _record_delivery_attempt(alert.id, channel, "skipped", attempt_no, "configured", message)
            return AlertDispatchResult(alert_id=alert.id, channel=channel, status="skipped", attempt_no=attempt_no, message=message)

    attempt_no = alert_deliveries_store.count_attempts(alert.id, channel) + 1
    if attempt_no > delivery_settings.max_retries:
        message = "Retry budget exhausted"
        _record_delivery_attempt(alert.id, channel, "skipped", attempt_no, "configured", message)
        return AlertDispatchResult(
            alert_id=alert.id,
            channel=channel,
            status="skipped",
            attempt_no=attempt_no,
            message=message,
        )

    target = delivery_settings.email_to if channel == "email" else delivery_settings.webhook_url
    if channel == "email":
        status, message, response_code = _send_email_alert(alert, delivery_settings)
    else:
        status, message, response_code = _send_webhook_alert(alert, delivery_settings)

    next_retry_at: str | None = None
    if status == "failed":
        delay = min(delivery_settings.retry_backoff_seconds * (2 ** max(0, attempt_no - 1)), 6 * 3600)
        next_retry_at = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
        message = f"{message}; next retry at {next_retry_at}"

    _record_delivery_attempt(
        alert.id,
        channel,
        status,
        attempt_no,
        str(target).strip(),
        message,
        response_code=response_code,
        next_retry_at=next_retry_at,
    )
    return AlertDispatchResult(
        alert_id=alert.id,
        channel=channel,
        status=status,
        attempt_no=attempt_no,
        message=message,
    )


def _dispatch_alert_to_channels(alert: AlertItem, delivery_settings: AlertDeliverySettings) -> list[AlertDispatchResult]:
    channels = _enabled_alert_channels(delivery_settings)
    if not channels:
        return []
    results: list[AlertDispatchResult] = []

    for channel in channels:
        results.append(_dispatch_channel(alert, channel, delivery_settings))

    return results


def _plan_with_machine_name(plan: dict[str, object]) -> Plan:
    machine = machines_store.get(int(plan["machine_id"]))
    machine_name = machine["name"] if machine else "Unknown Machine"
    return Plan(**plan, machine_name=machine_name)


def paginate_items(items: list[dict[str, object]], page: int, page_size: int) -> tuple[list[dict[str, object]], PaginationMeta]:
    total = len(items)
    total_pages = max(1, ceil(total / page_size))
    normalized_page = min(page, total_pages)
    start = (normalized_page - 1) * page_size
    end = start + page_size
    paged = items[start:end]

    meta = PaginationMeta(page=normalized_page, page_size=page_size, total=total, total_pages=total_pages)
    return paged, meta


def _sort_key(value: object) -> str:
    return str(value).lower()


def write_audit_event(
    current_user: dict[str, object],
    entity_type: str,
    entity_id: str,
    action: str,
    summary: str,
) -> None:
    audit_store.create(
        {
            "actor_user_id": int(current_user["id"]),
            "actor_email": str(current_user["email"]),
            "actor_role": str(current_user["role"]),
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "summary": summary,
        }
    )


def _filter_sort_audit_events(
    q: str,
    entity_type: Literal["all", "user", "role", "machine", "plan", "work_order", "department", "line", "station", "master_import", "failure_log", "alert", "spare_part"],
    action_filter: Literal["all", "create", "update", "delete"],
    start_at: datetime | None,
    end_at: datetime | None,
    sort_by: Literal["event_at", "actor_email", "entity_type", "action"],
    sort_dir: Literal["asc", "desc"],
) -> list[dict[str, object]]:
    all_items = audit_store.list()
    term = q.strip().lower()

    if entity_type != "all":
        all_items = [item for item in all_items if str(item["entity_type"]) == entity_type]

    if action_filter != "all":
        all_items = [item for item in all_items if str(item["action"]) == action_filter]

    if start_at is not None or end_at is not None:
        filtered: list[dict[str, object]] = []
        for item in all_items:
            try:
                event_at = _parse_iso_datetime(str(item["event_at"]))
            except ValueError:
                continue

            if start_at is not None and event_at < start_at:
                continue
            if end_at is not None and event_at > end_at:
                continue
            filtered.append(item)
        all_items = filtered

    if term:
        all_items = [
            item
            for item in all_items
            if term in str(item["actor_email"]).lower()
            or term in str(item["actor_role"]).lower()
            or term in str(item["entity_type"]).lower()
            or term in str(item["entity_id"]).lower()
            or term in str(item["action"]).lower()
            or term in str(item["summary"]).lower()
        ]

    all_items.sort(key=lambda item: _sort_key(item[sort_by]), reverse=(sort_dir == "desc"))
    return all_items


def _parse_iso_datetime(raw: str) -> datetime:
    normalized = raw.strip().replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_date_param(raw: str, is_end: bool) -> datetime | None:
    value = raw.strip()
    if not value:
        return None

    try:
        if len(value) == 10:
            day = datetime.strptime(value, "%Y-%m-%d")
            if is_end:
                return day.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
            return day.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
        return _parse_iso_datetime(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD or ISO datetime.") from exc


def build_master_import_plan(csv_text: str) -> dict[str, object]:
    required_columns = {"entity_type", "code", "name", "parent_code", "is_active"}
    rows = csv.DictReader(StringIO(csv_text.strip()))
    if rows.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV headers are missing")

    headers = {str(col).strip() for col in rows.fieldnames}
    missing = required_columns - headers
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(sorted(missing))}")

    operations: list[dict[str, object]] = []
    summary = {
        "departments_created": 0,
        "departments_updated": 0,
        "lines_created": 0,
        "lines_updated": 0,
        "stations_created": 0,
        "stations_updated": 0,
        "skipped_rows": 0,
    }

    known_departments = {str(item["code"]).upper() for item in departments_store.list()}
    known_lines = {str(item["code"]).upper() for item in lines_store.list()}

    for row in rows:
        entity_type = str(row.get("entity_type", "")).strip().lower()
        code = str(row.get("code", "")).strip().upper()
        name = str(row.get("name", "")).strip()
        parent_code = str(row.get("parent_code", "")).strip().upper()
        is_active_raw = str(row.get("is_active", "true")).strip().lower()
        is_active = is_active_raw not in {"false", "0", "no", "n"}

        if not code or not name or entity_type not in {"department", "line", "station"}:
            summary["skipped_rows"] += 1
            continue

        if entity_type == "department":
            existing = departments_store.get_by_code(code)
            if existing is None:
                summary["departments_created"] += 1
                known_departments.add(code)
                operations.append(
                    {
                        "entity_type": "department",
                        "op": "create",
                        "code": code,
                        "payload": {"code": code, "name": name, "is_active": is_active},
                        "previous": None,
                    }
                )
            else:
                summary["departments_updated"] += 1
                operations.append(
                    {
                        "entity_type": "department",
                        "op": "update",
                        "code": code,
                        "payload": {"name": name, "is_active": is_active},
                        "previous": existing,
                    }
                )
            continue

        if entity_type == "line":
            if not parent_code or parent_code not in known_departments:
                summary["skipped_rows"] += 1
                continue
            existing = lines_store.get_by_code(code)
            if existing is None:
                summary["lines_created"] += 1
                known_lines.add(code)
                operations.append(
                    {
                        "entity_type": "line",
                        "op": "create",
                        "code": code,
                        "payload": {
                            "code": code,
                            "name": name,
                            "department_code": parent_code,
                            "is_active": is_active,
                        },
                        "previous": None,
                    }
                )
            else:
                summary["lines_updated"] += 1
                operations.append(
                    {
                        "entity_type": "line",
                        "op": "update",
                        "code": code,
                        "payload": {
                            "name": name,
                            "department_code": parent_code,
                            "is_active": is_active,
                        },
                        "previous": existing,
                    }
                )
            continue

        if not parent_code or parent_code not in known_lines:
            summary["skipped_rows"] += 1
            continue
        existing_station = stations_store.get_by_code(code)
        if existing_station is None:
            summary["stations_created"] += 1
            operations.append(
                {
                    "entity_type": "station",
                    "op": "create",
                    "code": code,
                    "payload": {
                        "code": code,
                        "name": name,
                        "line_code": parent_code,
                        "is_active": is_active,
                    },
                    "previous": None,
                }
            )
        else:
            summary["stations_updated"] += 1
            operations.append(
                {
                    "entity_type": "station",
                    "op": "update",
                    "code": code,
                    "payload": {
                        "name": name,
                        "line_code": parent_code,
                        "is_active": is_active,
                    },
                    "previous": existing_station,
                }
            )

    batch_id = f"imp-{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    return {"batch_id": batch_id, "summary": summary, "operations": operations}


def apply_master_import_plan(import_plan: dict[str, object]) -> list[dict[str, object]]:
    operations = list(import_plan.get("operations", []))
    changes: list[dict[str, object]] = []

    for op in operations:
        entity_type = str(op["entity_type"])
        mode = str(op["op"])
        code = str(op["code"])
        payload = dict(op.get("payload", {}))
        previous = op.get("previous")

        if entity_type == "department":
            if mode == "create":
                departments_store.create(payload)
            else:
                departments_store.update_by_code(code, payload)
        elif entity_type == "line":
            if mode == "create":
                lines_store.create(payload)
            else:
                lines_store.update_by_code(code, payload)
        else:
            if mode == "create":
                stations_store.create(payload)
            else:
                stations_store.update_by_code(code, payload)

        changes.append(
            {
                "entity_type": entity_type,
                "op": mode,
                "code": code,
                "previous": previous,
                "payload": payload,
            }
        )

    return changes


def rollback_import_changes(changes: list[dict[str, object]]) -> int:
    rolled_back = 0
    for change in reversed(changes):
        entity_type = str(change.get("entity_type", ""))
        mode = str(change.get("op", ""))
        code = str(change.get("code", "")).upper()
        previous = change.get("previous")

        if entity_type == "department":
            if mode == "create":
                if departments_store.delete_by_code(code):
                    rolled_back += 1
            elif isinstance(previous, dict):
                if departments_store.update_by_code(code, previous):
                    rolled_back += 1
            continue

        if entity_type == "line":
            if mode == "create":
                if lines_store.delete_by_code(code):
                    rolled_back += 1
            elif isinstance(previous, dict):
                if lines_store.update_by_code(code, previous):
                    rolled_back += 1
            continue

        if entity_type == "station":
            if mode == "create":
                if stations_store.delete_by_code(code):
                    rolled_back += 1
            elif isinstance(previous, dict):
                if stations_store.update_by_code(code, previous):
                    rolled_back += 1

    return rolled_back


def _filter_sort_machines(
    q: str,
    sort_by: Literal["machine_code", "name", "criticality", "status"],
    sort_dir: Literal["asc", "desc"],
) -> list[dict[str, object]]:
    all_items = machines_store.list()
    term = q.strip().lower()

    if term:
        all_items = [
            item
            for item in all_items
            if term in str(item["machine_code"]).lower()
            or term in str(item["name"]).lower()
            or term in str(item["criticality"]).lower()
            or term in str(item["status"]).lower()
        ]

    all_items.sort(key=lambda item: _sort_key(item[sort_by]), reverse=(sort_dir == "desc"))
    return all_items


def _filter_sort_spare_parts(
    q: str,
    low_stock_only: bool,
    sort_by: Literal["part_code", "name", "category", "stock_qty", "reorder_level", "unit_cost", "is_active"],
    sort_dir: Literal["asc", "desc"],
) -> list[dict[str, object]]:
    all_items = spare_parts_store.list()
    term = q.strip().lower()

    if low_stock_only:
        all_items = [
            item
            for item in all_items
            if int(item.get("stock_qty", 0)) <= int(item.get("reorder_level", 0)) and bool(item.get("is_active", True))
        ]

    if term:
        all_items = [
            item
            for item in all_items
            if term in str(item["part_code"]).lower()
            or term in str(item["name"]).lower()
            or term in str(item["category"]).lower()
        ]

    all_items.sort(key=lambda item: _sort_key(item[sort_by]), reverse=(sort_dir == "desc"))
    return all_items


def _filter_sort_plans(
    q: str,
    plan_type: Literal["all", "calendar", "runtime"],
    sort_by: Literal["plan_code", "title", "next_due", "machine_name"],
    sort_dir: Literal["asc", "desc"],
) -> list[dict[str, object]]:
    all_items = [_plan_with_machine_name(plan).model_dump() for plan in plans_store.list()]
    term = q.strip().lower()

    if plan_type != "all":
        all_items = [item for item in all_items if str(item["plan_type"]) == plan_type]

    if term:
        all_items = [
            item
            for item in all_items
            if term in str(item["plan_code"]).lower()
            or term in str(item["title"]).lower()
            or term in str(item["machine_name"]).lower()
            or term in str(item["next_due"]).lower()
        ]

    all_items.sort(key=lambda item: _sort_key(item[sort_by]), reverse=(sort_dir == "desc"))
    return all_items


def _filter_sort_work_orders(
    q: str,
    status_filter: Literal["all", "open", "in_progress", "done", "overdue", "cancelled"],
    priority_filter: Literal["all", "low", "medium", "high", "critical"],
    sort_by: Literal["work_order_code", "machine_name", "status", "priority"],
    sort_dir: Literal["asc", "desc"],
) -> list[dict[str, object]]:
    all_items = [_work_order_with_machine_name(work_order).model_dump() for work_order in work_orders_store.list()]
    term = q.strip().lower()

    if status_filter != "all":
        all_items = [item for item in all_items if str(item["status"]) == status_filter]

    if priority_filter != "all":
        all_items = [item for item in all_items if str(item["priority"]) == priority_filter]

    if term:
        all_items = [
            item
            for item in all_items
            if term in str(item["work_order_code"]).lower()
            or term in str(item["machine_name"]).lower()
            or term in str(item["status"]).lower()
            or term in str(item["priority"]).lower()
        ]

    all_items.sort(key=lambda item: _sort_key(item[sort_by]), reverse=(sort_dir == "desc"))
    return all_items


app.include_router(build_system_router(db_healthcheck=db_healthcheck, redis_healthcheck=redis_healthcheck))
app.include_router(
    build_auth_router(
        users_store=users_store,
        roles_store=roles_store,
        create_access_token=create_access_token,
        auth_user_from_row=auth_user_from_row,
        get_current_user=get_current_user,
    )
)
app.include_router(
    build_dashboard_router(
        get_current_user=get_current_user,
        machines_store=machines_store,
        work_orders_store=work_orders_store,
        failure_logs_store=failure_logs_store,
        safe_parse_datetime=_safe_parse_datetime,
    )
)
app.include_router(
    build_admin_router(
        users_store=users_store,
        roles_store=roles_store,
        get_permissions_for_role=get_permissions_for_role,
        require_permission=require_permission,
        write_audit_event=write_audit_event,
    )
)
app.include_router(
    build_reports_router(
        get_current_user=get_current_user,
        parse_date_param=_parse_date_param,
        build_reliability_report=_build_reliability_report,
    )
)
app.include_router(
    build_master_data_router(
        require_permission=require_permission,
        build_master_import_plan=build_master_import_plan,
        apply_master_import_plan=apply_master_import_plan,
        rollback_import_changes=rollback_import_changes,
        import_history_store=import_history_store,
        write_audit_event=write_audit_event,
    )
)
app.include_router(
    build_plant_mapping_router(
        require_permission=require_permission,
        departments_store=departments_store,
        lines_store=lines_store,
        stations_store=stations_store,
    )
)
app.include_router(
    build_assets_router(
        get_current_user=get_current_user,
        require_permission=require_permission,
        write_audit_event=write_audit_event,
        machines_store=machines_store,
        spare_parts_store=spare_parts_store,
        departments_store=departments_store,
        lines_store=lines_store,
        stations_store=stations_store,
    )
)
app.include_router(
    build_maintenance_router(
        get_current_user=get_current_user,
        require_permission=require_permission,
        write_audit_event=write_audit_event,
        plans_store=plans_store,
        work_orders_store=work_orders_store,
        work_order_parts_store=work_order_parts_store,
        machines_store=machines_store,
        spare_parts_store=spare_parts_store,
        plan_with_machine_name=_plan_with_machine_name,
        work_order_with_machine_name=_work_order_with_machine_name,
        safe_parse_datetime=_safe_parse_datetime,
        plan_due_soon=_plan_due_soon,
        next_auto_work_order_code=_next_auto_work_order_code,
        filter_sort_plans=_filter_sort_plans,
        filter_sort_work_orders=_filter_sort_work_orders,
        paginate_items=paginate_items,
    )
)
app.include_router(
    build_incidents_router(
        get_current_user=get_current_user,
        require_permission=require_permission,
        write_audit_event=write_audit_event,
        failure_logs_store=failure_logs_store,
        machines_store=machines_store,
        alerts_store=alerts_store,
        alert_deliveries_store=alert_deliveries_store,
        alert_delivery_settings_store=alert_delivery_settings_store,
        failure_log_with_machine_name=_failure_log_with_machine_name,
        safe_parse_datetime=_safe_parse_datetime,
        parse_date_param=_parse_date_param,
        decorate_alerts_with_state=_decorate_alerts_with_state,
        build_alert_candidates=_build_alert_candidates,
        get_alert_delivery_settings=_get_alert_delivery_settings,
        dispatch_alert_to_channels=_dispatch_alert_to_channels,
    )
)


