import hashlib
import xxhash
from pathlib import Path
import imagehash
from PIL import Image
import cv2
import base64
import io
from typing import Optional


IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.ico'}
VIDEO_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v', '.webm'}


def get_file_type(path: str) -> Optional[str]:
    ext = Path(path).suffix.lower()
    if ext in IMAGE_EXTENSIONS:
        return 'image'
    if ext in VIDEO_EXTENSIONS:
        return 'video'
    return None


def sha256_hash(filepath: str) -> str:
    h = xxhash.xxh64()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def compute_image_hashes(filepath: str) -> tuple[Optional[str], Optional[str]]:
    try:
        img = Image.open(filepath).convert('RGB')
        ph = str(imagehash.phash(img))
        dh = str(imagehash.dhash(img))
        return ph, dh
    except Exception:
        return None, None


def compute_video_frame_hashes(filepath: str) -> tuple[Optional[str], Optional[str]]:
    try:
        cap = cv2.VideoCapture(filepath)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            return None, None

        sample_positions = [0, total_frames // 2, max(0, total_frames - 1)]
        frames = []
        for pos in sample_positions:
            cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
            ret, frame = cap.read()
            if ret:
                frames.append(frame)
        cap.release()

        if not frames:
            return None, None

        combined = cv2.hconcat(frames) if len(frames) > 1 else frames[0]
        img = Image.fromarray(cv2.cvtColor(combined, cv2.COLOR_BGR2RGB))
        ph = str(imagehash.phash(img))
        dh = str(imagehash.dhash(img))
        return ph, dh
    except Exception:
        return None, None


def generate_thumbnail(filepath: str, file_type: str, max_size: int = 200) -> Optional[str]:
    try:
        if file_type == 'image':
            img = Image.open(filepath).convert('RGB')
        else:
            cap = cv2.VideoCapture(filepath)
            ret, frame = cap.read()
            cap.release()
            if not ret:
                return None
            img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

        img.thumbnail((max_size, max_size), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=75)
        return base64.b64encode(buf.getvalue()).decode('utf-8')
    except Exception:
        return None


def phash_distance(h1: str, h2: str) -> float:
    try:
        ph1 = imagehash.hex_to_hash(h1)
        ph2 = imagehash.hex_to_hash(h2)
        dist = ph1 - ph2
        max_dist = len(ph1.hash) ** 2
        return 1.0 - (dist / max_dist)
    except Exception:
        return 0.0
