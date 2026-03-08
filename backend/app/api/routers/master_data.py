from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class MasterImportCsvPayload(BaseModel):
    csv_text: str = Field(min_length=20)
    dry_run: bool = False
    source_file_name: str = Field(default="", max_length=200)


def build_master_data_router(
    *,
    require_permission: Callable[[str], Callable[..., dict[str, object]]],
    build_master_import_plan: Callable[[str], dict[str, object]],
    apply_master_import_plan: Callable[[dict[str, object]], list[dict[str, object]]],
    rollback_import_changes: Callable[[list[dict[str, object]]], int],
    import_history_store: Any,
    write_audit_event: Callable[[dict[str, object], str, str, str, str], None],
) -> APIRouter:
    router = APIRouter(tags=["master-data"])

    @router.post("/api/v1/master-data/import-csv")
    def import_master_data_csv(
        payload: MasterImportCsvPayload,
        current_user: dict[str, object] = Depends(require_permission("can_import_master_data")),
    ) -> dict[str, object]:
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

        return {
            "batch_id": str(history_item["batch_id"]),
            "dry_run": bool(history_item["dry_run"]),
            "departments_created": int(summary["departments_created"]),
            "departments_updated": int(summary["departments_updated"]),
            "lines_created": int(summary["lines_created"]),
            "lines_updated": int(summary["lines_updated"]),
            "stations_created": int(summary["stations_created"]),
            "stations_updated": int(summary["stations_updated"]),
            "skipped_rows": int(summary["skipped_rows"]),
        }

    @router.get("/api/v1/master-data/import-history")
    def list_master_import_history(
        current_user: dict[str, object] = Depends(require_permission("can_import_master_data")),
    ) -> list[dict[str, object]]:
        del current_user
        return [dict(item) for item in import_history_store.list()]

    @router.post("/api/v1/master-data/import-history/{batch_id}/rollback")
    def rollback_master_import_batch(
        batch_id: str,
        current_user: dict[str, object] = Depends(require_permission("can_import_master_data")),
    ) -> dict[str, object]:
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
        return {"batch_id": batch_id, "rolled_back_changes": rolled_back}

    return router
