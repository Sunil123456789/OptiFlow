from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=6, max_length=120)


def build_auth_router(
    *,
    users_store: Any,
    roles_store: Any,
    create_access_token: Callable[[str], str],
    auth_user_from_row: Callable[[dict[str, object]], Any],
    get_current_user: Callable[..., dict[str, object]],
) -> APIRouter:
    router = APIRouter(tags=["auth"])

    @router.post("/api/v1/auth/login")
    def login(payload: LoginRequest) -> dict[str, object]:
        user = users_store.get_by_email(payload.email)
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        valid_password = users_store.verify_password(payload.password, str(user["password_hash"]))
        if not valid_password:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not roles_store.name_exists(str(user["role"])):
            raise HTTPException(status_code=403, detail="Role is not configured")
        role_def = roles_store.get(str(user["role"]))
        if role_def is None or not bool(role_def.get("is_active", True)):
            raise HTTPException(status_code=403, detail="Role is disabled")

        token = create_access_token(str(user["email"]))
        auth_user = auth_user_from_row(user)
        user_payload = auth_user.model_dump() if hasattr(auth_user, "model_dump") else dict(auth_user)
        return {"access_token": token, "token_type": "bearer", "user": user_payload}

    @router.get("/api/v1/auth/me")
    def me(current_user: dict[str, object] = Depends(get_current_user)) -> dict[str, object]:
        role_def = roles_store.get(str(current_user["role"]))
        if role_def is None:
            raise HTTPException(status_code=403, detail="Role is not configured")
        if not bool(role_def.get("is_active", True)):
            raise HTTPException(status_code=403, detail="Role is disabled")

        auth_user = auth_user_from_row(current_user)
        return auth_user.model_dump() if hasattr(auth_user, "model_dump") else dict(auth_user)

    return router
