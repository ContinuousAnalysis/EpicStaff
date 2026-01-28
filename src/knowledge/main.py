import os
import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from loguru import logger

from services.collection_processor_service import CollectionProcessorService
from services.redis_service import RedisService
from services.chunking_job_registry import chunking_job_registry
from models.redis_models import (
    ChunkDocumentMessage,
    ChunkDocumentMessageResponse,
    BaseKnowledgeSearchMessage,
    ProcessRagIndexingMessage,
)


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
                async def run_indexing_task(
                    rag_id=indexing_message.rag_id,
                    rag_type=indexing_message.rag_type,
                ):
                    async with semaphore:
                        try:
                            loop = asyncio.get_running_loop()
                            await loop.run_in_executor(
                                executor,
                                run_rag_indexing,
                                rag_id,
                                rag_type,
                            )
                            logger.info(
                                f"RAG indexing completed: rag_type={rag_type}, "
                                f"rag_id={rag_id}"
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
    Handles document preview chunking from the Redis queue asynchronously.

    Features:
    - Uses chunking_job_registry to track running jobs
    - Implements "last request wins" - cancels existing job when new arrives
    - Delegates to CollectionProcessorService -> RAGStrategy for actual chunking
    - Sends response with chunking_job_id and rag_type for correlation
    """
    logger.info(
        f"Subscribed to channel '{knowledge_document_chunk_channel}' for preview chunking."
    )

    pubsub = await redis_service.async_subscribe(knowledge_document_chunk_channel)
    async for message in pubsub.listen():
        if message["type"] == "message":
            try:
                data = json.loads(message["data"])
                chunk_message = ChunkDocumentMessage.model_validate(data)

                config_id = chunk_message.document_config_id
                chunking_job_id = chunk_message.chunking_job_id
                rag_type = chunk_message.rag_type

                logger.info(
                    f"Received chunking request: job_id={chunking_job_id}, "
                    f"rag_type={rag_type}, config_id={config_id}"
                )

                # Create chunking task with job registry integration
                async def run_preview_chunking_task(
                    config_id=config_id,
                    chunking_job_id=chunking_job_id,
                    rag_type=rag_type,
                ):
                    async with semaphore:
                        start_time = time.perf_counter()
                        elapsed_time = None
                        try:
                            # Register job (this will cancel any existing job for same config)
                            current_task = asyncio.current_task()
                            await chunking_job_registry.register_job(
                                document_config_id=config_id,
                                chunking_job_id=chunking_job_id,
                                task=current_task,
                            )

                            # Callback to check if job was cancelled (capture job_id by value)
                            job_id_for_check = chunking_job_id
                            def is_cancelled():
                                return chunking_job_registry.is_cancelled(job_id_for_check)

                            # Run preview chunking via CollectionProcessorService -> Strategy
                            loop = asyncio.get_running_loop()
                            chunk_count = await loop.run_in_executor(
                                executor,
                                collection_processor_service.process_preview_chunking,
                                rag_type,
                                config_id,
                                is_cancelled,
                            )

                            elapsed_time = round(time.perf_counter() - start_time, 3)

                            # Send success response
                            response = ChunkDocumentMessageResponse(
                                chunking_job_id=chunking_job_id,
                                rag_type=rag_type,
                                document_config_id=config_id,
                                status="completed",
                                chunk_count=chunk_count,
                                elapsed_time=elapsed_time,
                            )
                            await redis_service.async_publish(
                                channel=knowledge_document_chunk_response,
                                message=response.model_dump(),
                            )
                            logger.info(
                                f"Chunking completed: job_id={chunking_job_id}, "
                                f"rag_type={rag_type}, config_id={config_id}, chunks={chunk_count}, "
                                f"elapsed_time={elapsed_time}s"
                            )

                        except asyncio.CancelledError:
                            elapsed_time = round(time.perf_counter() - start_time, 3)
                            # Job was cancelled by a newer request
                            logger.info(
                                f"Chunking job cancelled: job_id={chunking_job_id}, "
                                f"rag_type={rag_type}, config_id={config_id}, "
                                f"elapsed_time={elapsed_time}s"
                            )

                            # Send cancelled response
                            response = ChunkDocumentMessageResponse(
                                chunking_job_id=chunking_job_id,
                                rag_type=rag_type,
                                document_config_id=config_id,
                                status="cancelled",
                                message="Job cancelled by newer request",
                                elapsed_time=elapsed_time,
                            )
                            await redis_service.async_publish(
                                channel=knowledge_document_chunk_response,
                                message=response.model_dump(),
                            )

                        except Exception as e:
                            elapsed_time = round(time.perf_counter() - start_time, 3)
                            error_message = f"Error processing chunking: {e}"
                            logger.error(
                                f"Chunking failed: job_id={chunking_job_id}, "
                                f"rag_type={rag_type}, config_id={config_id}, error={e}, "
                                f"elapsed_time={elapsed_time}s"
                            )

                            # Send error response
                            response = ChunkDocumentMessageResponse(
                                chunking_job_id=chunking_job_id,
                                rag_type=rag_type,
                                document_config_id=config_id,
                                status="failed",
                                message=error_message,
                                elapsed_time=elapsed_time,
                            )
                            await redis_service.async_publish(
                                channel=knowledge_document_chunk_response,
                                message=response.model_dump(),
                            )

                        finally:
                            # Unregister only if this job is still the current one
                            # (prevents cancelled job from unregistering newer job)
                            await chunking_job_registry.unregister_job(config_id, chunking_job_id)

                # Create task and add to background_tasks set
                task = asyncio.create_task(run_preview_chunking_task())
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
                # IMPORTANT: Use default args to capture values, not references (closure fix)
                async def run_search_task(search_data=data):
                    async with semaphore:
                        try:
                            # Run synchronous search in thread pool to avoid blocking event loop
                            result = await asyncio.to_thread(
                                collection_processor_service.search,
                                rag_id=search_data.rag_id,
                                rag_type=search_data.rag_type,
                                collection_id=search_data.collection_id,
                                uuid=search_data.uuid,
                                query=search_data.query,
                                rag_search_config=search_data.rag_search_config,
                            )

                            await redis_service.async_publish(
                                knowledge_search_response_channel, result
                            )

                            logger.info(
                                f"Search completed for {search_data.rag_type}_rag_id: {search_data.rag_id}"
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
