import uuid
from dataclasses import dataclass
from typing import Callable, Optional
from .scanner import ScannedFile
from .hasher import phash_distance


@dataclass
class FileGroup:
    group_id: str
    similarity: int
    file_type: str
    category: str
    files: list


ProgressCallback = Callable[[str, int, int], None]  # (phase, processed, total)


def similarity_to_category(similarity: int) -> str:
    if similarity == 100:
        return '完全重複 (100%)'
    if similarity >= 95:
        return '極度に類似 (95-99%)'
    if similarity >= 85:
        return 'よく似ている (85-94%)'
    return 'やや似ている (70-84%)'


def group_files(
    scanned_files: list[ScannedFile],
    detect_duplicates: bool,
    detect_similar: bool,
    threshold: float,
    on_progress: Optional[ProgressCallback] = None,
) -> list[FileGroup]:
    groups: list[FileGroup] = []

    def report(phase: str, processed: int, total: int):
        if on_progress:
            on_progress(phase, processed, total)

    # ── Step 1: 完全重複（SHA-256） ────────────────────────────────────
    if detect_duplicates:
        hash_map: dict[str, list[ScannedFile]] = {}
        for f in scanned_files:
            hash_map.setdefault(f.sha256, []).append(f)

        dup_groups = [v for v in hash_map.values() if len(v) >= 2]
        total_dup = len(dup_groups) or 1

        for idx, files_in_group in enumerate(dup_groups):
            sorted_files = sorted(files_in_group, key=lambda x: (x.size, x.modified), reverse=True)
            group_files_info = [
                {
                    'id': f.id, 'path': f.path, 'size': f.size,
                    'modified': f.modified, 'resolution': f.resolution,
                    'duration': f.duration, 'is_keep': i == 0,
                    'thumbnail_base64': f.thumbnail_b64,
                }
                for i, f in enumerate(sorted_files)
            ]
            groups.append(FileGroup(
                group_id=str(uuid.uuid4()),
                similarity=100,
                file_type=sorted_files[0].file_type,
                category=similarity_to_category(100),
                files=group_files_info,
            ))
            if idx % 10 == 0 or idx == total_dup - 1:
                report('完全重複を検出中...', idx + 1, total_dup)

    # ── Step 2: 類似ファイル（pHash） ─────────────────────────────────
    if detect_similar:
        grouped_ids = {f['id'] for g in groups for f in g.files}
        remaining = [f for f in scanned_files if f.id not in grouped_ids and f.phash]
        total_rem = len(remaining) or 1

        visited: set[str] = set()
        for i, fi in enumerate(remaining):
            if fi.id in visited:
                continue
            cluster = [fi]
            visited.add(fi.id)

            for fj in remaining:
                if fj.id == fi.id or fj.id in visited:
                    continue
                if fi.file_type != fj.file_type:
                    continue
                if fi.phash and fj.phash and phash_distance(fi.phash, fj.phash) * 100 >= threshold:
                    cluster.append(fj)
                    visited.add(fj.id)

            # 20件ごとに進捗を通知
            if i % 20 == 0 or i == total_rem - 1:
                report('類似ファイルを比較中...', i + 1, total_rem)

            if len(cluster) < 2:
                continue

            sims = [
                phash_distance(cluster[a].phash, cluster[b].phash) * 100
                for a in range(len(cluster))
                for b in range(a + 1, len(cluster))
                if cluster[a].phash and cluster[b].phash
            ]
            avg_sim = min(99, int(sum(sims) / len(sims)) if sims else int(threshold))

            sorted_cluster = sorted(cluster, key=lambda x: (x.size, x.modified), reverse=True)
            group_files_info = [
                {
                    'id': f.id, 'path': f.path, 'size': f.size,
                    'modified': f.modified, 'resolution': f.resolution,
                    'duration': f.duration, 'is_keep': i2 == 0,
                    'thumbnail_base64': f.thumbnail_b64,
                }
                for i2, f in enumerate(sorted_cluster)
            ]
            groups.append(FileGroup(
                group_id=str(uuid.uuid4()),
                similarity=avg_sim,
                file_type=sorted_cluster[0].file_type,
                category=similarity_to_category(avg_sim),
                files=group_files_info,
            ))

    return groups
