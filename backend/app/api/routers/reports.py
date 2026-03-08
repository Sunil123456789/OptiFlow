from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query


def build_reports_router(
    *,
    get_current_user: Callable[..., dict[str, object]],
    parse_date_param: Callable[[str, bool], datetime | None],
    build_reliability_report: Callable[[datetime, datetime], Any],
) -> APIRouter:
    router = APIRouter(tags=["reports"])

    @router.get("/api/v1/reports/reliability")
    def reliability_report(
        current_user: dict[str, object] = Depends(get_current_user),
        start_date: str = Query(default=""),
        end_date: str = Query(default=""),
    ) -> object:
        del current_user
        now = datetime.now(timezone.utc)
        start_at = parse_date_param(start_date, False) or (now - timedelta(days=29)).replace(
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
        end_at = parse_date_param(end_date, True) or now
        if end_at < start_at:
            raise HTTPException(status_code=400, detail="end_date must be after start_date")
        return build_reliability_report(start_at, end_at)

    return router
