import json
from pathlib import Path
from threading import Lock
from typing import Any


class PlansStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "plans.json"
        self._seed_data = [
            {
                "id": 1,
                "plan_code": "PLN-1001",
                "machine_id": 1,
                "title": "Monthly spindle check",
                "plan_type": "calendar",
                "next_due": "In 5 days",
                "is_active": True,
            },
            {
                "id": 2,
                "plan_code": "PLN-1002",
                "machine_id": 2,
                "title": "Runtime belt inspection",
                "plan_type": "runtime",
                "next_due": "In 2 days",
                "is_active": True,
            },
            {
                "id": 3,
                "plan_code": "PLN-1003",
                "machine_id": 3,
                "title": "Pressure calibration",
                "plan_type": "calendar",
                "next_due": "Tomorrow",
                "is_active": True,
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

    def get(self, plan_id: int) -> dict[str, Any] | None:
        with self._lock:
            plans = self._read()
            return next((p for p in plans if p["id"] == plan_id), None)

    def create(self, plan: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            plans = self._read()
            next_id = max([p["id"] for p in plans], default=0) + 1
            item = {"id": next_id, **plan}
            plans.append(item)
            self._write(plans)
            return item

    def update(self, plan_id: int, updates: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            plans = self._read()
            for index, plan in enumerate(plans):
                if plan["id"] == plan_id:
                    plans[index] = {**plan, **updates}
                    self._write(plans)
                    return plans[index]
            return None

    def delete(self, plan_id: int) -> bool:
        with self._lock:
            plans = self._read()
            filtered = [plan for plan in plans if plan["id"] != plan_id]
            if len(filtered) == len(plans):
                return False
            self._write(filtered)
            return True

    def code_exists(self, plan_code: str, exclude_id: int | None = None) -> bool:
        with self._lock:
            plans = self._read()
            for plan in plans:
                if plan["plan_code"].lower() == plan_code.lower() and plan["id"] != exclude_id:
                    return True
            return False
