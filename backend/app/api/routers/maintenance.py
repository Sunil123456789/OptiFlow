from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field


class PlanCreate(BaseModel):
    plan_code: str = Field(min_length=4, max_length=40)
    machine_id: int = Field(gt=0)
    title: str = Field(min_length=3, max_length=160)
    plan_type: Literal["calendar", "runtime"]
    next_due: str = Field(min_length=2, max_length=80)
    is_active: bool = True


class PlanUpdate(BaseModel):
    plan_code: str | None = Field(default=None, min_length=4, max_length=40)
    machine_id: int | None = Field(default=None, gt=0)
    title: str | None = Field(default=None, min_length=3, max_length=160)
    plan_type: Literal["calendar", "runtime"] | None = None
    next_due: str | None = Field(default=None, min_length=2, max_length=80)
    is_active: bool | None = None


class WorkOrderCreate(BaseModel):
    work_order_code: str = Field(min_length=4, max_length=40)
    machine_id: int = Field(gt=0)
    status: Literal["open", "in_progress", "done", "overdue", "cancelled"]
    priority: Literal["low", "medium", "high", "critical"]


class WorkOrderUpdate(BaseModel):
    work_order_code: str | None = Field(default=None, min_length=4, max_length=40)
    machine_id: int | None = Field(default=None, gt=0)
    status: Literal["open", "in_progress", "done", "overdue", "cancelled"] | None = None
    priority: Literal["low", "medium", "high", "critical"] | None = None


class WorkOrderPartConsumptionCreate(BaseModel):
    part_id: int = Field(gt=0)
    quantity: int = Field(gt=0)
    notes: str = Field(default="", max_length=300)


def _to_dict(item: object) -> dict[str, object]:
    if hasattr(item, "model_dump"):
        return dict(item.model_dump())
    return dict(item)  # type: ignore[arg-type]


