from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any


class WorkOrderPartsStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "work_order_parts.json"
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

    def list_by_work_order(self, work_order_id: int) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._read()
            return [row for row in rows if int(row.get("work_order_id", 0)) == work_order_id]

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            rows = self._read()
            next_id = max([int(row.get("id", 0)) for row in rows], default=0) + 1
            item = {"id": next_id, **payload}
            rows.append(item)
            self._write(rows)
            return item

    def get(self, consumption_id: int) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            return next((row for row in rows if int(row.get("id", 0)) == consumption_id), None)

    def delete(self, consumption_id: int) -> bool:
        with self._lock:
            rows = self._read()
            filtered = [row for row in rows if int(row.get("id", 0)) != consumption_id]
            if len(filtered) == len(rows):
                return False
            self._write(filtered)
            return True