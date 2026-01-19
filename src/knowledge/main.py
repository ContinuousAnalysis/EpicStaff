import os
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from loguru import logger

from services.collection_processor_service import CollectionProcessorService
from services.chunk_document_service import ChunkDocumentService
from services.redis_service import RedisService
from models.redis_models import (
    ChunkDocumentMessage,
    ChunkDocumentMessageResponse,
    KnowledgeSearchMessage,
)


chunk_document_service = ChunkDocumentService()
collection_processor_service = CollectionProcessorService()
# Redis Configuration
redis_host = os.getenv("REDIS_HOST", "127.0.0.1")
redis_port = int(os.getenv("REDIS_PORT", "6379"))
redis_password = os.getenv("REDIS_PASSWORD")

knowledge_sources_channel = os.getenv("KNOWLEDGE_SOURCES_CHANNEL", "knowledge_sources")
knowledge_search_get_channel = os.getenv(
    "KNOWLEDGE_SEARCH_GET_CHANNEL", "knowledge:search:get"
)
knowledge_search_response_channel = os.getenv(
    "KNOWLEDGE_SEARCH_RESPONSE_CHANNEL", "knowledge:search:response"
)
knowledge_document_chunk_channel = os.getenv(
    "KNOWLEDGE_DOCUMENT_CHUNK_CHANNEL", "knowledge:chunk"
)
knowledge_document_chunk_response = os.getenv(
    "KNOWLEDGE_DOCUMENT_CHUNK_RESPONSE", "knowledge:chunk:response"
)


def run_process_collection(collection_id):
    """Runs the blocking embedding process in a separate process."""
    collection_processor_service.process_collection(collection_id=collection_id)


def run_chunk_document(document_id: int):
    chunk_document_service.process_chunk_document_by_document_id(
        document_id=document_id
    )


async def indexing(redis_service: RedisService, executor: ThreadPoolExecutor):
    """Handles embedding creation from the Redis queue asynchronously."""
    logger.info(f"Subscribed to channel '{knowledge_sources_channel}' for embeddings.")

    pubsub = await redis_service.async_subscribe(knowledge_sources_channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                collection_id = data["collection_id"]

                # Run blocking function in a ProcessPoolExecutor for CPU-bound work
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    executor, run_process_collection, collection_id
                )

            except Exception as e:
                logger.error(f"Error processing embedding: {e}")


async def chunking(redis_service: RedisService, executor: ThreadPoolExecutor):
    """Handles document chunking from the Redis queue asynchronously."""
    logger.info(
        f"Subscribed to channel '{knowledge_document_chunk_channel}' for embeddings."
    )

    pubsub = await redis_service.async_subscribe(knowledge_document_chunk_channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                chunk_document_message = ChunkDocumentMessage.model_validate(data)

                # Run blocking function in a ProcessPoolExecutor for CPU-bound work
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    executor, run_chunk_document, chunk_document_message.document_id
                )
                response = ChunkDocumentMessageResponse(
                    success=True,
                    document_id=chunk_document_message.document_id,
                )
                await redis_service.async_publish(
                    channel=knowledge_document_chunk_response,
                    message=response.model_dump(),
                )
            except Exception as e:
                error_message = f"Error processing embedding: {e}"
                logger.error(error_message)
                response = ChunkDocumentMessageResponse(
                    success=False,
                    document_id=chunk_document_message.document_id,
                    message=error_message,
                )
                await redis_service.async_publish(
                    channel=knowledge_document_chunk_response,
                    message=response.model_dump(),
                )


async def searching(redis_service: RedisService):
    """Handles search queries from the Redis queue asynchronously."""
    logger.info(
        f"Subscribed to channel '{knowledge_search_get_channel}' for search queries."
    )

    pubsub = await redis_service.async_subscribe(knowledge_search_get_channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                parsed_data = json.loads(message["data"])
                data = KnowledgeSearchMessage(**parsed_data)
                collection_id = data.collection_id

                logger.info(f"Processing search for collection_id: {collection_id}")

                result = collection_processor_service.search(
                    collection_id=collection_id,
                    uuid=data.uuid,
                    query=data.query,
                    search_limit=data.search_limit,
                    similarity_threshold=data.similarity_threshold,
                )

                await redis_service.async_publish(
                    knowledge_search_response_channel, result
                )

                logger.info(f"Search completed for collection_id: {collection_id}")
            except Exception as e:
                logger.error(f"Error processing search: {e}")


async def main():
    """Runs both tasks concurrently"""
    redis_service = RedisService(
        host=redis_host, port=redis_port, password=redis_password
    )
    await redis_service.connect()

    # Use a ProcessPoolExecutor for CPU-bound tasks
    executor = ThreadPoolExecutor()

    task1 = asyncio.create_task(indexing(redis_service, executor))
    task2 = asyncio.create_task(searching(redis_service))
    task3 = asyncio.create_task(
        chunking(redis_service=redis_service, executor=executor)
    )
    try:
        await asyncio.gather(task1, task2, task3, return_exceptions=True)
    finally:
        executor.shutdown(wait=True)


if __name__ == "__main__":
    asyncio.run(main())
