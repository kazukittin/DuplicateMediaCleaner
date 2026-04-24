from sqlalchemy import text
from pathlib import Path
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
    blur_score INTEGER DEFAULT 0,
    noise_score INTEGER DEFAULT 0,
    cached_at TEXT    NOT NULL
)
"""

CREATE_DELETED_TABLE = """
CREATE TABLE IF NOT EXISTS deleted_files (
    path       TEXT    PRIMARY KEY,
    deleted_at TEXT    NOT NULL
)
"""

CREATE_DELETED_INDEX = """
CREATE INDEX IF NOT EXISTS idx_deleted_path ON deleted_files (path)
"""

CREATE_INDEX = """
CREATE INDEX IF NOT EXISTS idx_cache_path ON file_hash_cache (path)
"""


def init_cache():
    with engine.connect() as conn:
        conn.execute(text(CREATE_TABLE))
        conn.execute(text(CREATE_INDEX))
        conn.execute(text(CREATE_DELETED_TABLE))
        conn.execute(text(CREATE_DELETED_INDEX))
        
        # Add columns if they don't exist (for backward compatibility)
        try: conn.execute(text("ALTER TABLE file_hash_cache ADD COLUMN blur_score INTEGER DEFAULT 0"))
        except Exception: pass
        try: conn.execute(text("ALTER TABLE file_hash_cache ADD COLUMN noise_score INTEGER DEFAULT 0"))
        except Exception: pass
        
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
    blur_score: int = 0,
    noise_score: int = 0,
) -> None:
    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO file_hash_cache
                    (path, size, mtime, sha256, phash, dhash, resolution, duration, thumbnail_b64, blur_score, noise_score, cached_at)
                VALUES
                    (:path, :size, :mtime, :sha256, :phash, :dhash, :resolution, :duration, :thumbnail_b64, :blur_score, :noise_score, :cached_at)
                ON CONFLICT(path) DO UPDATE SET
                    size=excluded.size,
                    mtime=excluded.mtime,
                    sha256=excluded.sha256,
                    phash=excluded.phash,
                    dhash=excluded.dhash,
                    resolution=excluded.resolution,
                    duration=excluded.duration,
                    thumbnail_b64=excluded.thumbnail_b64,
                    blur_score=excluded.blur_score,
                    noise_score=excluded.noise_score,
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
                'blur_score': blur_score,
                'noise_score': noise_score,
                'cached_at': datetime.utcnow().isoformat(),
            },
        )
        conn.commit()


def update_thumbnail_cache(path: str, thumbnail_b64: str) -> None:
    """既存キャッシュエントリのサムネイルだけを更新する（生成後に呼び出す）。"""
    with engine.connect() as conn:
        conn.execute(
            text('UPDATE file_hash_cache SET thumbnail_b64 = :thumb WHERE path = :path'),
            {'thumb': thumbnail_b64, 'path': path},
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


def mark_deleted(paths: list[str]) -> None:
    """Record file paths as deleted so they are excluded from future scans."""
    if not paths:
        return
    now = datetime.utcnow().isoformat()
    with engine.connect() as conn:
        for p in paths:
            conn.execute(
                text("""
                    INSERT INTO deleted_files (path, deleted_at)
                    VALUES (:path, :deleted_at)
                    ON CONFLICT(path) DO UPDATE SET deleted_at=excluded.deleted_at
                """),
                {'path': p, 'deleted_at': now},
            )
        conn.commit()


def is_deleted(path: str) -> bool:
    """Return True if the path was previously deleted by this app."""
    with engine.connect() as conn:
        row = conn.execute(
            text('SELECT 1 FROM deleted_files WHERE path = :path'),
            {'path': path},
        ).fetchone()
    return row is not None


def get_deleted_paths() -> set[str]:
    """Return the set of all paths recorded as deleted."""
    with engine.connect() as conn:
        rows = conn.execute(text('SELECT path FROM deleted_files')).fetchall()
    return {r.path for r in rows}


def unmark_deleted(paths: list[str]) -> None:
    """Remove paths from the deleted list (e.g. if the file was restored from trash)."""
    if not paths:
        return
    with engine.connect() as conn:
        for p in paths:
            conn.execute(text('DELETE FROM deleted_files WHERE path = :path'), {'path': p})
        conn.commit()
