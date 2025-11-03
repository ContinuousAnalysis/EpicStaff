from contextlib import contextmanager
from collections.abc import Generator
from typing import Any

from loguru import logger
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.exc import SQLAlchemyError



class BaseORMStorage:
    def __init__(self, session: Session) -> None:
        self.session = session
