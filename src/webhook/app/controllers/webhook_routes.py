from fastapi import APIRouter, Depends, Request
from app.services.redis_service import RedisService, get_redis_service
from typing import Dict, Any

# All routes in this file will be prefixed with /
router = APIRouter()

@router.post(
    "/webhooks/{custom_id}/",
    summary="Receives a generic webhook"
)
async def handle_webhook(
    custom_id: str,
    payload: Dict[str, Any],  # FastAPI automatically parses the JSON body
    redis: RedisService = Depends(get_redis_service) # <--- Dependency Injection
):
    """
    This is the Controller.
    It takes the request, calls the Redis service (Model),
    and returns a response (View).
    """
    print(f"\n--- [Controller] Webhook Received for ID: {custom_id} ---")
    
    # 1. Call the service layer (Model) to do the work
    await redis.publish_webhook(custom_id, payload)
    
    # 2. Return the response (View)
    print("--- [Controller] Handled and sent to Redis ---")
    return {
        "status": "success",
        "message": "Webhook received and queued for processing",
        "custom_id": custom_id
    }

@router.get("/")
async def index():
    """A simple health check route."""
    return {"message": "Webhook service is running."}