from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def db_healthcheck() -> bool:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return True
