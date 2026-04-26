from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from helpers.logger import logger
from db.config import AsyncSessionLocal


class ScheduleTriggerNodeRepository:
    """Read/update tables_scheduletriggernode from Manager.

    Manager uses a restricted DB user (manager_user, SELECT/UPDATE only) —
    no Django ORM here, raw SQL via SQLAlchemy async.
    """

    def __init__(self, session_factory=None):
        self.session_factory = session_factory or AsyncSessionLocal

    async def _execute_with_session(self, operation):
        """Run an operation in a session with automatic commit/rollback."""
        async with self.session_factory() as session:
            try:
                result = await operation(session)
                await session.commit()
                return result
            except SQLAlchemyError as exc:
                await session.rollback()
                logger.error(f"[ScheduleRepo] DB error: {exc}")
                raise
            except Exception as exc:
                await session.rollback()
                logger.error(f"[ScheduleRepo] Unexpected error: {exc}")
                raise

    async def get_all_active_schedule_nodes(self) -> list[dict] | None:
        """Return all schedule nodes with is_active=true.

        Empty list when there are none; None on DB error (caller decides retry).
        """

        async def operation(session: AsyncSession):
            query = text(
                """
                SELECT
                    id, node_name, graph_id, is_active, timezone, run_mode,
                    start_date_time, every, unit, weekdays,
                    end_type, end_date_time, max_runs, current_runs
                FROM tables_scheduletriggernode
                WHERE is_active = true
                """
            )
            result = await session.execute(query)
            rows = result.fetchall()

            if not rows:
                return []

            return [
                {
                    "id": row.id,
                    "node_name": row.node_name,
                    "graph": row.graph_id,
                    "is_active": row.is_active,
                    "timezone": row.timezone or "UTC",
                    "run_mode": row.run_mode,
                    "start_date_time": (
                        row.start_date_time.isoformat() if row.start_date_time else None
                    ),
                    "every": row.every,
                    "unit": row.unit,
                    "weekdays": row.weekdays,
                    "end_type": row.end_type,
                    "end_date_time": (
                        row.end_date_time.isoformat() if row.end_date_time else None
                    ),
                    "max_runs": row.max_runs,
                    "current_runs": row.current_runs,
                }
                for row in rows
            ]

        try:
            return await self._execute_with_session(operation)
        except Exception:
            logger.exception("[ScheduleRepo] Failed to get active schedule nodes")
            return None
