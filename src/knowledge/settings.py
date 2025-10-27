from contextlib import contextmanager
import os
import sys

from dotenv import find_dotenv, load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session, Session

from storage.document_chunk_storage import ORMDocumentChunkStorage
from storage.document_storage import ORMDocumentStorage
from storage.knowledge_storage import ORMKnowledgeStorage


def get_required_env_var(key: str) -> str:
    """
    If you see this error during local launch set all required variables in /knowledge/.env
    """
    value = os.getenv(key)
    if value is None:
        raise ValueError(f"Missing required environment variable: {key}")
    return value


DEBUG = False
if len(sys.argv) > 1:
    if "--debug" in sys.argv:
        DEBUG = True

if DEBUG:
    load_dotenv(dotenv_path=find_dotenv("debug.env"))
else:
    load_dotenv()

# Workaround
if os.environ.get("DB_NAME"):
    DB_NAME = get_required_env_var("DB_NAME")
else:
    DB_NAME = get_required_env_var("POSTGRES_DB")

DB_USER = get_required_env_var("DB_KNOWLEDGE_USER")
DB_PASSWORD = get_required_env_var("DB_KNOWLEDGE_PASSWORD")
DB_PORT = get_required_env_var("DB_PORT")
DB_HOST = get_required_env_var("DB_HOST_NAME")

# Construct SQLAlchemy URL
DATABASE_URL = (
    f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# Create engine
ENGINE = create_engine(DATABASE_URL, echo=False, pool_size=10, max_overflow=20)

# Scoped session
SessionLocal = scoped_session(sessionmaker(bind=ENGINE))


class UnitOfWork:
    def __init__(self):
        self.session: Session | None = None
        self.document_storage = None
        self.chunk_storage = None
        self.knowledge_storage = None

    @contextmanager
    def start(self):
        """Start a transactional Unit of Work."""
        self.session = SessionLocal()
        try:
            self.document_storage = ORMDocumentStorage(session=self.session)
            self.chunk_storage = ORMDocumentChunkStorage(session=self.session)
            self.knowledge_storage = ORMKnowledgeStorage(session=self.session)

            yield self

            self.session.commit()
        except Exception as e:
            self.session.rollback()
            raise e
        finally:
            self.session.close()
            self.session = None
