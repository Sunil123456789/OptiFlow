import json
import hashlib
from pathlib import Path
from threading import Lock
from typing import Any


class UsersStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "users.json"
        self._seed_users = [
            {
                "id": 1,
                "full_name": "Admin User",
                "email": "admin@optiflow.local",
                "password": "changeme",
                "role": "admin",
                "is_active": True,
            },
            {
                "id": 2,
                "full_name": "Maintenance Lead",
                "email": "lead@optiflow.local",
                "password": "changeme",
                "role": "maintenance_manager",
                "is_active": True,
            },
            {
                "id": 3,
                "full_name": "Technician One",
                "email": "tech1@optiflow.local",
                "password": "changeme",
                "role": "technician",
                "is_active": True,
            },
        ]
        self._ensure_file_exists()

    def _hash_password(self, password: str) -> str:
        salted = f"optiflow::{password}"
        return hashlib.sha256(salted.encode("utf-8")).hexdigest()

    def _ensure_file_exists(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        seeded = []
        for user in self._seed_users:
            seeded.append(
                {
                    "id": user["id"],
                    "full_name": user["full_name"],
                    "email": user["email"],
                    "password_hash": self._hash_password(str(user["password"])),
                    "role": user["role"],
                    "is_active": user["is_active"],
                }
            )
        if not self._file_path.exists():
            self._write(seeded)

    def _read(self) -> list[dict[str, Any]]:
        with self._file_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _write(self, data: list[dict[str, Any]]) -> None:
        with self._file_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=2)

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        with self._lock:
            users = self._read()
            return next((user for user in users if user["email"].lower() == email.lower()), None)

    def get(self, user_id: int) -> dict[str, Any] | None:
        with self._lock:
            users = self._read()
            return next((user for user in users if int(user["id"]) == user_id), None)

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            users = self._read()
            users.sort(key=lambda row: int(row["id"]))
            return users

    def email_exists(self, email: str, exclude_id: int | None = None) -> bool:
        with self._lock:
            users = self._read()
            normalized = email.lower()
            for user in users:
                if exclude_id is not None and int(user["id"]) == exclude_id:
                    continue
                if str(user["email"]).lower() == normalized:
                    return True
            return False

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            users = self._read()
            next_id = max((int(user["id"]) for user in users), default=0) + 1
            created = {
                "id": next_id,
                "full_name": str(payload["full_name"]),
                "email": str(payload["email"]).lower(),
                "password_hash": self._hash_password(str(payload["password"])),
                "role": str(payload["role"]).strip().lower(),
                "is_active": bool(payload.get("is_active", True)),
            }
            users.append(created)
            self._write(users)
            return created

    def update(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            users = self._read()
            idx = next((i for i, row in enumerate(users) if int(row["id"]) == user_id), -1)
            if idx < 0:
                return None

            current = users[idx]
            if "full_name" in payload:
                current["full_name"] = str(payload["full_name"])
            if "email" in payload:
                current["email"] = str(payload["email"]).lower()
            if "role" in payload:
                current["role"] = str(payload["role"]).strip().lower()
            if "is_active" in payload:
                current["is_active"] = bool(payload["is_active"])
            if "password" in payload and payload["password"]:
                current["password_hash"] = self._hash_password(str(payload["password"]))

            users[idx] = current
            self._write(users)
            return current

    def delete(self, user_id: int) -> bool:
        with self._lock:
            users = self._read()
            next_rows = [row for row in users if int(row["id"]) != user_id]
            if len(next_rows) == len(users):
                return False
            self._write(next_rows)
            return True

    def verify_password(self, plain_password: str, password_hash: str) -> bool:
        return self._hash_password(plain_password) == password_hash

