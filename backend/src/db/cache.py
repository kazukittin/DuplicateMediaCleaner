from sqlalchemy import text
from datetime import datetime
from typing import Optional
from .models import engine


CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS file_hash_cache (
    path      TEXT    PRIMARY KEY,
    size      INTEGER NOT NULL,
    mtime     REAL    NOT NULL,
    sha256    TEXT,
    phash     TEXT,
    dhash     TEXT,
    resolution TEXT,
    duration  REAL,
    thumbnail_b64 TEXT,
    cached_at TEXT    NOT NULL
)
"""

CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_cache_path ON file_hash_cache (path)
"""


def init_cache():
    with engine.connect() as conn:
        conn.execute(text(CREATE_TABLE))
        conn.execute(text(CREATE_INDEX))
        conn.commit()


def get_cached(path: str, size: int, mtime: float) -> Optional[dict]:
    """Return cached record if path/size/mtime all match, else None."""
    with engine.connect() as conn:
        row = conn.execute(
            text('SELECT * FROM file_hash_cache WHERE path = :path'),
            {'path': path},
        ).fetchone()
    if row is None:
        return None
    if row.size != size or abs(row.mtime - mtime) > 0.001:
        return None
    return dict(row._mapping)


def store_cached(
    path: str,
    size: int,
    mtime: float,
    sha256: Optional[str],
    phash: Optional[str],
    dhash: Optional[str],
    resolution: Optional[str],
    duration: Optional[float],
    thumbnail_b64: Optional[str],
) -> None:
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO file_hash_cache
                    (path, size, mtime, sha256, phash, dhash, resolution, duration, thumbnail_b64, cached_at)
                VALUES
                    (:path, :size, :mtime, :sha256, :phash, :dhash, :resolution, :duration, :thumbnail_b64, :cached_at)
                ON CONFLICT(path) DO UPDATE SET
                    size=excluded.size,
                    mtime=excluded.mtime,
                    sha256=excluded.sha256,
                    phash=excluded.phash,
                    dhash=excluded.dhash,
                    resolution=excluded.resolution,
                    duration=excluded.duration,
                    thumbnail_b64=excluded.thumbnail_b64,
                    cached_at=excluded.cached_at
            """),
            {
                'path': path,
                'size': size,
                'mtime': mtime,
                'sha256': sha256,
                'phash': phash,
                'dhash': dhash,
                'resolution': resolution,
                'duration': duration,
                'thumbnail_b64': thumbnail_b64,
                'cached_at': datetime.utcnow().isoformat(),
            },
        )
        conn.commit()


def purge_missing_entries() -> int:
    """Remove cache entries whose files no longer exist."""
    import os
    with engine.connect() as conn:
        rows = conn.execute(text('SELECT path FROM file_hash_cache')).fetchall()
    missing = [r.path for r in rows if not os.path.exists(r.path)]
    if missing:
        with engine.connect() as conn:
            conn.execute(
                text('DELETE FROM file_hash_cache WHERE path IN :paths'),
                {'paths': tuple(missing)},
            )
            conn.commit()
    return len(missing)


def get_cache_stats() -> dict:
    with engine.connect() as conn:
        count = conn.execute(text('SELECT COUNT(*) FROM file_hash_cache')).scalar()
    return {'cached_files': count}
