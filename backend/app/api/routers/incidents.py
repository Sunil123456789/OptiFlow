from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field


class FailureLogCreate(BaseModel):
    machine_id: int = Field(gt=0)
    occurred_at: str = Field(min_length=10, max_length=40)
    severity: Literal["low", "medium", "high", "critical"] = "medium"
    downtime_hours: float = Field(gt=0)
    repair_cost: float = Field(ge=0)
    root_cause: str = Field(min_length=3, max_length=200)
    notes: str = Field(default="", max_length=500)


class FailureLogSlaUpdate(BaseModel):
    severity: Literal["low", "medium", "high", "critical"] | None = None
    response_started_at: str | None = None
    resolved_at: str | None = None


class AlertDispatchTickRequest(BaseModel):
    force: bool = False


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


def _to_dict(item: object) -> dict[str, object]:
    if hasattr(item, "model_dump"):
        return dict(item.model_dump())
    return dict(item)  # type: ignore[arg-type]


def build_incidents_router(
    *,
    get_current_user: Callable[..., dict[str, object]],
    require_permission: Callable[[str], Callable[..., dict[str, object]]],
    write_audit_event: Callable[[dict[str, object], str, str, str, str], None],
    failure_logs_store: Any,
    machines_store: Any,
    alerts_store: Any,
    alert_deliveries_store: Any,
    alert_delivery_settings_store: Any,
    failure_log_with_machine_name: Callable[[dict[str, object]], Any],
    safe_parse_datetime: Callable[[str], datetime],
    parse_date_param: Callable[[str, bool], datetime | None],
    decorate_alerts_with_state: Callable[[list[dict[str, object]]], list[Any]],
    build_alert_candidates: Callable[[], list[dict[str, object]]],
    get_alert_delivery_settings: Callable[[], Any],
    dispatch_alert_to_channels: Callable[[Any, Any], list[Any]],
) -> APIRouter:
    router = APIRouter(tags=["incidents"])

    @router.get("/api/v1/failure-logs")
    def list_failure_logs(current_user: dict[str, object] = Depends(get_current_user)) -> list[dict[str, object]]:
        del current_user
        rows = failure_logs_store.list()
        rows.sort(key=lambda row: safe_parse_datetime(str(row.get("occurred_at", ""))), reverse=True)
        return [_to_dict(failure_log_with_machine_name(row)) for row in rows]

    @router.get("/api/v1/failure-logs/export")
    def export_failure_logs(
        current_user: dict[str, object] = Depends(get_current_user),
        start_date: str = Query(default=""),
        end_date: str = Query(default=""),
        sla_status: Literal["all", "open", "at_risk", "breached", "met"] = Query(default="all"),
    ) -> list[dict[str, object]]:
        del current_user
        rows = [failure_log_with_machine_name(row) for row in failure_logs_store.list()]
        start_at = parse_date_param(start_date, False)
        end_at = parse_date_param(end_date, True)

        filtered = []
        for row in rows:
            occurred_at = safe_parse_datetime(row.occurred_at)
            if start_at is not None and occurred_at < start_at:
                continue
            if end_at is not None and occurred_at > end_at:
                continue
            if sla_status != "all" and row.sla_status != sla_status:
                continue
            filtered.append(_to_dict(row))

        filtered.sort(key=lambda row: safe_parse_datetime(str(row.get("occurred_at", ""))), reverse=True)
        return filtered

    @router.get("/api/v1/alerts")
    def list_alerts(
        current_user: dict[str, object] = Depends(get_current_user),
        status_filter: Literal["all", "open", "acknowledged"] = Query(default="all"),
    ) -> list[dict[str, object]]:
        del current_user
        items = decorate_alerts_with_state(build_alert_candidates())
        if status_filter == "open":
            return [_to_dict(item) for item in items if item.status == "open"]
        if status_filter == "acknowledged":
            return [_to_dict(item) for item in items if item.status == "acknowledged"]
        return [_to_dict(item) for item in items]

    @router.get("/api/v1/alerts/delivery-attempts")
    def list_alert_delivery_attempts(
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
        alert_id: str = Query(default=""),
        channel: Literal["all", "email", "webhook"] = Query(default="all"),
        status_filter: Literal["all", "sent", "failed", "skipped"] = Query(default="all"),
        since_hours: int = Query(default=0, ge=0, le=24 * 30),
        limit: int = Query(default=100, ge=1, le=500),
    ) -> list[dict[str, object]]:
        del current_user
        selected_channel = "" if channel == "all" else channel
        selected_status = "" if status_filter == "all" else status_filter
        since_at = None
        if since_hours > 0:
            since_at = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()
        rows = alert_deliveries_store.list(
            alert_id=alert_id.strip() or None,
            channel=selected_channel or None,
            status=selected_status or None,
            since_at=since_at,
            limit=limit,
        )
        return [dict(row) for row in rows]

    @router.get("/api/v1/alerts/delivery-stats")
    def get_alert_delivery_stats(
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
        since_hours: int = Query(default=24, ge=1, le=24 * 30),
    ) -> dict[str, object]:
        del current_user
        since_at = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()
        rows = alert_deliveries_store.list(since_at=since_at)
        sent = len([row for row in rows if str(row.get("status", "")) == "sent"])
        failed = len([row for row in rows if str(row.get("status", "")) == "failed"])
        skipped = len([row for row in rows if str(row.get("status", "")) == "skipped"])
        return {"sent": sent, "failed": failed, "skipped": skipped, "window_hours": since_hours}

    @router.get("/api/v1/alerts/delivery-settings")
    def get_delivery_settings(current_user: dict[str, object] = Depends(require_permission("can_manage_assets"))) -> dict[str, object]:
        del current_user
        return _to_dict(get_alert_delivery_settings())

    @router.patch("/api/v1/alerts/delivery-settings")
    def update_alert_delivery_settings(
        payload: AlertDeliverySettingsUpdate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        updates = payload.model_dump(exclude_unset=True)
        if "email_to" in updates:
            updates["email_to"] = str(updates["email_to"] or "").strip()
            if updates["email_to"] and "@" not in updates["email_to"]:
                raise HTTPException(status_code=400, detail="email_to must be a valid email address")
        if "webhook_url" in updates:
            updates["webhook_url"] = str(updates["webhook_url"] or "").strip()
            if updates["webhook_url"] and not str(updates["webhook_url"]).startswith(("http://", "https://")):
                raise HTTPException(status_code=400, detail="webhook_url must start with http:// or https://")

        alert_delivery_settings_store.update(updates)
        current = get_alert_delivery_settings()
        write_audit_event(current_user, "alert", "delivery-settings", "update", "Updated alert delivery settings")
        return _to_dict(current)

    @router.post("/api/v1/alerts/dispatch-open")
    def dispatch_open_alerts(
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        candidates = decorate_alerts_with_state(build_alert_candidates())
        open_alerts = [item for item in candidates if item.status == "open"]
        delivery_settings = get_alert_delivery_settings()
        dispatched: list[Any] = []
        for alert in open_alerts:
            dispatched.extend(dispatch_alert_to_channels(alert, delivery_settings))

        sent = len([item for item in dispatched if item.status == "sent"])
        failed = len([item for item in dispatched if item.status == "failed"])
        skipped = len([item for item in dispatched if item.status == "skipped"])
        write_audit_event(current_user, "alert", "dispatch-open", "update", f"Dispatched open alerts: requested={len(open_alerts)} sent={sent} failed={failed} skipped={skipped}")
        return {
            "requested": len(open_alerts),
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "results": [_to_dict(item) for item in dispatched],
        }

    @router.post("/api/v1/alerts/dispatch-tick")
    def dispatch_alerts_tick(
        payload: AlertDispatchTickRequest,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        delivery_settings = get_alert_delivery_settings()
        if not payload.force and not delivery_settings.auto_dispatch_enabled:
            return {"requested": 0, "sent": 0, "failed": 0, "skipped": 0, "results": [], "note": "Auto dispatch is disabled"}

        candidates = decorate_alerts_with_state(build_alert_candidates())
        open_alerts = [item for item in candidates if item.status == "open"]
        dispatched: list[Any] = []
        for alert in open_alerts:
            dispatched.extend(dispatch_alert_to_channels(alert, delivery_settings))

        sent = len([item for item in dispatched if item.status == "sent"])
        failed = len([item for item in dispatched if item.status == "failed"])
        skipped = len([item for item in dispatched if item.status == "skipped"])
        write_audit_event(current_user, "alert", "dispatch-tick", "update", f"Dispatch tick processed={len(open_alerts)} sent={sent} failed={failed} skipped={skipped}")
        return {
            "requested": len(open_alerts),
            "sent": sent,
            "failed": failed,
            "skipped": skipped,
            "results": [_to_dict(item) for item in dispatched],
            "note": "Tick completed",
        }

    @router.post("/api/v1/alerts/{alert_id}/acknowledge")
    def acknowledge_alert(
        alert_id: str,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        candidates = build_alert_candidates()
        target = next((row for row in candidates if str(row.get("id", "")) == alert_id), None)
        if target is None:
            raise HTTPException(status_code=404, detail="Alert not found")

        state = alerts_store.acknowledge(alert_id, str(current_user["email"]))
        write_audit_event(current_user, "alert", alert_id, "update", f"Acknowledged alert '{alert_id}'")

        return {
            "id": str(target["id"]),
            "rule_type": str(target["rule_type"]),
            "severity": str(target["severity"]),
            "title": str(target["title"]),
            "description": str(target["description"]),
            "triggered_at": str(target["triggered_at"]),
            "status": "acknowledged",
            "machine_id": int(target["machine_id"]) if target.get("machine_id") is not None else None,
            "machine_name": str(target["machine_name"]) if target.get("machine_name") else None,
            "plan_id": int(target["plan_id"]) if target.get("plan_id") is not None else None,
            "batch_id": str(target["batch_id"]) if target.get("batch_id") else None,
            "acknowledged_at": str(state.get("acknowledged_at")),
            "acknowledged_by": str(state.get("acknowledged_by")),
        }

    @router.post("/api/v1/failure-logs", status_code=status.HTTP_201_CREATED)
    def create_failure_log(
        payload: FailureLogCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        machine = machines_store.get(payload.machine_id)
        if machine is None:
            raise HTTPException(status_code=400, detail="Machine does not exist")

        occurred_at = safe_parse_datetime(payload.occurred_at).isoformat()
        created = failure_logs_store.create(
            {
                "machine_id": payload.machine_id,
                "occurred_at": occurred_at,
                "severity": payload.severity,
                "downtime_hours": payload.downtime_hours,
                "repair_cost": payload.repair_cost,
                "root_cause": payload.root_cause,
                "notes": payload.notes,
            }
        )
        write_audit_event(current_user, "failure_log", str(created["id"]), "create", f"Created failure log for machine '{machine['machine_code']}'")
        return _to_dict(failure_log_with_machine_name(created))

    @router.delete("/api/v1/failure-logs/{failure_log_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_failure_log(
        failure_log_id: int,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> Response:
        deleted = failure_logs_store.delete(failure_log_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Failure log not found")
        write_audit_event(current_user, "failure_log", str(failure_log_id), "delete", f"Deleted failure log id {failure_log_id}")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.patch("/api/v1/failure-logs/{failure_log_id}/sla")
    def update_failure_log_sla(
        failure_log_id: int,
        payload: FailureLogSlaUpdate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, object]:
        existing = failure_logs_store.get(failure_log_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Failure log not found")

        updates = payload.model_dump(exclude_unset=True)
        if "response_started_at" in updates and updates["response_started_at"]:
            updates["response_started_at"] = safe_parse_datetime(str(updates["response_started_at"])).isoformat()
        if "resolved_at" in updates and updates["resolved_at"]:
            updates["resolved_at"] = safe_parse_datetime(str(updates["resolved_at"])).isoformat()

        updated = failure_logs_store.update(failure_log_id, updates)
        if updated is None:
            raise HTTPException(status_code=404, detail="Failure log not found")

        write_audit_event(current_user, "failure_log", str(failure_log_id), "update", f"Updated SLA metadata for failure log {failure_log_id}")
        return _to_dict(failure_log_with_machine_name(updated))

    @router.get("/api/v1/failure-logs/sla-summary")
    def failure_log_sla_summary(current_user: dict[str, object] = Depends(get_current_user)) -> dict[str, int]:
        del current_user
        rows = [failure_log_with_machine_name(item) for item in failure_logs_store.list()]
        return {
            "open_alerts": len([row for row in rows if row.sla_status == "open"]),
            "at_risk": len([row for row in rows if row.sla_status == "at_risk"]),
            "breached": len([row for row in rows if row.sla_status == "breached"]),
            "met": len([row for row in rows if row.sla_status == "met"]),
        }

    return router
