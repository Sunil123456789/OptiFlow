import json
from pathlib import Path
from threading import Lock
from typing import Any


class FailureLogsStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "failure_logs.json"
        self._seed_data = [
            {
                "id": 1,
                "machine_id": 1,
                "occurred_at": "2026-02-10T08:20:00Z",
                "downtime_hours": 2.5,
                "repair_cost": 14500,
                "root_cause": "Spindle vibration",
                "notes": "Bearing replaced and alignment corrected.",
            },
            {
                "id": 2,
                "machine_id": 2,
                "occurred_at": "2026-02-18T13:45:00Z",
                "downtime_hours": 1.25,
                "repair_cost": 6200,
                "root_cause": "Sensor misread",
                "notes": "I/O card reseated and recalibrated.",
            },
            {
                "id": 3,
                "machine_id": 3,
                "occurred_at": "2026-02-25T19:05:00Z",
                "downtime_hours": 3.0,
                "repair_cost": 23100,
                "root_cause": "Compressor seal leak",
                "notes": "Seal kit changed and pressure tested.",
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

    def get(self, failure_id: int) -> dict[str, Any] | None:
        with self._lock:
            failures = self._read()
            return next((row for row in failures if int(row["id"]) == failure_id), None)

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            failures = self._read()
            next_id = max([int(row["id"]) for row in failures], default=0) + 1
            item = {"id": next_id, **payload}
            failures.append(item)
            self._write(failures)
            return item

    def update(self, failure_id: int, updates: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            failures = self._read()
            for index, row in enumerate(failures):
                if int(row["id"]) == failure_id:
                    failures[index] = {**row, **updates}
                    self._write(failures)
                    return failures[index]
            return None

    def delete(self, failure_id: int) -> bool:
        with self._lock:
            failures = self._read()
            filtered = [row for row in failures if int(row["id"]) != failure_id]
            if len(filtered) == len(failures):
                return False
            self._write(filtered)
            return True
