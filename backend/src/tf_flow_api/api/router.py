from fastapi import APIRouter

from tf_flow_api.api.v1 import health

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
