from datetime import datetime, timedelta, timezone
import csv
import logging
from logging.handlers import RotatingFileHandler
from math import ceil
from io import StringIO
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from jose import JWTError, jwt
from redis import Redis
from fastapi.security import OAuth2PasswordBearer

from app.config import settings
from app.audit_store import AuditStore
from app.database import db_healthcheck
from app.departments_store import DepartmentsStore
from app.failure_logs_store import FailureLogsStore
from app.lines_store import LinesStore
from app.machines_store import MachinesStore
from app.plans_store import PlansStore
from app.roles_store import RolesStore
from app.stations_store import StationsStore
from app.import_history_store import ImportHistoryStore
from app.users_store import UsersStore
from app.work_orders_store import WorkOrdersStore

app = FastAPI(title="OptiFlow API", version="0.1.0")
machines_store = MachinesStore()
plans_store = PlansStore()
users_store = UsersStore()
roles_store = RolesStore()
work_orders_store = WorkOrdersStore()
audit_store = AuditStore()
departments_store = DepartmentsStore()
lines_store = LinesStore()
stations_store = StationsStore()
import_history_store = ImportHistoryStore()
failure_logs_store = FailureLogsStore()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
logger = logging.getLogger("optiflow.api")
if not logger.handlers:
    _VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
    _log_level_str = settings.log_level.upper()
    if _log_level_str not in _VALID_LOG_LEVELS:
        _log_level_str = "INFO"
        import warnings as _warnings
        _warnings.warn(
            f"Invalid LOG_LEVEL {settings.log_level!r}; falling back to INFO. "
            f"Valid values: {', '.join(sorted(_VALID_LOG_LEVELS))}",
            stacklevel=1,
        )
    _log_level = getattr(logging, _log_level_str)
    logging.basicConfig(level=_log_level)
    if settings.log_file:
        try:
            _file_handler = RotatingFileHandler(
                settings.log_file, maxBytes=1_000_000, backupCount=5, encoding="utf-8"
            )
            _file_handler.setLevel(_log_level)
            _file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
            logger.addHandler(_file_handler)
        except OSError as _exc:
            logger.warning(
                "Could not create log file handler for %r: %s – logging to stdout only",
                settings.log_file,
                _exc,
            )


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


class FailureLogBase(BaseModel):
    machine_id: int = Field(gt=0)
    occurred_at: str = Field(min_length=10, max_length=40)
    downtime_hours: float = Field(gt=0)
    repair_cost: float = Field(ge=0)
    root_cause: str = Field(min_length=3, max_length=200)
    notes: str = Field(default="", max_length=500)


class FailureLogCreate(FailureLogBase):
    pass


class FailureLog(FailureLogBase):
    id: int
    machine_name: str


class KpiTrendPoint(BaseModel):
    day: str
    failures: int
    downtime_hours: float
    repair_cost: float


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


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    user = users_store.get_by_email(payload.email)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    valid_password = users_store.verify_password(payload.password, str(user["password_hash"]))
    if not valid_password:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not roles_store.name_exists(str(user["role"])):
        raise HTTPException(status_code=403, detail="Role is not configured")
    role_def = roles_store.get(str(user["role"]))
    if role_def is None or not bool(role_def.get("is_active", True)):
        raise HTTPException(status_code=403, detail="Role is disabled")

    token = create_access_token(str(user["email"]))
    auth_user = auth_user_from_row(user)
    return TokenResponse(access_token=token, token_type="bearer", user=auth_user)


@app.get("/api/v1/auth/me", response_model=AuthUser)
def me(current_user: dict[str, object] = Depends(get_current_user)) -> AuthUser:
    role_def = roles_store.get(str(current_user["role"]))
    if role_def is None:
        raise HTTPException(status_code=403, detail="Role is not configured")
    if not bool(role_def.get("is_active", True)):
        raise HTTPException(status_code=403, detail="Role is disabled")
    return auth_user_from_row(current_user)


@app.get("/api/v1/roles", response_model=list[RoleDefinition])
def list_roles(current_user: dict[str, object] = Depends(require_permission("can_manage_users"))) -> list[RoleDefinition]:
    return [
        RoleDefinition(
            name=str(role["name"]),
            is_system=bool(role.get("is_system", False)),
            is_active=bool(role.get("is_active", True)),
            permissions=RolePermissions(**dict(role.get("permissions", {}))),
        )
        for role in roles_store.list()
    ]


