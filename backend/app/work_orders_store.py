import json
from pathlib import Path
from threading import Lock
from typing import Any


class WorkOrdersStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "work_orders.json"
        self._seed_data = [
            {
                "id": 1,
                "work_order_code": "WO-1001",
                "machine_id": 1,
                "status": "open",
                "priority": "high",
            },
            {
                "id": 2,
                "work_order_code": "WO-1002",
                "machine_id": 3,
                "status": "in_progress",
                "priority": "medium",
            },
            {
                "id": 3,
                "work_order_code": "WO-1003",
                "machine_id": 2,
                "status": "overdue",
                "priority": "critical",
            },
        ]
        self._ensure_file_exists()

    def _ensure_file_exists(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._file_path.exists():
            self._write(self._seed_data)

    def _read(self) -> list[dict[str, Any]]:
        with self._file_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _write(self, data: list[dict[str, Any]]) -> None:
        with self._file_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=2)

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            return self._read()

    def get(self, work_order_id: int) -> dict[str, Any] | None:
        with self._lock:
            work_orders = self._read()
            return next((w for w in work_orders if w["id"] == work_order_id), None)

    def create(self, work_order: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            work_orders = self._read()
            next_id = max([w["id"] for w in work_orders], default=0) + 1
            item = {"id": next_id, **work_order}
            work_orders.append(item)
            self._write(work_orders)
            return item

    def update(self, work_order_id: int, updates: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            work_orders = self._read()
            for index, work_order in enumerate(work_orders):
                if work_order["id"] == work_order_id:
                    work_orders[index] = {**work_order, **updates}
                    self._write(work_orders)
                    return work_orders[index]
            return None

    def delete(self, work_order_id: int) -> bool:
        with self._lock:
            work_orders = self._read()
            filtered = [work_order for work_order in work_orders if work_order["id"] != work_order_id]
            if len(filtered) == len(work_orders):
                return False
            self._write(filtered)
            return True

    def code_exists(self, work_order_code: str, exclude_id: int | None = None) -> bool:
        with self._lock:
            work_orders = self._read()
            for work_order in work_orders:
                if (
                    work_order["work_order_code"].lower() == work_order_code.lower()
                    and work_order["id"] != exclude_id
                ):
                    return True
            return False
