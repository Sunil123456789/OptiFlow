import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any


class AlertsStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "alerts_state.json"
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
            return self._read()

    def get(self, alert_id: str) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            return next((row for row in rows if str(row.get("id", "")) == alert_id), None)

    def acknowledge(self, alert_id: str, actor_email: str) -> dict[str, Any]:
        with self._lock:
            rows = self._read()
            now = datetime.now(timezone.utc).isoformat()
            for index, row in enumerate(rows):
                if str(row.get("id", "")) == alert_id:
                    rows[index] = {
                        **row,
                        "acknowledged": True,
                        "acknowledged_at": now,
                        "acknowledged_by": actor_email,
                    }
                    self._write(rows)
                    return rows[index]

            created = {
                "id": alert_id,
                "acknowledged": True,
                "acknowledged_at": now,
                "acknowledged_by": actor_email,
            }
            rows.append(created)
            self._write(rows)
            return created
