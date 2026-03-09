from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def _auth_headers(email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    token = response.json().get("access_token")
    assert isinstance(token, str) and token
    return {"Authorization": f"Bearer {token}"}


def _first_machine_id(headers: dict[str, str]) -> int:
    response = client.get("/api/v1/machines", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    items = payload.get("items", [])
    assert isinstance(items, list) and items
    machine_id = items[0].get("id")
    assert isinstance(machine_id, int)
    return machine_id


def _create_temp_machine(headers: dict[str, str]) -> int:
    machine_code = f"MCH-T-{uuid4().hex[:8].upper()}"
    response = client.post(
        "/api/v1/machines",
        headers=headers,
        json={
            "machine_code": machine_code,
            "name": f"Pytest Machine {machine_code}",
            "criticality": "medium",
            "status": "active",
        },
    )
    assert response.status_code == 201, response.text
    machine_id = response.json().get("id")
    assert isinstance(machine_id, int)
    return machine_id


def _ensure_spare_part(headers: dict[str, str]) -> tuple[int, bool]:
    response = client.get("/api/v1/spare-parts", headers=headers)
    assert response.status_code == 200, response.text
    items = response.json().get("items", [])
    if isinstance(items, list) and items:
        part_id = items[0].get("id")
        assert isinstance(part_id, int)
        return part_id, False

    part_code = f"SP-T-{uuid4().hex[:8].upper()}"
    create_response = client.post(
        "/api/v1/spare-parts",
        headers=headers,
        json={
            "part_code": part_code,
            "name": f"Pytest Part {part_code}",
            "category": "Mechanical",
            "stock_qty": 10,
            "reorder_level": 2,
            "unit_cost": 5.0,
            "is_active": True,
        },
    )
    assert create_response.status_code == 201, create_response.text
    part_id = create_response.json().get("id")
    assert isinstance(part_id, int)
    return part_id, True


def test_work_order_create_and_delete_as_maintenance_manager() -> None:
    headers = _auth_headers("lead@optiflow.local", "changeme")
    work_order_code = f"WO-T-{uuid4().hex[:8].upper()}"
    machine_id = _create_temp_machine(headers)

    try:
        create_response = client.post(
            "/api/v1/work-orders",
            headers=headers,
            json={
                "work_order_code": work_order_code,
                "machine_id": machine_id,
                "status": "open",
                "priority": "medium",
            },
        )
        assert create_response.status_code == 201, create_response.text
        work_order_id = create_response.json().get("id")
        assert isinstance(work_order_id, int)

        delete_response = client.delete(f"/api/v1/work-orders/{work_order_id}", headers=headers)
        assert delete_response.status_code == 204
    finally:
        client.delete(f"/api/v1/machines/{machine_id}", headers=headers)


def test_part_consumption_and_reversal_restores_stock() -> None:
    headers = _auth_headers("lead@optiflow.local", "changeme")
    work_order_code = f"WO-PC-{uuid4().hex[:8].upper()}"
    machine_id = _create_temp_machine(headers)
    part_id, created_part = _ensure_spare_part(headers)

    create_work_order = client.post(
        "/api/v1/work-orders",
        headers=headers,
        json={
            "work_order_code": work_order_code,
            "machine_id": machine_id,
            "status": "open",
            "priority": "low",
        },
    )
    assert create_work_order.status_code == 201, create_work_order.text
    work_order_id = int(create_work_order.json()["id"])

    try:
        spare_parts_response = client.get("/api/v1/spare-parts", headers=headers)
        assert spare_parts_response.status_code == 200, spare_parts_response.text
        part = next(item for item in spare_parts_response.json()["items"] if int(item["id"]) == part_id)
        before_stock = int(part["stock_qty"])

        consume_response = client.post(
            f"/api/v1/work-orders/{work_order_id}/parts/consume",
            headers=headers,
            json={"part_id": part_id, "quantity": 1, "notes": "pytest consumption"},
        )
        assert consume_response.status_code == 201, consume_response.text
        consumption_id = int(consume_response.json()["id"])

        after_consume = client.get("/api/v1/spare-parts", headers=headers).json()["items"]
        current_part = next(item for item in after_consume if int(item["id"]) == part_id)
        assert int(current_part["stock_qty"]) == before_stock - 1

        reverse_response = client.delete(
            f"/api/v1/work-orders/{work_order_id}/parts/{consumption_id}",
            headers=headers,
        )
        assert reverse_response.status_code == 204, reverse_response.text

        after_reverse = client.get("/api/v1/spare-parts", headers=headers).json()["items"]
        reverted_part = next(item for item in after_reverse if int(item["id"]) == part_id)
        assert int(reverted_part["stock_qty"]) == before_stock
    finally:
        client.delete(f"/api/v1/work-orders/{work_order_id}", headers=headers)
        if created_part:
            client.delete(f"/api/v1/spare-parts/{part_id}", headers=headers)
        client.delete(f"/api/v1/machines/{machine_id}", headers=headers)


def test_failure_log_create_and_delete() -> None:
    headers = _auth_headers("lead@optiflow.local", "changeme")
    machine_id = _create_temp_machine(headers)

    try:
        create_response = client.post(
            "/api/v1/failure-logs",
            headers=headers,
            json={
                "machine_id": machine_id,
                "occurred_at": "2026-03-01T10:00:00Z",
                "severity": "medium",
                "downtime_hours": 0.5,
                "repair_cost": 99.0,
                "root_cause": "Pytest synthetic event",
                "notes": "created by tests",
            },
        )
        assert create_response.status_code == 201, create_response.text
        failure_log_id = int(create_response.json()["id"])

        delete_response = client.delete(f"/api/v1/failure-logs/{failure_log_id}", headers=headers)
        assert delete_response.status_code == 204, delete_response.text
    finally:
        client.delete(f"/api/v1/machines/{machine_id}", headers=headers)


def test_master_data_import_dry_run_reports_summary() -> None:
    headers = _auth_headers("lead@optiflow.local", "changeme")
    suffix = uuid4().hex[:6].upper()
    csv_text = "\n".join(
        [
            "entity_type,code,name,parent_code,is_active",
            f"department,D{suffix},Dept {suffix},,true",
            f"line,L{suffix},Line {suffix},D{suffix},true",
            f"station,S{suffix},Station {suffix},L{suffix},true",
        ]
    )

    response = client.post(
        "/api/v1/master-data/import-csv",
        headers=headers,
        json={"csv_text": csv_text, "dry_run": True, "source_file_name": "pytest.csv"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload.get("dry_run") is True
    assert int(payload.get("departments_created", 0)) >= 1
    assert int(payload.get("lines_created", 0)) >= 1
    assert int(payload.get("stations_created", 0)) >= 1
