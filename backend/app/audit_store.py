import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


class AuditStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "audit_logs.json"
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
            rows.sort(key=lambda row: int(row["id"]), reverse=True)
            return rows

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            rows = self._read()
            next_id = max((int(row["id"]) for row in rows), default=0) + 1
            created = {
                "id": next_id,
                "event_at": datetime.now(timezone.utc).isoformat(),
                "actor_user_id": int(payload["actor_user_id"]),
                "actor_email": str(payload["actor_email"]),
                "actor_role": str(payload["actor_role"]),
                "entity_type": str(payload["entity_type"]),
                "entity_id": str(payload["entity_id"]),
                "action": str(payload["action"]),
                "summary": str(payload["summary"]),
            }
            rows.append(created)
            self._write(rows)
            return created
