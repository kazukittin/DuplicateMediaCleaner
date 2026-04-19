import uuid
from dataclasses import dataclass
from typing import Optional
from .scanner import ScannedFile
from .hasher import phash_distance


@dataclass
class FileGroup:
    group_id: str
    similarity: int
    file_type: str
    category: str
    files: list


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
) -> list[FileGroup]:
    groups: list[FileGroup] = []

    # Step 1: Exact duplicates by SHA-256
    if detect_duplicates:
        hash_map: dict[str, list[ScannedFile]] = {}
        for f in scanned_files:
            hash_map.setdefault(f.sha256, []).append(f)

        for files_in_group in hash_map.values():
            if len(files_in_group) < 2:
                continue
            sorted_files = sorted(files_in_group, key=lambda x: (x.size, x.modified), reverse=True)
            group_files_info = []
            for i, f in enumerate(sorted_files):
                group_files_info.append({
                    'id': f.id,
                    'path': f.path,
                    'size': f.size,
                    'modified': f.modified,
                    'resolution': f.resolution,
                    'duration': f.duration,
                    'is_keep': i == 0,
                    'thumbnail_base64': f.thumbnail_b64,
                })
            groups.append(FileGroup(
                group_id=str(uuid.uuid4()),
                similarity=100,
                file_type=sorted_files[0].file_type,
                category=similarity_to_category(100),
                files=group_files_info,
            ))

    # Step 2: Similar files by pHash
    if detect_similar:
        # Separate already-grouped file ids
        grouped_ids = {f['id'] for g in groups for f in g.files}
        remaining = [f for f in scanned_files if f.id not in grouped_ids and f.phash]

        # Cluster by pHash similarity
        visited = set()
        for i, fi in enumerate(remaining):
            if fi.id in visited:
                continue
            cluster = [fi]
            visited.add(fi.id)
            for j, fj in enumerate(remaining):
                if i == j or fj.id in visited:
                    continue
                if fi.file_type != fj.file_type:
                    continue
                if fi.phash and fj.phash:
                    sim = phash_distance(fi.phash, fj.phash) * 100
                    if sim >= threshold:
                        cluster.append(fj)
                        visited.add(fj.id)

            if len(cluster) < 2:
                continue

            # Calculate avg similarity
            sims = []
            for a in range(len(cluster)):
                for b in range(a + 1, len(cluster)):
                    if cluster[a].phash and cluster[b].phash:
                        sims.append(phash_distance(cluster[a].phash, cluster[b].phash) * 100)
            avg_sim = int(sum(sims) / len(sims)) if sims else int(threshold)
            avg_sim = min(99, avg_sim)  # 100% reserved for exact duplicates

            sorted_cluster = sorted(cluster, key=lambda x: (x.size, x.modified), reverse=True)
            group_files_info = []
            for i, f in enumerate(sorted_cluster):
                group_files_info.append({
                    'id': f.id,
                    'path': f.path,
                    'size': f.size,
                    'modified': f.modified,
                    'resolution': f.resolution,
                    'duration': f.duration,
                    'is_keep': i == 0,
                    'thumbnail_base64': f.thumbnail_b64,
                })
            groups.append(FileGroup(
                group_id=str(uuid.uuid4()),
                similarity=avg_sim,
                file_type=sorted_cluster[0].file_type,
                category=similarity_to_category(avg_sim),
                files=group_files_info,
            ))

    return groups
