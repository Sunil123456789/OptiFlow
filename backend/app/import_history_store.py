import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4


class ImportHistoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "import_history.json"
        self._ensure_file_exists()

    def _ensure_file_exists(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._file_path.exists():
            self._write([])

    def _read(self) -> list[dict[str, Any]]:
        with self._file_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _write(self, data: list[dict[str, Any]]) -> None:
        with self._file_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=2)

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._read()
            rows.sort(key=lambda row: str(row.get("created_at", "")), reverse=True)
            return rows

    def get(self, batch_id: str) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            return next((row for row in rows if str(row.get("batch_id", "")) == batch_id), None)

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            rows = self._read()
            created = {
                "batch_id": str(payload.get("batch_id") or uuid4()),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "actor_email": str(payload["actor_email"]),
                "source_file_name": str(payload.get("source_file_name", "")),
                "dry_run": bool(payload.get("dry_run", False)),
                "rollback_applied": bool(payload.get("rollback_applied", False)),
                "summary": dict(payload.get("summary", {})),
                "changes": list(payload.get("changes", [])),
            }
            rows.append(created)
            self._write(rows)
            return created

    def mark_rollback_applied(self, batch_id: str) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            idx = next((i for i, row in enumerate(rows) if str(row.get("batch_id", "")) == batch_id), -1)
            if idx < 0:
                return None
            rows[idx]["rollback_applied"] = True
            self._write(rows)
            return rows[idx]
