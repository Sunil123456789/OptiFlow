from collections.abc import Callable
from math import ceil
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field


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


class DepartmentCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    is_active: bool = True


class LineCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    department_code: str = Field(min_length=2, max_length=30)
    is_active: bool = True


class StationCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    line_code: str = Field(min_length=2, max_length=30)
    is_active: bool = True


def _sort_key(value: object) -> str:
    return str(value).lower()


def _paginate(items: list[dict[str, object]], page: int, page_size: int) -> dict[str, object]:
    total = len(items)
    total_pages = max(1, ceil(total / page_size))
    normalized_page = min(page, total_pages)
    start = (normalized_page - 1) * page_size
    end = start + page_size
    return {
        "items": items[start:end],
        "pagination": {
            "page": normalized_page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
        },
    }


def build_assets_router(
    *,
    get_current_user: Callable[..., dict[str, object]],
    require_permission: Callable[[str], Callable[..., dict[str, object]]],
    write_audit_event: Callable[[dict[str, object], str, str, str, str], None],
    machines_store: Any,
    spare_parts_store: Any,
    departments_store: Any,
    lines_store: Any,
    stations_store: Any,
) -> APIRouter:
    router = APIRouter(tags=["assets"])

    @router.get("/api/v1/departments")
    def list_departments(current_user: dict[str, object] = Depends(get_current_user)) -> list[dict[str, object]]:
        del current_user
        return [dict(item) for item in departments_store.list()]

    @router.post("/api/v1/departments", status_code=status.HTTP_201_CREATED)
    def create_department(
        payload: DepartmentCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        code = payload.code.strip().upper()
        if departments_store.code_exists(code):
            raise HTTPException(status_code=409, detail="Department code already exists")

        created = departments_store.create({"code": code, "name": payload.name, "is_active": payload.is_active})
        write_audit_event(current_user, "department", str(created["code"]), "create", f"Created department '{created['code']}'")
        return dict(created)

    @router.delete("/api/v1/departments/{department_code}", status_code=status.HTTP_204_NO_CONTENT)
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

    @router.get("/api/v1/lines")
    def list_lines(current_user: dict[str, object] = Depends(get_current_user)) -> list[dict[str, object]]:
        del current_user
        return [dict(item) for item in lines_store.list()]

    @router.post("/api/v1/lines", status_code=status.HTTP_201_CREATED)
    def create_line(
        payload: LineCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
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
        return dict(created)

    @router.delete("/api/v1/lines/{line_code}", status_code=status.HTTP_204_NO_CONTENT)
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

    @router.get("/api/v1/stations")
    def list_stations(current_user: dict[str, object] = Depends(get_current_user)) -> list[dict[str, object]]:
        del current_user
        return [dict(item) for item in stations_store.list()]

    @router.post("/api/v1/stations", status_code=status.HTTP_201_CREATED)
    def create_station(
        payload: StationCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        code = payload.code.strip().upper()
        line_code = payload.line_code.strip().upper()
        if stations_store.code_exists(code):
            raise HTTPException(status_code=409, detail="Station code already exists")
        if not lines_store.code_exists(line_code):
            raise HTTPException(status_code=400, detail="Line does not exist")

        created = stations_store.create({"code": code, "name": payload.name, "line_code": line_code, "is_active": payload.is_active})
        write_audit_event(current_user, "station", str(created["code"]), "create", f"Created station '{created['code']}'")
        return dict(created)

    @router.delete("/api/v1/stations/{station_code}", status_code=status.HTTP_204_NO_CONTENT)
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

    @router.get("/api/v1/machines")
    def list_machines(
        current_user: dict[str, object] = Depends(get_current_user),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=10, ge=1, le=100),
        q: str = Query(default=""),
        sort_by: Literal["machine_code", "name", "criticality", "status"] = Query(default="machine_code"),
        sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    ) -> dict[str, object]:
        del current_user
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
        return _paginate(all_items, page, page_size)

    @router.get("/api/v1/machines/export")
    def export_machines(
        current_user: dict[str, object] = Depends(get_current_user),
        q: str = Query(default=""),
        sort_by: Literal["machine_code", "name", "criticality", "status"] = Query(default="machine_code"),
        sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    ) -> list[dict[str, object]]:
        del current_user
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

    @router.post("/api/v1/machines", status_code=status.HTTP_201_CREATED)
    def create_machine(
        payload: MachineCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        if machines_store.code_exists(payload.machine_code):
            raise HTTPException(status_code=409, detail="Machine code already exists")

        machine = machines_store.create(payload.model_dump())
        write_audit_event(current_user, "machine", str(machine["id"]), "create", f"Created machine '{machine['machine_code']}'")
        return dict(machine)

    @router.get("/api/v1/machines/{machine_id}")
    def get_machine(machine_id: int, current_user: dict[str, object] = Depends(get_current_user)) -> dict[str, object]:
        del current_user
        machine = machines_store.get(machine_id)
        if machine is None:
            raise HTTPException(status_code=404, detail="Machine not found")
        return dict(machine)

    @router.patch("/api/v1/machines/{machine_id}")
    def update_machine(
        machine_id: int,
        payload: MachineUpdate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
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
        write_audit_event(current_user, "machine", str(updated["id"]), "update", f"Updated machine '{updated['machine_code']}'")
        return dict(updated)

    @router.delete("/api/v1/machines/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_machine(
        machine_id: int,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> Response:
        deleted = machines_store.delete(machine_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Machine not found")
        write_audit_event(current_user, "machine", str(machine_id), "delete", f"Deleted machine id {machine_id}")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/api/v1/spare-parts")
    def list_spare_parts(
        current_user: dict[str, object] = Depends(get_current_user),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=10, ge=1, le=100),
        q: str = Query(default=""),
        low_stock_only: bool = Query(default=False),
        sort_by: Literal["part_code", "name", "category", "stock_qty", "reorder_level", "unit_cost", "is_active"] = Query(default="part_code"),
        sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    ) -> dict[str, object]:
        del current_user
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
        return _paginate(all_items, page, page_size)

    @router.get("/api/v1/spare-parts/export")
    def export_spare_parts(
        current_user: dict[str, object] = Depends(get_current_user),
        q: str = Query(default=""),
        low_stock_only: bool = Query(default=False),
        sort_by: Literal["part_code", "name", "category", "stock_qty", "reorder_level", "unit_cost", "is_active"] = Query(default="part_code"),
        sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    ) -> list[dict[str, object]]:
        payload = list_spare_parts(
            current_user=current_user,
            page=1,
            page_size=10_000,
            q=q,
            low_stock_only=low_stock_only,
            sort_by=sort_by,
            sort_dir=sort_dir,
        )
        return list(payload["items"])

    @router.post("/api/v1/spare-parts", status_code=status.HTTP_201_CREATED)
    def create_spare_part(
        payload: SparePartCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        part_code = payload.part_code.strip().upper()
        if spare_parts_store.code_exists(part_code):
            raise HTTPException(status_code=409, detail="Part code already exists")

        created = spare_parts_store.create(
            {
                **payload.model_dump(),
                "part_code": part_code,
                "name": payload.name.strip(),
                "category": payload.category.strip(),
            }
        )
        write_audit_event(current_user, "spare_part", str(created["id"]), "create", f"Created spare part '{created['part_code']}'")
        return dict(created)

    @router.patch("/api/v1/spare-parts/{part_id}")
    def update_spare_part(
        part_id: int,
        payload: SparePartUpdate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        existing = spare_parts_store.get(part_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Spare part not found")

        updates = payload.model_dump(exclude_unset=True)
        next_code = updates.get("part_code")
        if isinstance(next_code, str):
            normalized = next_code.strip().upper()
            if spare_parts_store.code_exists(normalized, exclude_id=part_id):
                raise HTTPException(status_code=409, detail="Part code already exists")
            updates["part_code"] = normalized

        if isinstance(updates.get("name"), str):
            updates["name"] = str(updates["name"]).strip()
        if isinstance(updates.get("category"), str):
            updates["category"] = str(updates["category"]).strip()

        updated = spare_parts_store.update(part_id, updates)
        if updated is None:
            raise HTTPException(status_code=404, detail="Spare part not found")

        write_audit_event(current_user, "spare_part", str(updated["id"]), "update", f"Updated spare part '{updated['part_code']}'")
        return dict(updated)

    @router.delete("/api/v1/spare-parts/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_spare_part(
        part_id: int,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> Response:
        deleted = spare_parts_store.delete(part_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Spare part not found")
        write_audit_event(current_user, "spare_part", str(part_id), "delete", f"Deleted spare part id {part_id}")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
