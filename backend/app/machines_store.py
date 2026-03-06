import json
from pathlib import Path
from threading import Lock
from typing import Any


class MachinesStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "machines.json"
        self._seed_data = [
            {
                "id": 1,
                "machine_code": "MCH-CNC-001",
                "name": "CNC Machine 1",
                "criticality": "critical",
                "status": "active",
            },
            {
                "id": 2,
                "machine_code": "MCH-PKG-002",
                "name": "Packaging Line 2",
                "criticality": "high",
                "status": "active",
            },
            {
                "id": 3,
                "machine_code": "MCH-CMP-003",
                "name": "Air Compressor 3",
                "criticality": "medium",
                "status": "active",
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

    def get(self, machine_id: int) -> dict[str, Any] | None:
        with self._lock:
            machines = self._read()
            return next((m for m in machines if m["id"] == machine_id), None)

    def create(self, machine: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            machines = self._read()
            next_id = max([m["id"] for m in machines], default=0) + 1
            item = {"id": next_id, **machine}
            machines.append(item)
            self._write(machines)
            return item

    def update(self, machine_id: int, updates: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            machines = self._read()
            for index, machine in enumerate(machines):
                if machine["id"] == machine_id:
                    machines[index] = {**machine, **updates}
                    self._write(machines)
                    return machines[index]
            return None

    def delete(self, machine_id: int) -> bool:
        with self._lock:
            machines = self._read()
            filtered = [machine for machine in machines if machine["id"] != machine_id]
            if len(filtered) == len(machines):
                return False
            self._write(filtered)
            return True

    def code_exists(self, machine_code: str, exclude_id: int | None = None) -> bool:
        with self._lock:
            machines = self._read()
            for machine in machines:
                if machine["machine_code"].lower() == machine_code.lower() and machine["id"] != exclude_id:
                    return True
            return False
