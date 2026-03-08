from app.api.routers.assets import build_assets_router
from app.api.routers.admin import build_admin_router
from app.api.routers.auth import build_auth_router
from app.api.routers.dashboard import build_dashboard_router
from app.api.routers.incidents import build_incidents_router
from app.api.routers.maintenance import build_maintenance_router
from app.api.routers.master_data import build_master_data_router
from app.api.routers.plant_mapping import build_plant_mapping_router
from app.api.routers.reports import build_reports_router
from app.api.routers.system import build_system_router

__all__ = [
    "build_assets_router",
    "build_admin_router",
    "build_auth_router",
    "build_dashboard_router",
    "build_incidents_router",
    "build_maintenance_router",
    "build_master_data_router",
    "build_plant_mapping_router",
    "build_reports_router",
    "build_system_router",
]
