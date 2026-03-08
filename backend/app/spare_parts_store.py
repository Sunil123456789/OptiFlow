import json
from pathlib import Path
from threading import Lock
from typing import Any


class SparePartsStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "spare_parts.json"
        self._seed_data = [
            {
                "id": 1,
                "part_code": "SP-BRG-6205",
                "name": "Bearing 6205",
                "category": "Mechanical",
                "stock_qty": 24,
                "reorder_level": 8,
                "unit_cost": 12.5,
                "is_active": True,
            },
            {
                "id": 2,
                "part_code": "SP-BLT-A42",
                "name": "Drive Belt A42",
                "category": "Mechanical",
                "stock_qty": 11,
                "reorder_level": 10,
                "unit_cost": 18.0,
                "is_active": True,
            },
            {
                "id": 3,
                "part_code": "SP-SNS-PT100",
                "name": "PT100 Temperature Sensor",
                "category": "Electrical",
                "stock_qty": 6,
                "reorder_level": 5,
                "unit_cost": 44.25,
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

    def get(self, part_id: int) -> dict[str, Any] | None:
        with self._lock:
            parts = self._read()
            return next((p for p in parts if p["id"] == part_id), None)

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            parts = self._read()
            next_id = max([p["id"] for p in parts], default=0) + 1
            item = {"id": next_id, **payload}
            parts.append(item)
            self._write(parts)
            return item

    def update(self, part_id: int, updates: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            parts = self._read()
            for index, part in enumerate(parts):
                if part["id"] == part_id:
                    parts[index] = {**part, **updates}
                    self._write(parts)
                    return parts[index]
            return None

    def delete(self, part_id: int) -> bool:
        with self._lock:
            parts = self._read()
            filtered = [part for part in parts if part["id"] != part_id]
            if len(filtered) == len(parts):
                return False
            self._write(filtered)
            return True

    def code_exists(self, part_code: str, exclude_id: int | None = None) -> bool:
        with self._lock:
            parts = self._read()
            for part in parts:
                if part["part_code"].lower() == part_code.lower() and part["id"] != exclude_id:
                    return True
            return False