def build_maintenance_router(
    *,
    get_current_user: Callable[..., dict[str, object]],
    require_permission: Callable[[str], Callable[..., dict[str, object]]],
    write_audit_event: Callable[[dict[str, object], str, str, str, str], None],
    plans_store: Any,
    work_orders_store: Any,
    work_order_parts_store: Any,
    machines_store: Any,
    spare_parts_store: Any,
    plan_with_machine_name: Callable[[dict[str, object]], Any],
    work_order_with_machine_name: Callable[[dict[str, object]], Any],
    safe_parse_datetime: Callable[[str], datetime],
    plan_due_soon: Callable[[str], bool],
    next_auto_work_order_code: Callable[[], str],
    filter_sort_plans: Callable[..., list[dict[str, object]]],
    filter_sort_work_orders: Callable[..., list[dict[str, object]]],
    paginate_items: Callable[[list[dict[str, object]], int, int], tuple[list[dict[str, object]], Any]],
) -> APIRouter:
    router = APIRouter(tags=["maintenance"])

    @router.get("/api/v1/maintenance-plans")
    def list_plans(
        current_user: dict[str, object] = Depends(get_current_user),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=10, ge=1, le=100),
        q: str = Query(default=""),
        plan_type: Literal["all", "calendar", "runtime"] = Query(default="all"),
        sort_by: Literal["plan_code", "title", "next_due", "machine_name"] = Query(default="plan_code"),
        sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    ) -> dict[str, object]:
        del current_user
        all_items = filter_sort_plans(q, plan_type, sort_by, sort_dir)
        paged, meta = paginate_items(all_items, page, page_size)
        return {"items": paged, "pagination": _to_dict(meta)}

    @router.get("/api/v1/maintenance-plans/export")
    def export_plans(
        current_user: dict[str, object] = Depends(get_current_user),
        q: str = Query(default=""),
        plan_type: Literal["all", "calendar", "runtime"] = Query(default="all"),
        sort_by: Literal["plan_code", "title", "next_due", "machine_name"] = Query(default="plan_code"),
        sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    ) -> list[dict[str, object]]:
        del current_user
        all_items = filter_sort_plans(q, plan_type, sort_by, sort_dir)
        return all_items

    @router.post("/api/v1/maintenance-plans", status_code=status.HTTP_201_CREATED)
    def create_plan(
        payload: PlanCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        if plans_store.code_exists(payload.plan_code):
            raise HTTPException(status_code=409, detail="Plan code already exists")

        machine = machines_store.get(payload.machine_id)
        if machine is None:
            raise HTTPException(status_code=400, detail="Machine does not exist")

        plan = plans_store.create(payload.model_dump())
        write_audit_event(current_user, "plan", str(plan["id"]), "create", f"Created plan '{plan['plan_code']}'")
        return _to_dict(plan_with_machine_name(plan))

    @router.get("/api/v1/maintenance-plans/{plan_id}")
    def get_plan(plan_id: int, current_user: dict[str, object] = Depends(get_current_user)) -> dict[str, object]:
        del current_user
        plan = plans_store.get(plan_id)
        if plan is None:
            raise HTTPException(status_code=404, detail="Plan not found")
        return _to_dict(plan_with_machine_name(plan))

    @router.patch("/api/v1/maintenance-plans/{plan_id}")
    def update_plan(
        plan_id: int,
        payload: PlanUpdate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
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

        write_audit_event(current_user, "plan", str(updated["id"]), "update", f"Updated plan '{updated['plan_code']}'")
        return _to_dict(plan_with_machine_name(updated))

    @router.delete("/api/v1/maintenance-plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_plan(
        plan_id: int,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> Response:
        deleted = plans_store.delete(plan_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Plan not found")
        write_audit_event(current_user, "plan", str(plan_id), "delete", f"Deleted plan id {plan_id}")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/api/v1/work-orders")
    def list_work_orders(
        current_user: dict[str, object] = Depends(get_current_user),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=10, ge=1, le=100),
        q: str = Query(default=""),
        status_filter: Literal["all", "open", "in_progress", "done", "overdue", "cancelled"] = Query(default="all"),
        priority_filter: Literal["all", "low", "medium", "high", "critical"] = Query(default="all"),
        sort_by: Literal["work_order_code", "machine_name", "status", "priority"] = Query(default="work_order_code"),
        sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    ) -> dict[str, object]:
        del current_user
        all_items = filter_sort_work_orders(q, status_filter, priority_filter, sort_by, sort_dir)
        paged, meta = paginate_items(all_items, page, page_size)
        return {"items": paged, "pagination": _to_dict(meta)}

    @router.get("/api/v1/work-orders/export")
    def export_work_orders(
        current_user: dict[str, object] = Depends(get_current_user),
        q: str = Query(default=""),
        status_filter: Literal["all", "open", "in_progress", "done", "overdue", "cancelled"] = Query(default="all"),
        priority_filter: Literal["all", "low", "medium", "high", "critical"] = Query(default="all"),
        sort_by: Literal["work_order_code", "machine_name", "status", "priority"] = Query(default="work_order_code"),
        sort_dir: Literal["asc", "desc"] = Query(default="asc"),
    ) -> list[dict[str, object]]:
        del current_user
        return filter_sort_work_orders(q, status_filter, priority_filter, sort_by, sort_dir)

    @router.post("/api/v1/work-orders", status_code=status.HTTP_201_CREATED)
    def create_work_order(
        payload: WorkOrderCreate,
        current_user: dict[str, object] = Depends(require_permission("can_create_work_orders")),
    ) -> dict[str, object]:
        if work_orders_store.code_exists(payload.work_order_code):
            raise HTTPException(status_code=409, detail="Work order code already exists")
        machine = machines_store.get(payload.machine_id)
        if machine is None:
            raise HTTPException(status_code=400, detail="Machine does not exist")

        work_order = work_orders_store.create({**payload.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()})
        write_audit_event(current_user, "work_order", str(work_order["id"]), "create", f"Created work order '{work_order['work_order_code']}'")
        return _to_dict(work_order_with_machine_name(work_order))

    @router.get("/api/v1/work-orders/{work_order_id}")
    def get_work_order(work_order_id: int, current_user: dict[str, object] = Depends(get_current_user)) -> dict[str, object]:
        del current_user
        work_order = work_orders_store.get(work_order_id)
        if work_order is None:
            raise HTTPException(status_code=404, detail="Work order not found")
        return _to_dict(work_order_with_machine_name(work_order))

    @router.patch("/api/v1/work-orders/{work_order_id}")
    def update_work_order(
        work_order_id: int,
        payload: WorkOrderUpdate,
        current_user: dict[str, object] = Depends(require_permission("can_update_work_orders")),
    ) -> dict[str, object]:
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

        write_audit_event(current_user, "work_order", str(updated["id"]), "update", f"Updated work order '{updated['work_order_code']}'")
        return _to_dict(work_order_with_machine_name(updated))

    @router.get("/api/v1/work-orders/{work_order_id}/parts")
    def list_work_order_consumptions(
        work_order_id: int,
        current_user: dict[str, object] = Depends(get_current_user),
    ) -> list[dict[str, object]]:
        del current_user
        work_order = work_orders_store.get(work_order_id)
        if work_order is None:
            raise HTTPException(status_code=404, detail="Work order not found")
        rows = work_order_parts_store.list_by_work_order(work_order_id)
        rows.sort(key=lambda row: safe_parse_datetime(str(row.get("consumed_at", ""))), reverse=True)
        return [dict(row) for row in rows]

    @router.post("/api/v1/work-orders/{work_order_id}/parts/consume", status_code=status.HTTP_201_CREATED)
    def consume_work_order_part(
        work_order_id: int,
        payload: WorkOrderPartConsumptionCreate,
        current_user: dict[str, object] = Depends(require_permission("can_update_work_orders")),
    ) -> dict[str, object]:
        work_order = work_orders_store.get(work_order_id)
        if work_order is None:
            raise HTTPException(status_code=404, detail="Work order not found")
        if str(work_order.get("status", "")) == "cancelled":
            raise HTTPException(status_code=400, detail="Cannot consume parts for cancelled work order")

        part = spare_parts_store.get(payload.part_id)
        if part is None:
            raise HTTPException(status_code=404, detail="Spare part not found")
        if not bool(part.get("is_active", True)):
            raise HTTPException(status_code=400, detail="Cannot consume an inactive spare part")

        stock_qty = int(part.get("stock_qty", 0))
        if stock_qty < payload.quantity:
            raise HTTPException(status_code=409, detail="Insufficient stock quantity")

        updated_part = spare_parts_store.update(payload.part_id, {"stock_qty": stock_qty - payload.quantity})
        if updated_part is None:
            raise HTTPException(status_code=404, detail="Spare part not found")

        unit_cost = round(float(part.get("unit_cost", 0)), 2)
        created = work_order_parts_store.create(
            {
                "work_order_id": work_order_id,
                "part_id": payload.part_id,
                "part_code": str(part.get("part_code", "")),
                "part_name": str(part.get("name", "")),
                "quantity": payload.quantity,
                "unit_cost": unit_cost,
                "total_cost": round(unit_cost * payload.quantity, 2),
                "consumed_at": datetime.now(timezone.utc).isoformat(),
                "consumed_by": str(current_user.get("email", "")),
                "notes": payload.notes,
            }
        )

        write_audit_event(current_user, "work_order", str(work_order_id), "update", f"Consumed {payload.quantity} x {part.get('part_code', '')} for work order '{work_order.get('work_order_code', '')}'")
        write_audit_event(current_user, "spare_part", str(payload.part_id), "update", f"Consumed {payload.quantity} unit(s); remaining stock {updated_part.get('stock_qty', 0)}")
        return dict(created)

    @router.delete("/api/v1/work-orders/{work_order_id}/parts/{consumption_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_work_order_consumption(
        work_order_id: int,
        consumption_id: int,
        current_user: dict[str, object] = Depends(require_permission("can_update_work_orders")),
    ) -> Response:
        work_order = work_orders_store.get(work_order_id)
        if work_order is None:
            raise HTTPException(status_code=404, detail="Work order not found")

        consumption = work_order_parts_store.get(consumption_id)
        if consumption is None or int(consumption.get("work_order_id", 0)) != work_order_id:
            raise HTTPException(status_code=404, detail="Consumption record not found")

        part_id = int(consumption.get("part_id", 0))
        quantity = int(consumption.get("quantity", 0))
        part = spare_parts_store.get(part_id)
        if part is not None:
            stock_qty = int(part.get("stock_qty", 0))
            spare_parts_store.update(part_id, {"stock_qty": stock_qty + quantity})

        deleted = work_order_parts_store.delete(consumption_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Consumption record not found")

        write_audit_event(current_user, "work_order", str(work_order_id), "update", f"Reversed part consumption record {consumption_id} for work order '{work_order.get('work_order_code', '')}'")
        if part_id > 0:
            write_audit_event(current_user, "spare_part", str(part_id), "update", f"Restored stock after reversing consumption record {consumption_id}")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.delete("/api/v1/work-orders/{work_order_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_work_order(
        work_order_id: int,
        current_user: dict[str, object] = Depends(require_permission("can_create_work_orders")),
    ) -> Response:
        deleted = work_orders_store.delete(work_order_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Work order not found")
        write_audit_event(current_user, "work_order", str(work_order_id), "delete", f"Deleted work order id {work_order_id}")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.post("/api/v1/work-orders/auto-generate")
    def auto_generate_work_orders(
        current_user: dict[str, object] = Depends(require_permission("can_create_work_orders")),
    ) -> dict[str, object]:
        plans = [plan for plan in plans_store.list() if bool(plan.get("is_active", True))]
        work_orders = work_orders_store.list()
        generated = 0
        skipped_existing = 0

        for plan in plans:
            if not plan_due_soon(str(plan.get("next_due", ""))):
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

            code = next_auto_work_order_code()
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

        write_audit_event(current_user, "work_order", "auto-generator", "create", f"Auto-generated {generated} work order(s), skipped {skipped_existing} due to existing open work orders")
        return {"generated": generated, "skipped_existing": skipped_existing, "scanned_plans": len(plans)}

    return router
