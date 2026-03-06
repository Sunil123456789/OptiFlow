import json
from pathlib import Path
from threading import Lock
from typing import Any


class RolesStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._data_dir = Path(__file__).resolve().parent.parent / "data"
        self._file_path = self._data_dir / "roles.json"
        self._seed_roles = [
            {
                "name": "admin",
                "is_system": True,
                "is_active": True,
                "permissions": {
                    "can_manage_users": True,
                    "can_manage_assets": True,
                    "can_create_work_orders": True,
                    "can_update_work_orders": True,
                    "can_import_master_data": True,
                },
            },
            {
                "name": "maintenance_manager",
                "is_system": True,
                "is_active": True,
                "permissions": {
                    "can_manage_users": False,
                    "can_manage_assets": True,
                    "can_create_work_orders": True,
                    "can_update_work_orders": True,
                    "can_import_master_data": True,
                },
            },
            {
                "name": "technician",
                "is_system": True,
                "is_active": True,
                "permissions": {
                    "can_manage_users": False,
                    "can_manage_assets": False,
                    "can_create_work_orders": False,
                    "can_update_work_orders": True,
                    "can_import_master_data": False,
                },
            },
            {
                "name": "viewer",
                "is_system": True,
                "is_active": True,
                "permissions": {
                    "can_manage_users": False,
                    "can_manage_assets": False,
                    "can_create_work_orders": False,
                    "can_update_work_orders": False,
                    "can_import_master_data": False,
                },
            },
        ]
        self._system_permission_defaults = {
            str(role["name"]): dict(role["permissions"]) for role in self._seed_roles
        }
        self._ensure_file_exists()

    def _ensure_file_exists(self) -> None:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._file_path.exists():
            self._write(self._seed_roles)
            return

        rows = self._read()
        upgraded_rows, changed = self._upgrade_existing_roles(rows)
        if changed:
            self._write(upgraded_rows)

    def _upgrade_existing_roles(self, rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], bool]:
        changed = False
        upgraded: list[dict[str, Any]] = []

        for row in rows:
            next_row = dict(row)
            role_name = str(next_row.get("name", "")).strip().lower()
            is_system = bool(next_row.get("is_system", role_name in self._system_permission_defaults))
            if bool(next_row.get("is_system", False)) != is_system:
                next_row["is_system"] = is_system
                changed = True

            if "is_active" not in next_row:
                next_row["is_active"] = True
                changed = True

            permissions = dict(next_row.get("permissions", {}))
            default_permissions = self._system_permission_defaults.get(
                role_name,
                {
                    "can_manage_users": bool(permissions.get("can_manage_users", False)),
                    "can_manage_assets": bool(permissions.get("can_manage_assets", False)),
                    "can_create_work_orders": bool(permissions.get("can_create_work_orders", False)),
                    "can_update_work_orders": bool(permissions.get("can_update_work_orders", False)),
                    "can_import_master_data": False,
                },
            )

            normalized_permissions = {
                "can_manage_users": bool(permissions.get("can_manage_users", default_permissions["can_manage_users"])),
                "can_manage_assets": bool(permissions.get("can_manage_assets", default_permissions["can_manage_assets"])),
                "can_create_work_orders": bool(
                    permissions.get("can_create_work_orders", default_permissions["can_create_work_orders"])
                ),
                "can_update_work_orders": bool(
                    permissions.get("can_update_work_orders", default_permissions["can_update_work_orders"])
                ),
                "can_import_master_data": bool(
                    permissions.get("can_import_master_data", default_permissions["can_import_master_data"])
                ),
            }

            if permissions != normalized_permissions:
                next_row["permissions"] = normalized_permissions
                changed = True

            upgraded.append(next_row)

        return upgraded, changed

    def _read(self) -> list[dict[str, Any]]:
        with self._file_path.open("r", encoding="utf-8") as file:
            return json.load(file)

    def _write(self, data: list[dict[str, Any]]) -> None:
        with self._file_path.open("w", encoding="utf-8") as file:
            json.dump(data, file, indent=2)

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._read()
            rows.sort(key=lambda row: str(row["name"]).lower())
            return rows

    def get(self, role_name: str) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            normalized = role_name.strip().lower()
            return next((row for row in rows if str(row["name"]).lower() == normalized), None)

    def name_exists(self, role_name: str) -> bool:
        return self.get(role_name) is not None

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            rows = self._read()
            created = {
                "name": str(payload["name"]).strip().lower(),
                "is_system": False,
                "is_active": bool(payload.get("is_active", True)),
                "permissions": {
                    "can_manage_users": bool(payload["permissions"]["can_manage_users"]),
                    "can_manage_assets": bool(payload["permissions"]["can_manage_assets"]),
                    "can_create_work_orders": bool(payload["permissions"]["can_create_work_orders"]),
                    "can_update_work_orders": bool(payload["permissions"]["can_update_work_orders"]),
                    "can_import_master_data": bool(payload["permissions"].get("can_import_master_data", False)),
                },
            }
            rows.append(created)
            self._write(rows)
            return created

    def update(self, role_name: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            normalized = role_name.strip().lower()
            idx = next((i for i, row in enumerate(rows) if str(row["name"]).lower() == normalized), -1)
            if idx < 0:
                return None

            current = rows[idx]
            if "permissions" in payload:
                permissions = payload["permissions"]
                current["permissions"] = {
                    "can_manage_users": bool(permissions["can_manage_users"]),
                    "can_manage_assets": bool(permissions["can_manage_assets"]),
                    "can_create_work_orders": bool(permissions["can_create_work_orders"]),
                    "can_update_work_orders": bool(permissions["can_update_work_orders"]),
                    "can_import_master_data": bool(permissions.get("can_import_master_data", False)),
                }
            if "is_active" in payload:
                current["is_active"] = bool(payload["is_active"])

            rows[idx] = current
            self._write(rows)
            return current

    def delete(self, role_name: str) -> bool:
        with self._lock:
            rows = self._read()
            normalized = role_name.strip().lower()
            target = next((row for row in rows if str(row["name"]).lower() == normalized), None)
            if target is None:
                return False
            if bool(target.get("is_system", False)):
                return False

            next_rows = [row for row in rows if str(row["name"]).lower() != normalized]
            self._write(next_rows)
            return True

    def is_system_role(self, role_name: str) -> bool:
        role = self.get(role_name)
        if role is None:
            return False
        return bool(role.get("is_system", False))
