from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field


class RolePermissions(BaseModel):
    can_manage_users: bool = False
    can_manage_assets: bool = False
    can_create_work_orders: bool = False
    can_update_work_orders: bool = False
    can_import_master_data: bool = False


class RoleCreate(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    is_active: bool = True
    permissions: RolePermissions


class RoleUpdate(BaseModel):
    permissions: RolePermissions | None = None
    is_active: bool | None = None


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=120)
    role: str = Field(min_length=2, max_length=60)
    is_active: bool = True


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    email: str | None = Field(default=None, min_length=5, max_length=160)
    password: str | None = Field(default=None, min_length=6, max_length=120)
    role: str | None = Field(default=None, min_length=2, max_length=60)
    is_active: bool | None = None


def build_admin_router(
    *,
    users_store: Any,
    roles_store: Any,
    get_permissions_for_role: Callable[[str], Any],
    require_permission: Callable[[str], Callable[..., dict[str, object]]],
    write_audit_event: Callable[[dict[str, object], str, str, str, str], None],
) -> APIRouter:
    router = APIRouter(tags=["admin"])

    @router.get("/api/v1/roles")
    def list_roles(current_user: dict[str, object] = Depends(require_permission("can_manage_users"))) -> list[dict[str, object]]:
        del current_user
        return [
            {
                "name": str(role["name"]),
                "is_system": bool(role.get("is_system", False)),
                "is_active": bool(role.get("is_active", True)),
                "permissions": RolePermissions(**dict(role.get("permissions", {}))).model_dump(),
            }
            for role in roles_store.list()
        ]

    @router.post("/api/v1/roles", status_code=status.HTTP_201_CREATED)
    def create_role(
        payload: RoleCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    ) -> dict[str, object]:
        normalized_name = payload.name.strip().lower()
        if roles_store.name_exists(normalized_name):
            raise HTTPException(status_code=409, detail="Role already exists")

        created = roles_store.create(
            {"name": normalized_name, "is_active": payload.is_active, "permissions": payload.permissions.model_dump()}
        )
        write_audit_event(
            current_user,
            "role",
            str(created["name"]),
            "create",
            f"Created role '{created['name']}'",
        )
        return {
            "name": str(created["name"]),
            "is_system": bool(created.get("is_system", False)),
            "is_active": bool(created.get("is_active", True)),
            "permissions": RolePermissions(**dict(created.get("permissions", {}))).model_dump(),
        }

    @router.patch("/api/v1/roles/{role_name}")
    def update_role(
        role_name: str,
        payload: RoleUpdate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    ) -> dict[str, object]:
        current = roles_store.get(role_name)
        if current is None:
            raise HTTPException(status_code=404, detail="Role not found")

        if bool(current.get("is_system", False)) and payload.is_active is False:
            raise HTTPException(status_code=400, detail="Cannot disable system role")

        patch_payload: dict[str, object] = {}
        if payload.permissions is not None:
            patch_payload["permissions"] = payload.permissions.model_dump()
        if payload.is_active is not None:
            patch_payload["is_active"] = payload.is_active

        updated = roles_store.update(role_name, patch_payload)
        if updated is None:
            raise HTTPException(status_code=404, detail="Role not found")

        write_audit_event(
            current_user,
            "role",
            str(updated["name"]),
            "update",
            f"Updated role '{updated['name']}'",
        )

        return {
            "name": str(updated["name"]),
            "is_system": bool(updated.get("is_system", False)),
            "is_active": bool(updated.get("is_active", True)),
            "permissions": RolePermissions(**dict(updated.get("permissions", {}))).model_dump(),
        }

    @router.delete("/api/v1/roles/{role_name}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_role(
        role_name: str,
        current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    ) -> Response:
        normalized_name = role_name.strip().lower()
        if roles_store.is_system_role(normalized_name):
            raise HTTPException(status_code=400, detail="Cannot delete system role")

        users_using_role = [user for user in users_store.list() if str(user.get("role", "")).lower() == normalized_name]
        if users_using_role:
            raise HTTPException(status_code=409, detail="Role is assigned to one or more users")

        deleted = roles_store.delete(normalized_name)
        if not deleted:
            raise HTTPException(status_code=404, detail="Role not found")
        write_audit_event(current_user, "role", normalized_name, "delete", f"Deleted role '{normalized_name}'")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/api/v1/users")
    def list_users(current_user: dict[str, object] = Depends(require_permission("can_manage_users"))) -> list[dict[str, object]]:
        del current_user
        users = users_store.list()
        return [
            {
                "id": int(user["id"]),
                "full_name": str(user["full_name"]),
                "email": str(user["email"]),
                "role": str(user["role"]),
                "permissions": get_permissions_for_role(str(user["role"])).model_dump(),
                "is_active": bool(user.get("is_active", True)),
            }
            for user in users
        ]

    @router.post("/api/v1/users", status_code=status.HTTP_201_CREATED)
    def create_user(
        payload: UserCreate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    ) -> dict[str, object]:
        if users_store.email_exists(payload.email):
            raise HTTPException(status_code=409, detail="Email already exists")
        if not roles_store.name_exists(payload.role):
            raise HTTPException(status_code=400, detail="Role does not exist")

        created = users_store.create(payload.model_dump())
        write_audit_event(
            current_user,
            "user",
            str(created["id"]),
            "create",
            f"Created user '{created['email']}'",
        )
        return {
            "id": int(created["id"]),
            "full_name": str(created["full_name"]),
            "email": str(created["email"]),
            "role": str(created["role"]),
            "permissions": get_permissions_for_role(str(created["role"])).model_dump(),
            "is_active": bool(created.get("is_active", True)),
        }

    @router.patch("/api/v1/users/{user_id}")
    def update_user(
        user_id: int,
        payload: UserUpdate,
        current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    ) -> dict[str, object]:
        existing = users_store.get(user_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="User not found")

        updates = payload.model_dump(exclude_unset=True)
        next_email = updates.get("email")
        if next_email and users_store.email_exists(str(next_email), exclude_id=user_id):
            raise HTTPException(status_code=409, detail="Email already exists")
        next_role = updates.get("role")
        if next_role and not roles_store.name_exists(str(next_role)):
            raise HTTPException(status_code=400, detail="Role does not exist")

        updated = users_store.update(user_id, updates)
        if updated is None:
            raise HTTPException(status_code=404, detail="User not found")

        write_audit_event(
            current_user,
            "user",
            str(updated["id"]),
            "update",
            f"Updated user '{updated['email']}'",
        )

        return {
            "id": int(updated["id"]),
            "full_name": str(updated["full_name"]),
            "email": str(updated["email"]),
            "role": str(updated["role"]),
            "permissions": get_permissions_for_role(str(updated["role"])).model_dump(),
            "is_active": bool(updated.get("is_active", True)),
        }

    @router.delete("/api/v1/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_user(
        user_id: int,
        current_user: dict[str, object] = Depends(require_permission("can_manage_users")),
    ) -> Response:
        requester_id = int(current_user["id"])
        if requester_id == user_id:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")

        deleted = users_store.delete(user_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="User not found")
        write_audit_event(current_user, "user", str(user_id), "delete", f"Deleted user id {user_id}")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
