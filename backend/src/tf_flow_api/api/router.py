from fastapi import APIRouter

from tf_flow_api.api.v1 import assistant, forecast, health, incidents

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(forecast.router)
api_router.include_router(assistant.router)
api_router.include_router(incidents.router)