@app.post("/api/v1/roles", response_model=RoleDefinition, status_code=status.HTTP_201_CREATED)
def create_role(
    payload: RoleCreate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
) -> RoleDefinition:
    normalized_name = payload.name.strip().lower()
    if roles_store.name_exists(normalized_name):
        raise HTTPException(status_code=409, detail="Role already exists")

    created = roles_store.create(
        {"name": normalized_name, "is_active": payload.is_active, "permissions": payload.permissions.model_dump()}
    )
    write_audit_event(
        current_user,
        "role",
        str(created["name"]),
        "create",
        f"Created role '{created['name']}'",
    )
    return RoleDefinition(
        name=str(created["name"]),
        is_system=bool(created.get("is_system", False)),
        is_active=bool(created.get("is_active", True)),
        permissions=RolePermissions(**dict(created.get("permissions", {}))),
    )


@app.patch("/api/v1/roles/{role_name}", response_model=RoleDefinition)
def update_role(
    role_name: str,
    payload: RoleUpdate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
) -> RoleDefinition:
    current = roles_store.get(role_name)
    if current is None:
        raise HTTPException(status_code=404, detail="Role not found")

    if bool(current.get("is_system", False)) and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot disable system role")

    patch_payload: dict[str, object] = {}
    if payload.permissions is not None:
        patch_payload["permissions"] = payload.permissions.model_dump()
    if payload.is_active is not None:
        patch_payload["is_active"] = payload.is_active

    updated = roles_store.update(role_name, patch_payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="Role not found")

    write_audit_event(
        current_user,
        "role",
        str(updated["name"]),
        "update",
        f"Updated role '{updated['name']}'",
    )

    return RoleDefinition(
        name=str(updated["name"]),
        is_system=bool(updated.get("is_system", False)),
        is_active=bool(updated.get("is_active", True)),
        permissions=RolePermissions(**dict(updated.get("permissions", {}))),
    )


@app.delete("/api/v1/roles/{role_name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_name: str,
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
) -> Response:
    normalized_name = role_name.strip().lower()
    if roles_store.is_system_role(normalized_name):
        raise HTTPException(status_code=400, detail="Cannot delete system role")

    users_using_role = [user for user in users_store.list() if str(user.get("role", "")).lower() == normalized_name]
    if users_using_role:
        raise HTTPException(status_code=409, detail="Role is assigned to one or more users")

    deleted = roles_store.delete(normalized_name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Role not found")
    write_audit_event(current_user, "role", normalized_name, "delete", f"Deleted role '{normalized_name}'")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/users", response_model=list[UserAdminView])
def list_users(current_user: dict[str, object] = Depends(require_permission("can_manage_users"))) -> list[UserAdminView]:
    users = users_store.list()
    return [
        UserAdminView(
            id=int(user["id"]),
            full_name=str(user["full_name"]),
            email=str(user["email"]),
            role=str(user["role"]),
            permissions=get_permissions_for_role(str(user["role"])),
            is_active=bool(user.get("is_active", True)),
        )
        for user in users
    ]


@app.post("/api/v1/users", response_model=UserAdminView, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
) -> UserAdminView:
    if users_store.email_exists(payload.email):
        raise HTTPException(status_code=409, detail="Email already exists")
    if not roles_store.name_exists(payload.role):
        raise HTTPException(status_code=400, detail="Role does not exist")

    created = users_store.create(payload.model_dump())
    write_audit_event(
        current_user,
        "user",
        str(created["id"]),
        "create",
        f"Created user '{created['email']}'",
    )
    return UserAdminView(
        id=int(created["id"]),
        full_name=str(created["full_name"]),
        email=str(created["email"]),
        role=str(created["role"]),
        permissions=get_permissions_for_role(str(created["role"])),
        is_active=bool(created.get("is_active", True)),
    )


@app.patch("/api/v1/users/{user_id}", response_model=UserAdminView)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
) -> UserAdminView:
    existing = users_store.get(user_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="User not found")

    updates = payload.model_dump(exclude_unset=True)
    next_email = updates.get("email")
    if next_email and users_store.email_exists(str(next_email), exclude_id=user_id):
        raise HTTPException(status_code=409, detail="Email already exists")
    next_role = updates.get("role")
    if next_role and not roles_store.name_exists(str(next_role)):
        raise HTTPException(status_code=400, detail="Role does not exist")

    updated = users_store.update(user_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="User not found")

    write_audit_event(
        current_user,
        "user",
        str(updated["id"]),
        "update",
        f"Updated user '{updated['email']}'",
    )

    return UserAdminView(
        id=int(updated["id"]),
        full_name=str(updated["full_name"]),
        email=str(updated["email"]),
        role=str(updated["role"]),
        permissions=get_permissions_for_role(str(updated["role"])),
        is_active=bool(updated.get("is_active", True)),
    )


