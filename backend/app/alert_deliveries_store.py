import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


class AlertDeliveriesStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "alert_deliveries.json"
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

    def list(self, alert_id: str | None = None, channel: str | None = None, limit: int | None = None) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._read()
            if alert_id:
                rows = [row for row in rows if str(row.get("alert_id", "")) == alert_id]
            if channel:
                rows = [row for row in rows if str(row.get("channel", "")) == channel]
            rows.sort(key=lambda row: str(row.get("attempted_at", "")), reverse=True)
            if limit is not None and limit > 0:
                return rows[:limit]
            return rows

    def count_attempts(self, alert_id: str, channel: str) -> int:
        with self._lock:
            rows = self._read()
            return len(
                [
                    row
                    for row in rows
                    if str(row.get("alert_id", "")) == alert_id and str(row.get("channel", "")) == channel
                ]
            )

    def has_success(self, alert_id: str, channel: str) -> bool:
        with self._lock:
            rows = self._read()
            return any(
                str(row.get("alert_id", "")) == alert_id
                and str(row.get("channel", "")) == channel
                and str(row.get("status", "")) == "sent"
                for row in rows
            )

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            rows = self._read()
            next_id = max([int(row.get("id", 0)) for row in rows], default=0) + 1
            created = {
                "id": next_id,
                "attempted_at": datetime.now(timezone.utc).isoformat(),
                **payload,
            }
            rows.append(created)
            self._write(rows)
            return created
