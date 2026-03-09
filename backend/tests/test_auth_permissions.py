from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _login(email: str, password: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _auth_headers(email: str, password: str) -> dict[str, str]:
    payload = _login(email, password)
    token = payload.get("access_token")
    assert isinstance(token, str) and token
    return {"Authorization": f"Bearer {token}"}


def test_login_success_returns_access_token_and_user() -> None:
    payload = _login("admin@optiflow.local", "changeme")
    assert payload.get("token_type") == "bearer"
    assert isinstance(payload.get("access_token"), str)
    user = payload.get("user")
    assert isinstance(user, dict)
    assert user.get("email") == "admin@optiflow.local"


def test_login_invalid_password_returns_401() -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@optiflow.local", "password": "wrong-password"},
    )
    assert response.status_code == 401


def test_auth_me_returns_current_user_profile() -> None:
    headers = _auth_headers("admin@optiflow.local", "changeme")
    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("email") == "admin@optiflow.local"
    assert payload.get("role") == "admin"


def test_admin_can_list_users() -> None:
    headers = _auth_headers("admin@optiflow.local", "changeme")
    response = client.get("/api/v1/users", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload, list)
    assert any(item.get("email") == "admin@optiflow.local" for item in payload)


def test_maintenance_manager_cannot_list_users() -> None:
    headers = _auth_headers("lead@optiflow.local", "changeme")
    response = client.get("/api/v1/users", headers=headers)
    assert response.status_code == 403
    assert response.json().get("detail") == "Insufficient permissions"


def test_technician_cannot_create_department() -> None:
    headers = _auth_headers("tech1@optiflow.local", "changeme")
    response = client.post(
        "/api/v1/departments",
        headers=headers,
        json={"code": "ZZ", "name": "Forbidden Department", "is_active": True},
    )
    assert response.status_code == 403
    assert response.json().get("detail") == "Insufficient permissions"
