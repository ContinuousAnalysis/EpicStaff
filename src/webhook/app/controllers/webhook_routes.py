from fastapi import APIRouter, Depends, Request
from app.services.redis_service import RedisService, get_redis_service
from typing import Dict, Any
from loguru import logger

router = APIRouter()

@router.post(
    "/webhooks/{custom_id}/",
    summary="Receives a generic webhook"
)
async def handle_webhook(
    custom_id: str,
    payload: Dict[str, Any],
    redis: RedisService = Depends(get_redis_service)
):
    """
    Takes the request, calls the Redis service (Model),
    and returns a response (View).
    """
    logger.info(f"Webhook Received for ID: {custom_id} ---")
    
    await redis.publish_webhook(custom_id, payload)
    
    return {
        "status": "success",
        "message": "Webhook received and queued for processing",
        "custom_id": custom_id
    }

@router.get("/")
async def index():
    """Health check route."""
    return {"message": "Webhook service is running."}