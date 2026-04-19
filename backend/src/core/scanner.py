import os
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional
from dataclasses import dataclass, field

from .hasher import (
    get_file_type, sha256_hash,
    compute_image_hashes, compute_video_frame_hashes,
    generate_thumbnail, compute_quality_scores
)
from ..db.cache import get_cached, store_cached


@dataclass
class ScannedFile:
    id: str
    path: str
    size: int
    modified: str
    file_type: str
    sha256: str
    phash: Optional[str]
    dhash: Optional[str]
    resolution: Optional[str]
    duration: Optional[float]
    thumbnail_b64: Optional[str]
    blur_score: int = 0
    noise_score: int = 0
    from_cache: bool = False


@dataclass
class ScanConfig:
    folder_path: str
    include_subfolders: bool = True
    detect_duplicates: bool = True
    detect_similar: bool = True
    similarity_threshold: float = 85.0
    file_types: list = field(default_factory=lambda: ['image', 'video'])


def is_network_path(folder_path: str) -> bool:
    return folder_path.startswith('\\\\') or folder_path.startswith('//')


def collect_files(folder_path: str, include_subfolders: bool, file_types: list[str]) -> list[str]:
    result = []
    normalized = folder_path.replace('/', '\\')
    try:
        if include_subfolders:
            walk_iter = os.walk(normalized, onerror=lambda e: print(f'[scan] skip: {e}'))
        else:
            try:
                entries = os.listdir(normalized)
            except PermissionError as e:
                print(f'[scan] permission denied: {e}')
                return []
            walk_iter = [(normalized, [], entries)]

        for root, _dirs, files in walk_iter:
            for name in files:
                full_path = os.path.join(root, name)
                ft = get_file_type(full_path)
                if ft and ft in file_types:
                    result.append(full_path)
    except Exception as e:
        print(f'[scan] collect_files error: {e}')
    return result


def scan_file_sync(filepath: str) -> Optional[ScannedFile]:
    """Scan a single file, using the hash cache when available."""
    try:
        stat = os.stat(filepath)
        size = stat.st_size
        mtime = stat.st_mtime
        modified = datetime.fromtimestamp(mtime).isoformat()
        file_type = get_file_type(filepath)
        if not file_type:
            return None

        # --- Cache hit ---
        cached = get_cached(filepath, size, mtime)
        if cached:
            return ScannedFile(
                id=str(uuid.uuid4()),
                path=filepath,
                size=size,
                modified=modified,
                file_type=file_type,
                sha256=cached['sha256'] or '',
                phash=cached['phash'],
                dhash=cached['dhash'],
                resolution=cached['resolution'],
                duration=cached['duration'],
                thumbnail_b64=cached['thumbnail_b64'],
                blur_score=cached.get('blur_score', 0),
                noise_score=cached.get('noise_score', 0),
                from_cache=True,
            )

        # --- Cache miss: compute ---
        file_hash = sha256_hash(filepath)
        resolution = None
        duration = None
        blur, noise = compute_quality_scores(filepath, file_type)

        if file_type == 'image':
            phash, dhash = compute_image_hashes(filepath)
            try:
                from PIL import Image
                with Image.open(filepath) as img:
                    resolution = f'{img.width}x{img.height}'
            except Exception:
                pass
        else:
            phash, dhash = compute_video_frame_hashes(filepath)
            try:
                import cv2
                cap = cv2.VideoCapture(filepath)
                fps = cap.get(cv2.CAP_PROP_FPS)
                frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                if fps > 0 and frames > 0:
                    duration = frames / fps
                if w > 0 and h > 0:
                    resolution = f'{w}x{h}'
                cap.release()
            except Exception:
                pass

        # サムネイルはグループ化後に必要なファイルだけ生成する（全件生成は重すぎる）
        thumbnail = None

        # Store in cache（サムネイルは別途キャッシュ済みのものを使用）
        store_cached(filepath, size, mtime, file_hash, phash, dhash, resolution, duration, thumbnail, blur, noise)

        return ScannedFile(
            id=str(uuid.uuid4()),
            path=filepath,
            size=size,
            modified=modified,
            file_type=file_type,
            sha256=file_hash,
            phash=phash,
            dhash=dhash,
            resolution=resolution,
            duration=duration,
            thumbnail_b64=None,
            blur_score=blur,
            noise_score=noise,
            from_cache=False,
        )
    except Exception as e:
        print(f'[scan] error scanning {filepath}: {e}')
        return None
