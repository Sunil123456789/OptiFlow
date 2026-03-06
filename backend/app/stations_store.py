import json
from pathlib import Path
from threading import Lock
from typing import Any


class StationsStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "stations.json"
        self._seed_data = [
            {"id": 1, "code": "ST-FRM-01", "name": "Frame Press Station", "line_code": "FRM-L1", "is_active": True},
            {"id": 2, "code": "ST-LNS-01", "name": "Lens Coating Station", "line_code": "LNS-L1", "is_active": True},
            {"id": 3, "code": "ST-QC-01", "name": "Final Inspection Station", "line_code": "QC-L1", "is_active": True},
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
            rows = self._read()
            rows.sort(key=lambda row: str(row["code"]).lower())
            return rows

    def get_by_code(self, code: str) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            normalized = code.strip().upper()
            return next((row for row in rows if str(row["code"]).upper() == normalized), None)

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            rows = self._read()
            next_id = max((int(row["id"]) for row in rows), default=0) + 1
            created = {
                "id": next_id,
                "code": str(payload["code"]).strip().upper(),
                "name": str(payload["name"]).strip(),
                "line_code": str(payload["line_code"]).strip().upper(),
                "is_active": bool(payload.get("is_active", True)),
            }
            rows.append(created)
            self._write(rows)
            return created

    def update_by_code(self, code: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            normalized = code.strip().upper()
            idx = next((i for i, row in enumerate(rows) if str(row["code"]).upper() == normalized), -1)
            if idx < 0:
                return None

            current = rows[idx]
            if "name" in payload:
                current["name"] = str(payload["name"]).strip()
            if "line_code" in payload:
                current["line_code"] = str(payload["line_code"]).strip().upper()
            if "is_active" in payload:
                current["is_active"] = bool(payload["is_active"])

            rows[idx] = current
            self._write(rows)
            return current

    def upsert(self, payload: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        existing = self.get_by_code(str(payload["code"]))
        if existing is None:
            return self.create(payload), True

        updated = self.update_by_code(
            str(payload["code"]),
            {
                "name": payload["name"],
                "line_code": payload["line_code"],
                "is_active": payload.get("is_active", True),
            },
        )
        if updated is None:
            return self.create(payload), True
        return updated, False

    def delete_by_code(self, code: str) -> bool:
        with self._lock:
            rows = self._read()
            normalized = code.strip().upper()
            next_rows = [row for row in rows if str(row["code"]).upper() != normalized]
            if len(next_rows) == len(rows):
                return False
            self._write(next_rows)
            return True

    def code_exists(self, code: str) -> bool:
        return self.get_by_code(code) is not None
