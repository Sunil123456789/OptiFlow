from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query


def build_dashboard_router(
    *,
    get_current_user: Callable[..., dict[str, object]],
    machines_store: Any,
    work_orders_store: Any,
    failure_logs_store: Any,
    safe_parse_datetime: Callable[[str], datetime],
) -> APIRouter:
    router = APIRouter(tags=["dashboard"])

    @router.get("/api/v1/dashboard/summary")
    def dashboard_summary(current_user: dict[str, object] = Depends(get_current_user)) -> dict[str, object]:
        del current_user
        work_orders = work_orders_store.list()
        failures = failure_logs_store.list()
        open_count = len([w for w in work_orders if w["status"] == "open"])
        overdue_count = len([w for w in work_orders if w["status"] == "overdue"])

        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        recent_failures = [f for f in failures if safe_parse_datetime(str(f.get("occurred_at", ""))) >= cutoff]
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

    @router.get("/api/v1/dashboard/kpi-trends")
    def dashboard_kpi_trends(
        current_user: dict[str, object] = Depends(get_current_user),
        days: int = Query(default=14, ge=7, le=90),
    ) -> list[dict[str, object]]:
        del current_user
        failures = failure_logs_store.list()
        today = datetime.now(timezone.utc).date()
        start_day = today - timedelta(days=days - 1)
        buckets: dict[str, dict[str, float | int]] = {}

        for i in range(days):
            day = start_day + timedelta(days=i)
            key = day.isoformat()
            buckets[key] = {"failures": 0, "downtime_hours": 0.0, "repair_cost": 0.0}

        for item in failures:
            event_at = safe_parse_datetime(str(item.get("occurred_at", "")))
            key = event_at.date().isoformat()
            if key not in buckets:
                continue

            buckets[key]["failures"] = int(buckets[key]["failures"]) + 1
            buckets[key]["downtime_hours"] = float(buckets[key]["downtime_hours"]) + float(item.get("downtime_hours", 0))
            buckets[key]["repair_cost"] = float(buckets[key]["repair_cost"]) + float(item.get("repair_cost", 0))

        return [
            {
                "day": day,
                "failures": int(values["failures"]),
                "downtime_hours": round(float(values["downtime_hours"]), 2),
                "repair_cost": round(float(values["repair_cost"]), 2),
            }
            for day, values in sorted(buckets.items(), key=lambda row: row[0])
        ]

    @router.get("/api/v1/dashboard/kpi-trends/export")
    def export_dashboard_kpi_trends(
        current_user: dict[str, object] = Depends(get_current_user),
        days: int = Query(default=30, ge=7, le=180),
    ) -> list[dict[str, object]]:
        return dashboard_kpi_trends(current_user=current_user, days=days)

    return router
