from datetime import datetime
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
import os

from models.db_models import RealtimeSessionItem
from sqlalchemy.exc import SQLAlchemyError
from core.config import settings


engine = create_async_engine(settings.DATABASE_URL, echo=False)
SessionLocal = sessionmaker(
    autocommit=False, autoflush=False, bind=engine, class_=AsyncSession
)


async def get_db():
    async with SessionLocal() as session:
        yield session


async def save_realtime_session_item_to_db(data, connection_key):
    """Save data to the database."""
    async with SessionLocal() as db_session:
        try:
            realtime_session_item = RealtimeSessionItem(
                connection_key=connection_key, data=data, created_at=datetime.utcnow()
            )
            db_session.add(realtime_session_item)
            await db_session.commit()
            await db_session.refresh(realtime_session_item)
            return realtime_session_item
        except SQLAlchemyError as e:
            await db_session.rollback()
            logger.exception("Error saving to DB")
