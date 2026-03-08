import json
from pathlib import Path
from threading import Lock
from typing import Any


class AlertDeliverySettingsStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "alert_delivery_settings.json"
        self._ensure_file_exists()

    def _ensure_file_exists(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._file_path.exists():
            self._write({})

    def _read(self) -> dict[str, Any]:
        with self._file_path.open("r", encoding="utf-8") as file:
            payload = json.load(file)
            if isinstance(payload, dict):
                return payload
            return {}

    def _write(self, data: dict[str, Any]) -> None:
        with self._file_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=2)

    def get(self) -> dict[str, Any]:
        with self._lock:
            return self._read()

    def update(self, updates: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            current = self._read()
            merged = {**current, **updates}
            self._write(merged)
            return merged
