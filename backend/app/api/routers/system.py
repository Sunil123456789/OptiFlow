from collections.abc import Callable

from fastapi import APIRouter


def build_system_router(*, db_healthcheck: Callable[[], bool], redis_healthcheck: Callable[[], bool]) -> APIRouter:
    router = APIRouter(tags=["system"])

    @router.get("/health")
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/ready")
    def readiness_check() -> dict[str, object]:
        db_ok = False
        redis_ok = False

        try:
            db_ok = db_healthcheck()
        except Exception:
            db_ok = False

        try:
            redis_ok = redis_healthcheck()
        except Exception:
            redis_ok = False

        return {
            "status": "ready" if (db_ok and redis_ok) else "degraded",
            "checks": {"database": db_ok, "redis": redis_ok},
        }

    return router