@app.delete("/api/v1/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
) -> Response:
    requester_id = int(current_user["id"])
    if requester_id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    deleted = users_store.delete(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    write_audit_event(current_user, "user", str(user_id), "delete", f"Deleted user id {user_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/ready")
def readiness_check() -> dict[str, object]:
    db_ok = False
    redis_ok = False

    try:
        db_ok = db_healthcheck()
    except Exception:
        db_ok = False

    try:
        redis_ok = redis_healthcheck()
    except Exception:
        redis_ok = False

    return {
        "status": "ready" if (db_ok and redis_ok) else "degraded",
        "checks": {"database": db_ok, "redis": redis_ok},
    }


@app.get("/api/v1/dashboard/summary")
def dashboard_summary(current_user: dict[str, object] = Depends(get_current_user)) -> dict[str, object]:
    work_orders = work_orders_store.list()
    failures = failure_logs_store.list()
    open_count = len([w for w in work_orders if w["status"] == "open"])
    overdue_count = len([w for w in work_orders if w["status"] == "overdue"])

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    recent_failures = [f for f in failures if _safe_parse_datetime(str(f.get("occurred_at", ""))) >= cutoff]
    downtime_hours = round(sum(float(f.get("downtime_hours", 0)) for f in recent_failures), 2)
    repair_cost = round(sum(float(f.get("repair_cost", 0)) for f in recent_failures), 2)

    return {
        "total_machines": len(machines_store.list()),
        "open_work_orders": open_count,
        "overdue_work_orders": overdue_count,
        "downtime_hours_30d": downtime_hours,
        "repair_cost_30d": repair_cost,
        "failure_count_30d": len(recent_failures),
    }


@app.get("/api/v1/dashboard/kpi-trends", response_model=list[KpiTrendPoint])
def dashboard_kpi_trends(
    current_user: dict[str, object] = Depends(get_current_user),
    days: int = Query(default=14, ge=7, le=90),
) -> list[KpiTrendPoint]:
    failures = failure_logs_store.list()
    today = datetime.now(timezone.utc).date()
    start_day = today - timedelta(days=days - 1)
    buckets: dict[str, dict[str, float | int]] = {}

    for i in range(days):
        day = start_day + timedelta(days=i)
        key = day.isoformat()
        buckets[key] = {"failures": 0, "downtime_hours": 0.0, "repair_cost": 0.0}

    for item in failures:
        event_at = _safe_parse_datetime(str(item.get("occurred_at", "")))
        key = event_at.date().isoformat()
        if key not in buckets:
            continue

        buckets[key]["failures"] = int(buckets[key]["failures"]) + 1
        buckets[key]["downtime_hours"] = float(buckets[key]["downtime_hours"]) + float(item.get("downtime_hours", 0))
        buckets[key]["repair_cost"] = float(buckets[key]["repair_cost"]) + float(item.get("repair_cost", 0))

    return [
        KpiTrendPoint(
            day=day,
            failures=int(values["failures"]),
            downtime_hours=round(float(values["downtime_hours"]), 2),
            repair_cost=round(float(values["repair_cost"]), 2),
        )
        for day, values in sorted(buckets.items(), key=lambda row: row[0])
    ]


@app.get("/api/v1/audit-logs", response_model=AuditListResponse)
def list_audit_logs(
    current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    q: str = Query(default=""),
    entity_type: Literal["all", "user", "role", "machine", "plan", "work_order", "department", "line", "station", "master_import", "failure_log"] = Query(default="all"),
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
    entity_type: Literal["all", "user", "role", "machine", "plan", "work_order", "department", "line", "station", "master_import", "failure_log"] = Query(default="all"),
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


@app.get("/api/v1/departments", response_model=list[Department])
def list_departments(current_user: dict[str, object] = Depends(get_current_user)) -> list[Department]:
    return [Department(**item) for item in departments_store.list()]


@app.post("/api/v1/departments", response_model=Department, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Department:
    code = payload.code.strip().upper()
    if departments_store.code_exists(code):
        raise HTTPException(status_code=409, detail="Department code already exists")

    created = departments_store.create({"code": code, "name": payload.name, "is_active": payload.is_active})
    write_audit_event(current_user, "department", str(created["code"]), "create", f"Created department '{created['code']}'")
    return Department(**created)


@app.delete("/api/v1/departments/{department_code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_code: str,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Response:
    normalized = department_code.strip().upper()
    has_lines = any(str(item.get("department_code", "")).upper() == normalized for item in lines_store.list())
    if has_lines:
        raise HTTPException(status_code=409, detail="Department has linked lines")

    deleted = departments_store.delete_by_code(normalized)
    if not deleted:
        raise HTTPException(status_code=404, detail="Department not found")

    write_audit_event(current_user, "department", normalized, "delete", f"Deleted department '{normalized}'")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/lines", response_model=list[Line])
def list_lines(current_user: dict[str, object] = Depends(get_current_user)) -> list[Line]:
    return [Line(**item) for item in lines_store.list()]


@app.post("/api/v1/lines", response_model=Line, status_code=status.HTTP_201_CREATED)
def create_line(
    payload: LineCreate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Line:
    code = payload.code.strip().upper()
    department_code = payload.department_code.strip().upper()
    if lines_store.code_exists(code):
        raise HTTPException(status_code=409, detail="Line code already exists")
    if not departments_store.code_exists(department_code):
        raise HTTPException(status_code=400, detail="Department does not exist")

    created = lines_store.create(
        {"code": code, "name": payload.name, "department_code": department_code, "is_active": payload.is_active}
    )
    write_audit_event(current_user, "line", str(created["code"]), "create", f"Created line '{created['code']}'")
    return Line(**created)


@app.delete("/api/v1/lines/{line_code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_line(
    line_code: str,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Response:
    normalized = line_code.strip().upper()
    has_stations = any(str(item.get("line_code", "")).upper() == normalized for item in stations_store.list())
    if has_stations:
        raise HTTPException(status_code=409, detail="Line has linked stations")

    deleted = lines_store.delete_by_code(normalized)
    if not deleted:
        raise HTTPException(status_code=404, detail="Line not found")

    write_audit_event(current_user, "line", normalized, "delete", f"Deleted line '{normalized}'")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/stations", response_model=list[Station])
def list_stations(current_user: dict[str, object] = Depends(get_current_user)) -> list[Station]:
    return [Station(**item) for item in stations_store.list()]


@app.post("/api/v1/stations", response_model=Station, status_code=status.HTTP_201_CREATED)
def create_station(
    payload: StationCreate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Station:
    code = payload.code.strip().upper()
    line_code = payload.line_code.strip().upper()
    if stations_store.code_exists(code):
        raise HTTPException(status_code=409, detail="Station code already exists")
    if not lines_store.code_exists(line_code):
        raise HTTPException(status_code=400, detail="Line does not exist")

    created = stations_store.create({"code": code, "name": payload.name, "line_code": line_code, "is_active": payload.is_active})
    write_audit_event(current_user, "station", str(created["code"]), "create", f"Created station '{created['code']}'")
    return Station(**created)


@app.delete("/api/v1/stations/{station_code}", status_code=status.HTTP_204_NO_CONTENT)
def delete_station(
    station_code: str,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Response:
    normalized = station_code.strip().upper()
    deleted = stations_store.delete_by_code(normalized)
    if not deleted:
        raise HTTPException(status_code=404, detail="Station not found")

    write_audit_event(current_user, "station", normalized, "delete", f"Deleted station '{normalized}'")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/v1/master-data/import-csv", response_model=MasterImportResult)
def import_master_data_csv(
    payload: MasterImportCsvPayload,
    current_user: dict[str, object] = Depends(require_permission("can_import_master_data")),
) -> MasterImportResult:
    import_plan = build_master_import_plan(payload.csv_text)
    summary = import_plan["summary"]
    batch_id = str(import_plan["batch_id"])

    applied_changes: list[dict[str, object]] = []
    if not payload.dry_run:
        applied_changes = apply_master_import_plan(import_plan)

    history_item = import_history_store.create(
        {
            "batch_id": batch_id,
            "actor_email": str(current_user["email"]),
            "source_file_name": payload.source_file_name,
            "dry_run": payload.dry_run,
            "summary": summary,
            "changes": applied_changes,
        }
    )

    summary_text = (
        f"Master import {'dry-run' if payload.dry_run else 'completed'}: "
        f"dept +{summary['departments_created']}/{summary['departments_updated']} upd, "
        f"line +{summary['lines_created']}/{summary['lines_updated']} upd, "
        f"station +{summary['stations_created']}/{summary['stations_updated']} upd, skipped {summary['skipped_rows']}"
    )
    write_audit_event(current_user, "master_import", batch_id, "create", summary_text)

    return MasterImportResult(
        batch_id=str(history_item["batch_id"]),
        dry_run=bool(history_item["dry_run"]),
        departments_created=int(summary["departments_created"]),
        departments_updated=int(summary["departments_updated"]),
        lines_created=int(summary["lines_created"]),
        lines_updated=int(summary["lines_updated"]),
        stations_created=int(summary["stations_created"]),
        stations_updated=int(summary["stations_updated"]),
        skipped_rows=int(summary["skipped_rows"]),
    )


@app.get("/api/v1/master-data/import-history", response_model=list[ImportHistoryItem])
def list_master_import_history(
    current_user: dict[str, object] = Depends(require_permission("can_import_master_data")),
) -> list[ImportHistoryItem]:
    return [ImportHistoryItem(**item) for item in import_history_store.list()]


@app.post("/api/v1/master-data/import-history/{batch_id}/rollback", response_model=RollbackResult)
def rollback_master_import_batch(
    batch_id: str,
    current_user: dict[str, object] = Depends(require_permission("can_import_master_data")),
) -> RollbackResult:
    history_item = import_history_store.get(batch_id)
    if history_item is None:
        raise HTTPException(status_code=404, detail="Import batch not found")
    if bool(history_item.get("dry_run", False)):
        raise HTTPException(status_code=400, detail="Cannot rollback a dry-run batch")
    if bool(history_item.get("rollback_applied", False)):
        raise HTTPException(status_code=409, detail="Rollback already applied for this batch")

    changes = list(history_item.get("changes", []))
    rolled_back = rollback_import_changes(changes)
    import_history_store.mark_rollback_applied(batch_id)
    write_audit_event(current_user, "master_import", batch_id, "delete", f"Rolled back import batch {batch_id}")
    return RollbackResult(batch_id=batch_id, rolled_back_changes=rolled_back)


@app.get("/api/v1/plant-mapping/integrity-checks", response_model=PlantIntegrityReport)
def get_plant_mapping_integrity(
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> PlantIntegrityReport:
    departments = departments_store.list()
    lines = lines_store.list()
    stations = stations_store.list()

    department_codes = {str(item["code"]).upper() for item in departments}
    line_codes = {str(item["code"]).upper() for item in lines}
    departments_by_code = {str(item["code"]).upper(): item for item in departments}
    lines_by_code = {str(item["code"]).upper(): item for item in lines}

    orphan_lines = len([item for item in lines if str(item["department_code"]).upper() not in department_codes])
    orphan_stations = len([item for item in stations if str(item["line_code"]).upper() not in line_codes])

    duplicate_department_codes = len(departments) - len(department_codes)
    duplicate_line_codes = len(lines) - len(line_codes)
    duplicate_station_codes = len(stations) - len({str(item["code"]).upper() for item in stations})

    inactive_department_lines = len(
        [
            item
            for item in lines
            if str(item["department_code"]).upper() in departments_by_code
            and not bool(departments_by_code[str(item["department_code"]).upper()].get("is_active", True))
        ]
    )
    inactive_line_stations = len(
        [
            item
            for item in stations
            if str(item["line_code"]).upper() in lines_by_code
            and not bool(lines_by_code[str(item["line_code"]).upper()].get("is_active", True))
        ]
    )

    return PlantIntegrityReport(
        orphan_lines=orphan_lines,
        orphan_stations=orphan_stations,
        duplicate_department_codes=duplicate_department_codes,
        duplicate_line_codes=duplicate_line_codes,
        duplicate_station_codes=duplicate_station_codes,
        inactive_department_lines=inactive_department_lines,
        inactive_line_stations=inactive_line_stations,
    )


def _work_order_with_machine_name(work_order: dict[str, object]) -> WorkOrder:
    machine = machines_store.get(int(work_order["machine_id"]))
    machine_name = machine["name"] if machine else "Unknown Machine"
    return WorkOrder(**work_order, machine_name=machine_name)


def _failure_log_with_machine_name(failure_log: dict[str, object]) -> FailureLog:
    machine = machines_store.get(int(failure_log["machine_id"]))
    machine_name = machine["name"] if machine else "Unknown Machine"
    return FailureLog(**failure_log, machine_name=machine_name)


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
    entity_type: Literal["all", "user", "role", "machine", "plan", "work_order", "department", "line", "station", "master_import", "failure_log"],
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


@app.get("/api/v1/machines", response_model=MachinesListResponse)
def list_machines(
    current_user: dict[str, object] = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    q: str = Query(default=""),
    sort_by: Literal["machine_code", "name", "criticality", "status"] = Query(default="machine_code"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
) -> MachinesListResponse:
    all_items = _filter_sort_machines(q, sort_by, sort_dir)
    paged, meta = paginate_items(all_items, page, page_size)
    return MachinesListResponse(items=[Machine(**machine) for machine in paged], pagination=meta)


@app.get("/api/v1/machines/export", response_model=list[Machine])
def export_machines(
    current_user: dict[str, object] = Depends(get_current_user),
    q: str = Query(default=""),
    sort_by: Literal["machine_code", "name", "criticality", "status"] = Query(default="machine_code"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
) -> list[Machine]:
    all_items = _filter_sort_machines(q, sort_by, sort_dir)
    return [Machine(**machine) for machine in all_items]


@app.post("/api/v1/machines", response_model=Machine, status_code=status.HTTP_201_CREATED)
def create_machine(
    payload: MachineCreate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Machine:
    if machines_store.code_exists(payload.machine_code):
        raise HTTPException(status_code=409, detail="Machine code already exists")

    machine = machines_store.create(payload.model_dump())
    write_audit_event(
        current_user,
        "machine",
        str(machine["id"]),
        "create",
        f"Created machine '{machine['machine_code']}'",
    )
    return Machine(**machine)


@app.get("/api/v1/machines/{machine_id}", response_model=Machine)
def get_machine(machine_id: int, current_user: dict[str, object] = Depends(get_current_user)) -> Machine:
    machine = machines_store.get(machine_id)
    if machine is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    return Machine(**machine)


@app.patch("/api/v1/machines/{machine_id}", response_model=Machine)
def update_machine(
    machine_id: int,
    payload: MachineUpdate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Machine:
    current = machines_store.get(machine_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Machine not found")

    updates = payload.model_dump(exclude_unset=True)
    next_code = updates.get("machine_code")
    if next_code and machines_store.code_exists(next_code, exclude_id=machine_id):
        raise HTTPException(status_code=409, detail="Machine code already exists")

    updated = machines_store.update(machine_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Machine not found")
    write_audit_event(
        current_user,
        "machine",
        str(updated["id"]),
        "update",
        f"Updated machine '{updated['machine_code']}'",
    )
    return Machine(**updated)


@app.delete("/api/v1/machines/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_machine(
    machine_id: int,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Response:
    deleted = machines_store.delete(machine_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Machine not found")
    write_audit_event(current_user, "machine", str(machine_id), "delete", f"Deleted machine id {machine_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/maintenance-plans", response_model=PlansListResponse)
def list_plans(
    current_user: dict[str, object] = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    q: str = Query(default=""),
    plan_type: Literal["all", "calendar", "runtime"] = Query(default="all"),
    sort_by: Literal["plan_code", "title", "next_due", "machine_name"] = Query(default="plan_code"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
) -> PlansListResponse:
    all_items = _filter_sort_plans(q, plan_type, sort_by, sort_dir)
    paged, meta = paginate_items(all_items, page, page_size)
    return PlansListResponse(items=[Plan(**plan) for plan in paged], pagination=meta)


@app.get("/api/v1/maintenance-plans/export", response_model=list[Plan])
def export_plans(
    current_user: dict[str, object] = Depends(get_current_user),
    q: str = Query(default=""),
    plan_type: Literal["all", "calendar", "runtime"] = Query(default="all"),
    sort_by: Literal["plan_code", "title", "next_due", "machine_name"] = Query(default="plan_code"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
) -> list[Plan]:
    all_items = _filter_sort_plans(q, plan_type, sort_by, sort_dir)
    return [Plan(**plan) for plan in all_items]


@app.post("/api/v1/maintenance-plans", response_model=Plan, status_code=status.HTTP_201_CREATED)
def create_plan(
    payload: PlanCreate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Plan:
    if plans_store.code_exists(payload.plan_code):
        raise HTTPException(status_code=409, detail="Plan code already exists")

    machine = machines_store.get(payload.machine_id)
    if machine is None:
        raise HTTPException(status_code=400, detail="Machine does not exist")

    plan = plans_store.create(payload.model_dump())
    write_audit_event(
        current_user,
        "plan",
        str(plan["id"]),
        "create",
        f"Created plan '{plan['plan_code']}'",
    )
    return _plan_with_machine_name(plan)


@app.get("/api/v1/maintenance-plans/{plan_id}", response_model=Plan)
def get_plan(plan_id: int, current_user: dict[str, object] = Depends(get_current_user)) -> Plan:
    plan = plans_store.get(plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    return _plan_with_machine_name(plan)


@app.patch("/api/v1/maintenance-plans/{plan_id}", response_model=Plan)
def update_plan(
    plan_id: int,
    payload: PlanUpdate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Plan:
    current = plans_store.get(plan_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Plan not found")

    updates = payload.model_dump(exclude_unset=True)
    next_code = updates.get("plan_code")
    next_machine_id = updates.get("machine_id")

    if next_code and plans_store.code_exists(next_code, exclude_id=plan_id):
        raise HTTPException(status_code=409, detail="Plan code already exists")

    if next_machine_id is not None and machines_store.get(next_machine_id) is None:
        raise HTTPException(status_code=400, detail="Machine does not exist")

    updated = plans_store.update(plan_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Plan not found")

    write_audit_event(
        current_user,
        "plan",
        str(updated["id"]),
        "update",
        f"Updated plan '{updated['plan_code']}'",
    )

    return _plan_with_machine_name(updated)


@app.delete("/api/v1/maintenance-plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(
    plan_id: int,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Response:
    deleted = plans_store.delete(plan_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Plan not found")
    write_audit_event(current_user, "plan", str(plan_id), "delete", f"Deleted plan id {plan_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/work-orders", response_model=WorkOrdersListResponse)
def list_work_orders(
    current_user: dict[str, object] = Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    q: str = Query(default=""),
    status_filter: Literal["all", "open", "in_progress", "done", "overdue", "cancelled"] = Query(default="all"),
    priority_filter: Literal["all", "low", "medium", "high", "critical"] = Query(default="all"),
    sort_by: Literal["work_order_code", "machine_name", "status", "priority"] = Query(default="work_order_code"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
) -> WorkOrdersListResponse:
    all_items = _filter_sort_work_orders(q, status_filter, priority_filter, sort_by, sort_dir)
    paged, meta = paginate_items(all_items, page, page_size)
    return WorkOrdersListResponse(
        items=[WorkOrder(**work_order) for work_order in paged],
        pagination=meta,
    )


@app.get("/api/v1/work-orders/export", response_model=list[WorkOrder])
def export_work_orders(
    current_user: dict[str, object] = Depends(get_current_user),
    q: str = Query(default=""),
    status_filter: Literal["all", "open", "in_progress", "done", "overdue", "cancelled"] = Query(default="all"),
    priority_filter: Literal["all", "low", "medium", "high", "critical"] = Query(default="all"),
    sort_by: Literal["work_order_code", "machine_name", "status", "priority"] = Query(default="work_order_code"),
    sort_dir: Literal["asc", "desc"] = Query(default="asc"),
) -> list[WorkOrder]:
    all_items = _filter_sort_work_orders(q, status_filter, priority_filter, sort_by, sort_dir)
    return [WorkOrder(**work_order) for work_order in all_items]


@app.post("/api/v1/work-orders", response_model=WorkOrder, status_code=status.HTTP_201_CREATED)
def create_work_order(
    payload: WorkOrderCreate,
    current_user: dict[str, object] = Depends(require_permission("can_create_work_orders")),
) -> WorkOrder:
    if work_orders_store.code_exists(payload.work_order_code):
        raise HTTPException(status_code=409, detail="Work order code already exists")

    machine = machines_store.get(payload.machine_id)
    if machine is None:
        raise HTTPException(status_code=400, detail="Machine does not exist")

    work_order = work_orders_store.create({**payload.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()})
    write_audit_event(
        current_user,
        "work_order",
        str(work_order["id"]),
        "create",
        f"Created work order '{work_order['work_order_code']}'",
    )
    return _work_order_with_machine_name(work_order)


@app.get("/api/v1/work-orders/{work_order_id}", response_model=WorkOrder)
def get_work_order(work_order_id: int, current_user: dict[str, object] = Depends(get_current_user)) -> WorkOrder:
    work_order = work_orders_store.get(work_order_id)
    if work_order is None:
        raise HTTPException(status_code=404, detail="Work order not found")
    return _work_order_with_machine_name(work_order)


@app.patch("/api/v1/work-orders/{work_order_id}", response_model=WorkOrder)
def update_work_order(
    work_order_id: int,
    payload: WorkOrderUpdate,
    current_user: dict[str, object] = Depends(require_permission("can_update_work_orders")),
) -> WorkOrder:
    current = work_orders_store.get(work_order_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Work order not found")

    updates = payload.model_dump(exclude_unset=True)
    next_code = updates.get("work_order_code")
    next_machine_id = updates.get("machine_id")

    if next_code and work_orders_store.code_exists(next_code, exclude_id=work_order_id):
        raise HTTPException(status_code=409, detail="Work order code already exists")

    if next_machine_id is not None and machines_store.get(next_machine_id) is None:
        raise HTTPException(status_code=400, detail="Machine does not exist")

    updated = work_orders_store.update(work_order_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Work order not found")

    write_audit_event(
        current_user,
        "work_order",
        str(updated["id"]),
        "update",
        f"Updated work order '{updated['work_order_code']}'",
    )

    return _work_order_with_machine_name(updated)


@app.delete("/api/v1/work-orders/{work_order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order(
    work_order_id: int,
    current_user: dict[str, object] = Depends(require_permission("can_create_work_orders")),
) -> Response:
    deleted = work_orders_store.delete(work_order_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Work order not found")
    write_audit_event(current_user, "work_order", str(work_order_id), "delete", f"Deleted work order id {work_order_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/v1/work-orders/auto-generate", response_model=AutoGenerateWorkOrdersResult)
def auto_generate_work_orders(
    current_user: dict[str, object] = Depends(require_permission("can_create_work_orders")),
) -> AutoGenerateWorkOrdersResult:
    plans = [plan for plan in plans_store.list() if bool(plan.get("is_active", True))]
    work_orders = work_orders_store.list()
    generated = 0
    skipped_existing = 0

    for plan in plans:
        if not _plan_due_soon(str(plan.get("next_due", ""))):
            continue

        machine_id = int(plan.get("machine_id", 0))
        if machine_id <= 0:
            continue

        already_open = any(
            int(w.get("machine_id", 0)) == machine_id
            and str(w.get("status", "")) in {"open", "in_progress", "overdue"}
            and int(w.get("source_plan_id", 0)) == int(plan.get("id", 0))
            for w in work_orders
        )
        if already_open:
            skipped_existing += 1
            continue

        code = _next_auto_work_order_code()
        created = work_orders_store.create(
            {
                "work_order_code": code,
                "machine_id": machine_id,
                "status": "open",
                "priority": "medium",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "source_plan_id": int(plan.get("id", 0)),
            }
        )
        work_orders.append(created)
        generated += 1

    write_audit_event(
        current_user,
        "work_order",
        "auto-generator",
        "create",
        f"Auto-generated {generated} work order(s), skipped {skipped_existing} due to existing open work orders",
    )
    return AutoGenerateWorkOrdersResult(generated=generated, skipped_existing=skipped_existing, scanned_plans=len(plans))


@app.get("/api/v1/failure-logs", response_model=list[FailureLog])
def list_failure_logs(current_user: dict[str, object] = Depends(get_current_user)) -> list[FailureLog]:
    rows = failure_logs_store.list()
    rows.sort(key=lambda row: _safe_parse_datetime(str(row.get("occurred_at", ""))), reverse=True)
    return [_failure_log_with_machine_name(row) for row in rows]


@app.post("/api/v1/failure-logs", response_model=FailureLog, status_code=status.HTTP_201_CREATED)
def create_failure_log(
    payload: FailureLogCreate,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> FailureLog:
    machine = machines_store.get(payload.machine_id)
    if machine is None:
        raise HTTPException(status_code=400, detail="Machine does not exist")

    # Normalize timezone-less values to UTC for consistent trend math.
    occurred_at = _safe_parse_datetime(payload.occurred_at).isoformat()
    created = failure_logs_store.create(
        {
            "machine_id": payload.machine_id,
            "occurred_at": occurred_at,
            "downtime_hours": payload.downtime_hours,
            "repair_cost": payload.repair_cost,
            "root_cause": payload.root_cause,
            "notes": payload.notes,
        }
    )
    write_audit_event(
        current_user,
        "failure_log",
        str(created["id"]),
        "create",
        f"Created failure log for machine '{machine['machine_code']}'",
    )
    return _failure_log_with_machine_name(created)


@app.delete("/api/v1/failure-logs/{failure_log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_failure_log(
    failure_log_id: int,
    current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
) -> Response:
    deleted = failure_logs_store.delete(failure_log_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Failure log not found")

    write_audit_event(current_user, "failure_log", str(failure_log_id), "delete", f"Deleted failure log id {failure_log_id}")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

