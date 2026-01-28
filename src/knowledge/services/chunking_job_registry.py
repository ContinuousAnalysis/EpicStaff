import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional, Set
from loguru import logger


@dataclass
class ChunkingJob:
    """Represents a running chunking job."""

    chunking_job_id: str
    document_config_id: int
    task: asyncio.Task
    cancelled: bool = field(default=False)


class ChunkingJobRegistry:
    """
    In-memory registry for tracking running chunking jobs.

    Implements "last request wins" - cancels existing job when new arrives
    for the same document_config_id.

    Thread-safe through asyncio.Lock for concurrent access.
    """

    def __init__(self):
        # Key: document_config_id, Value: ChunkingJob
        self._jobs: Dict[int, ChunkingJob] = {}
        # Track cancelled job IDs explicitly (survives unregister)
        self._cancelled_job_ids: Set[str] = set()
        self._lock = asyncio.Lock()

    async def register_job(
        self,
        document_config_id: int,
        chunking_job_id: str,
        task: asyncio.Task,
    ) -> Optional[ChunkingJob]:
        """
        Register a new chunking job, cancelling any existing job for the same config.

        Returns:
            The cancelled job if one existed, None otherwise
        """
        async with self._lock:
            cancelled_job = None

            # Check if there's an existing job for this config
            if document_config_id in self._jobs:
                existing = self._jobs[document_config_id]
                existing.cancelled = True
                existing.task.cancel()
                # Track cancelled job ID explicitly
                self._cancelled_job_ids.add(existing.chunking_job_id)
                cancelled_job = existing
                logger.info(
                    f"Cancelled existing chunking job {existing.chunking_job_id} "
                    f"for config {document_config_id}"
                )

            # Register the new job
            self._jobs[document_config_id] = ChunkingJob(
                chunking_job_id=chunking_job_id,
                document_config_id=document_config_id,
                task=task,
            )

            logger.debug(
                f"Registered chunking job {chunking_job_id} "
                f"for config {document_config_id}"
            )

            return cancelled_job

    async def unregister_job(
        self, document_config_id: int, chunking_job_id: str
    ) -> None:
        """
        Remove a job from the registry when it completes (success or failure).

        Only removes if the job_id matches the currently registered job.
        This prevents a cancelled job from unregistering a newer job.

        Args:
            document_config_id: ID of the document config
            chunking_job_id: ID of the job requesting unregister
        """
        async with self._lock:
            if document_config_id in self._jobs:
                job = self._jobs[document_config_id]
                # Only unregister if it's the SAME job (not a newer one)
                if job.chunking_job_id == chunking_job_id:
                    self._jobs.pop(document_config_id)
                    # Clean up cancelled set
                    self._cancelled_job_ids.discard(chunking_job_id)
                    logger.debug(
                        f"Unregistered chunking job {chunking_job_id} "
                        f"for config {document_config_id}"
                    )
                else:
                    logger.debug(
                        f"Skipped unregister for job {chunking_job_id} "
                        f"(current job is {job.chunking_job_id})"
                    )

    def is_cancelled(self, chunking_job_id: str) -> bool:
        """
        Check if a job has been cancelled.

        Used by the chunking service to check if it should abort processing.

        Args:
            chunking_job_id: UUID of the job to check

        Returns:
            True if the job was explicitly cancelled, False otherwise
        """
        # First check the explicit cancelled set (survives unregister)
        if chunking_job_id in self._cancelled_job_ids:
            return True

        # Then check active jobs
        for job in self._jobs.values():
            if job.chunking_job_id == chunking_job_id:
                return job.cancelled

        # Job not found and not in cancelled set = not cancelled
        # (could be not registered yet, or completed normally)
        return False



# Singleton instance
chunking_job_registry = ChunkingJobRegistry()
