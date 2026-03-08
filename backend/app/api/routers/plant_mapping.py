from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends


def build_plant_mapping_router(
    *,
    require_permission: Callable[[str], Callable[..., dict[str, object]]],
    departments_store: Any,
    lines_store: Any,
    stations_store: Any,
) -> APIRouter:
    router = APIRouter(tags=["plant-mapping"])

    @router.get("/api/v1/plant-mapping/integrity-checks")
    def get_plant_mapping_integrity(
        current_user: dict[str, object] = Depends(require_permission("can_manage_assets")),
    ) -> dict[str, int]:
        del current_user
        departments = departments_store.list()
        lines = lines_store.list()
        stations = stations_store.list()

        department_codes = {str(item["code"]).upper() for item in departments}
        line_codes = {str(item["code"]).upper() for item in lines}
        departments_by_code = {str(item["code"]).upper(): item for item in departments}
        lines_by_code = {str(item["code"]).upper(): item for item in lines}

        orphan_lines = len([item for item in lines if str(item["department_code"]).upper() not in department_codes])
        orphan_stations = len([item for item in stations if str(item["line_code"]).upper() not in line_codes])

        duplicate_department_codes = len(departments) - len(department_codes)
        duplicate_line_codes = len(lines) - len(line_codes)
        duplicate_station_codes = len(stations) - len({str(item["code"]).upper() for item in stations})

        inactive_department_lines = len(
            [
                item
                for item in lines
                if str(item["department_code"]).upper() in departments_by_code
                and not bool(departments_by_code[str(item["department_code"]).upper()].get("is_active", True))
            ]
        )
        inactive_line_stations = len(
            [
                item
                for item in stations
                if str(item["line_code"]).upper() in lines_by_code
                and not bool(lines_by_code[str(item["line_code"]).upper()].get("is_active", True))
            ]
        )

        return {
            "orphan_lines": orphan_lines,
            "orphan_stations": orphan_stations,
            "duplicate_department_codes": duplicate_department_codes,
            "duplicate_line_codes": duplicate_line_codes,
            "duplicate_station_codes": duplicate_station_codes,
            "inactive_department_lines": inactive_department_lines,
            "inactive_line_stations": inactive_line_stations,
        }

    return router
