from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload.get("status") == "ok"


def test_readiness_endpoint_available() -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    payload = response.json()
    assert "status" in payload
    assert "checks" in payload


def test_auth_protected_routes_return_401_without_token() -> None:
    protected_paths = [
        "/api/v1/dashboard/summary",
        "/api/v1/machines",
        "/api/v1/maintenance-plans",
        "/api/v1/failure-logs",
        "/api/v1/alerts",
    ]

    for path in protected_paths:
        response = client.get(path)
        assert response.status_code == 401, f"Expected 401 for {path}, got {response.status_code}"
