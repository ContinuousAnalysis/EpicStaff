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
    BaseKnowledgeSearchMessage,
    ProcessRagIndexingMessage,
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
knowledge_indexing_channel = os.getenv(
    "KNOWLEDGE_INDEXING_CHANNEL", "knowledge:indexing"
)


def run_chunk_document(naive_rag_document_config_id: int):
    """Chunk a document based on its NaiveRagDocumentConfig."""
    chunk_document_service.process_chunk_document_by_config_id(
        naive_rag_document_config_id=naive_rag_document_config_id
    )


def run_rag_indexing(rag_id: int, rag_type: str):
    """Runs the RAG indexing process (chunking + embedding) in a separate process."""
    collection_processor_service.process_rag_indexing(rag_id=rag_id, rag_type=rag_type)


async def indexing(redis_service: RedisService, executor: ThreadPoolExecutor, semaphore: asyncio.Semaphore, background_tasks: set):
    """Handles RAG indexing (+ force chunking) from the Redis queue asynchronously."""
    logger.info(
        f"Subscribed to channel '{knowledge_indexing_channel}' for RAG indexing."
    )

    pubsub = await redis_service.async_subscribe(knowledge_indexing_channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                indexing_message = ProcessRagIndexingMessage.model_validate(data)

                logger.info(
                    f"Processing RAG indexing: rag_type={indexing_message.rag_type}, "
                    f"rag_id={indexing_message.rag_id}, "
                    f"collection_id={indexing_message.collection_id}"
                )

                # Create task to run blocking function in executor (non-blocking)
                async def run_indexing_task():
                    async with semaphore:
                        try:
                            loop = asyncio.get_running_loop()
                            await loop.run_in_executor(
                                executor,
                                run_rag_indexing,
                                indexing_message.rag_id,
                                indexing_message.rag_type,
                            )
                            logger.info(
                                f"RAG indexing completed: rag_type={indexing_message.rag_type}, "
                                f"rag_id={indexing_message.rag_id}"
                            )
                        except Exception as e:
                            logger.error(f"Error processing embedding: {e}")

                # Create task and add to background_tasks set to prevent garbage collection
                task = asyncio.create_task(run_indexing_task())
                background_tasks.add(task)
                task.add_done_callback(background_tasks.discard)

            except Exception as e:
                logger.error(f"Error parsing indexing message: {e}")


async def chunking(redis_service: RedisService, executor: ThreadPoolExecutor, semaphore: asyncio.Semaphore, background_tasks: set):
    """
    Handles document chunking from the Redis queue asynchronously.

    Uses naive_rag_document_config_id instead of document_id.
    """
    logger.info(
        f"Subscribed to channel '{knowledge_document_chunk_channel}' for chunking."
    )

    pubsub = await redis_service.async_subscribe(knowledge_document_chunk_channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                chunk_document_message = ChunkDocumentMessage.model_validate(data)

                # Create task to run blocking function in executor (non-blocking)
                async def run_chunking_task():
                    async with semaphore:
                        try:
                            loop = asyncio.get_running_loop()
                            await loop.run_in_executor(
                                executor,
                                run_chunk_document,
                                chunk_document_message.naive_rag_document_config_id,
                            )
                            response = ChunkDocumentMessageResponse(
                                success=True,
                                naive_rag_document_config_id=chunk_document_message.naive_rag_document_config_id,
                            )
                            await redis_service.async_publish(
                                channel=knowledge_document_chunk_response,
                                message=response.model_dump(),
                            )
                        except Exception as e:
                            error_message = f"Error processing chunking: {e}"
                            logger.error(error_message)
                            response = ChunkDocumentMessageResponse(
                                success=False,
                                naive_rag_document_config_id=chunk_document_message.naive_rag_document_config_id,
                                message=error_message,
                            )
                            await redis_service.async_publish(
                                channel=knowledge_document_chunk_response,
                                message=response.model_dump(),
                            )

                # Create task and add to background_tasks set to prevent garbage collection
                task = asyncio.create_task(run_chunking_task())
                background_tasks.add(task)
                task.add_done_callback(background_tasks.discard)

            except Exception as e:
                logger.error(f"Error parsing chunking message: {e}")


async def searching(redis_service: RedisService, semaphore: asyncio.Semaphore, background_tasks: set):
    """
    Handles search queries from the Redis queue asynchronously.

    Uses rag_id and rag_type
    """
    logger.info(
        f"Subscribed to channel '{knowledge_search_get_channel}' for search queries."
    )

    pubsub = await redis_service.async_subscribe(knowledge_search_get_channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                parsed_data = json.loads(message["data"])
                data = BaseKnowledgeSearchMessage(**parsed_data)

                logger.info(
                    f"Processing search for {data.rag_type}_rag_id: {data.rag_id}, collection_id={data.collection_id}"
                )

                # Create task to run blocking search in thread (non-blocking)
                async def run_search_task():
                    async with semaphore:
                        try:
                            # Run synchronous search in thread pool to avoid blocking event loop
                            result = await asyncio.to_thread(
                                collection_processor_service.search,
                                rag_id=data.rag_id,
                                rag_type=data.rag_type,
                                collection_id=data.collection_id,
                                uuid=data.uuid,
                                query=data.query,
                                rag_search_config=data.rag_search_config,
                            )

                            await redis_service.async_publish(
                                knowledge_search_response_channel, result
                            )

                            logger.info(
                                f"Search completed for {data.rag_type}_rag_id: {data.rag_id}"
                            )
                        except Exception as e:
                            logger.error(f"Error processing search: {e}")

                # Create task and add to background_tasks set to prevent garbage collection
                task = asyncio.create_task(run_search_task())
                background_tasks.add(task)
                task.add_done_callback(background_tasks.discard)

            except Exception as e:
                logger.error(f"Error parsing search message: {e}")


async def main():
    """Runs both tasks concurrently"""
    redis_service = RedisService(
        host=redis_host, port=redis_port, password=redis_password
    )
    await redis_service.connect()

    # Use a ThreadPoolExecutor for CPU-bound tasks
    executor = ThreadPoolExecutor()

    # semaphores for rate limiting to respect API limits and DB connections
    search_semaphore = asyncio.Semaphore(10)
    indexing_semaphore = asyncio.Semaphore(3)
    chunking_semaphore = asyncio.Semaphore(10)

    # Track background tasks to prevent garbage collection
    background_tasks = set()

    task1 = asyncio.create_task(indexing(redis_service, executor, indexing_semaphore, background_tasks))
    task2 = asyncio.create_task(searching(redis_service, search_semaphore, background_tasks))
    task3 = asyncio.create_task(
        chunking(redis_service=redis_service, executor=executor, semaphore=chunking_semaphore, background_tasks=background_tasks)
    )
    try:
        await asyncio.gather(task1, task2, task3, return_exceptions=True)
    finally:
        # Wait for all background tasks to complete
        if background_tasks:
            logger.info(f"Waiting for {len(background_tasks)} background tasks to complete...")
            await asyncio.gather(*background_tasks, return_exceptions=True)
        executor.shutdown(wait=True)


if __name__ == "__main__":
    asyncio.run(main())
