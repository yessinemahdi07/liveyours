"""Apply the app's ordered, checksum-verified PostgreSQL migrations."""

import hashlib
import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
MIGRATIONS_DIR = Path(__file__).parent / "migrations"
LOCK_ID = 731042031


def run_migrations(database_url: str | None = None) -> list[str]:
    url = database_url or DATABASE_URL
    if not url:
        raise RuntimeError("DATABASE_URL is required to run database migrations")

    applied_now: list[str] = []
    connection = psycopg2.connect(url)
    try:
        # A transaction-scoped advisory lock also works through Supavisor's
        # transaction pooler (the common Supabase DATABASE_URL on port 6543).
        # Keep the complete schema update atomic so concurrent startup processes
        # cannot race between migration check and application.
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(%s)", (LOCK_ID,))
            cursor.execute("CREATE SCHEMA IF NOT EXISTS liveyours_private")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS liveyours_private.schema_migrations (
                    version TEXT PRIMARY KEY,
                    checksum TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)

            migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
            for migration_file in migration_files:
                sql_bytes = migration_file.read_bytes()
                checksum = hashlib.sha256(sql_bytes).hexdigest()
                version = migration_file.name
                cursor.execute(
                    "SELECT checksum FROM liveyours_private.schema_migrations WHERE version = %s",
                    (version,),
                )
                previous = cursor.fetchone()
                if previous:
                    if previous[0] != checksum:
                        raise RuntimeError(f"Applied migration was edited: {version}")
                    continue
                cursor.execute(sql_bytes.decode("utf-8"))
                cursor.execute(
                    "INSERT INTO liveyours_private.schema_migrations (version, checksum) VALUES (%s, %s)",
                    (version, checksum),
                )
                applied_now.append(version)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    return applied_now
