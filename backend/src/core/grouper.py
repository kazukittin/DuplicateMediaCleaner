import uuid
from dataclasses import dataclass
from typing import Callable, Optional
import numpy as np

from .scanner import ScannedFile
from .hasher import phash_distance, generate_thumbnail


@dataclass
class FileGroup:
    group_id: str
    similarity: int
    file_type: str
    category: str
    files: list


ProgressCallback = Callable[[str, int, int], None]


def similarity_to_category(similarity: int) -> str:
    if similarity == 100:
        return '完全重複 (100%)'
    if similarity >= 95:
        return '極度に類似 (95-99%)'
    if similarity >= 85:
        return 'よく似ている (85-94%)'
    return 'やや似ている (70-84%)'


def _phash_to_int(phash_hex: str) -> int:
    try:
        return int(phash_hex, 16)
    except Exception:
        return 0


def _hamming_distance_batch(query: int, targets: np.ndarray) -> np.ndarray:
    """numpy で query と targets 全要素のハミング距離を一括計算。"""
    xor = targets ^ np.uint64(query)
    # ビットカウント（Kernighan 法を numpy で展開）
    x = xor
    x = x - ((x >> np.uint64(1)) & np.uint64(0x5555555555555555))
    x = (x & np.uint64(0x3333333333333333)) + ((x >> np.uint64(2)) & np.uint64(0x3333333333333333))
    x = (x + (x >> np.uint64(4))) & np.uint64(0x0F0F0F0F0F0F0F0F)
    counts = (x * np.uint64(0x0101010101010101)) >> np.uint64(56)
    return counts.astype(np.int32)


def group_files(
    scanned_files: list[ScannedFile],
    detect_duplicates: bool,
    detect_similar: bool,
    threshold: float,
    on_progress: Optional[ProgressCallback] = None,
) -> list[FileGroup]:
    groups: list[FileGroup] = []
    # グループに入ったファイルの id を追跡
    grouped_ids: set[str] = set()

    def report(phase: str, processed: int, total: int):
        if on_progress:
            on_progress(phase, processed, total)

    def make_file_info(f: ScannedFile, is_keep: bool) -> dict:
        return {
            'id': f.id,
            'path': f.path,
            'size': f.size,
            'modified': f.modified,
            'resolution': f.resolution,
            'duration': f.duration,
            'isKeep': is_keep,
            'thumbnailBase64': None,   # 後でグループファイルだけ生成
        }

    # ── Step 1: 完全重複（SHA-256） ───────────────────────────────────
    if detect_duplicates:
        hash_map: dict[str, list[ScannedFile]] = {}
        for f in scanned_files:
            if f.sha256:   # 空ハッシュ（キャッシュのNULL）は除外して誤マッチを防ぐ
                hash_map.setdefault(f.sha256, []).append(f)

        dup_groups = [v for v in hash_map.values() if len(v) >= 2]
        total_dup = len(dup_groups) or 1

        for idx, files_in_group in enumerate(dup_groups):
            sorted_files = sorted(files_in_group, key=lambda x: (x.size, x.modified), reverse=True)
            group_files_info = [make_file_info(f, i == 0) for i, f in enumerate(sorted_files)]
            groups.append(FileGroup(
                group_id=str(uuid.uuid4()),
                similarity=100,
                file_type=sorted_files[0].file_type,
                category=similarity_to_category(100),
                files=group_files_info,
            ))
            for f in sorted_files:
                grouped_ids.add(f.id)
            if idx % 10 == 0 or idx == total_dup - 1:
                report('完全重複を検出中...', idx + 1, total_dup)

    # ── Step 2: 類似ファイル（numpy 一括ハミング距離） ────────────────
    if detect_similar:
        remaining = [f for f in scanned_files if f.id not in grouped_ids and f.phash]
        total_rem = len(remaining)

        if total_rem > 1:
            # 全 pHash を uint64 配列に変換
            hash_ints = np.array([_phash_to_int(f.phash) for f in remaining], dtype=np.uint64)
            max_dist = int((1.0 - threshold / 100.0) * 64)  # 閾値をハミング距離に変換

            visited = np.zeros(total_rem, dtype=bool)
            # numpy の visited に加え Python set で二重チェック（A-B/B-A 重複グループを確実に防ぐ）
            phase2_used: set[str] = set()

            for i in range(total_rem):
                if visited[i] or remaining[i].id in phase2_used:
                    continue

                # i 番目と全要素のハミング距離を numpy で一括計算
                dists = _hamming_distance_batch(int(hash_ints[i]), hash_ints)
                # 同タイプ・未訪問・閾値以内のインデックスを抽出（自分自身は除く）
                same_type = np.array([remaining[j].file_type == remaining[i].file_type for j in range(total_rem)])
                mask = (~visited) & same_type & (dists <= max_dist)
                mask[i] = False  # 自分自身は除外

                # phase2_used にいるファイルもマスクで除外
                for j in np.where(mask)[0]:
                    if remaining[j].id in phase2_used:
                        mask[j] = False

                cluster_indices = [i] + list(np.where(mask)[0])

                if i % 50 == 0 or i == total_rem - 1:
                    report('類似ファイルを比較中...', i + 1, total_rem)

                if len(cluster_indices) < 2:
                    visited[i] = True
                    phase2_used.add(remaining[i].id)
                    continue

                # クラスタ全員を visited & phase2_used に登録（A-B 登録後に B-A が出ないよう）
                for idx in cluster_indices:
                    visited[idx] = True
                    phase2_used.add(remaining[idx].id)

                cluster = [remaining[idx] for idx in cluster_indices]
                # クラスタ内の平均類似度
                ci = np.array([int(hash_ints[idx]) for idx in cluster_indices], dtype=np.uint64)
                pair_sims = []
                for a in range(len(ci)):
                    dists_inner = _hamming_distance_batch(int(ci[a]), ci)
                    for b in range(a + 1, len(ci)):
                        pair_sims.append(int((1.0 - dists_inner[b] / 64.0) * 100))

                avg_sim = min(99, int(sum(pair_sims) / len(pair_sims)) if pair_sims else int(threshold))
                sorted_cluster = sorted(cluster, key=lambda x: (x.size, x.modified), reverse=True)
                group_files_info = [make_file_info(f, i2 == 0) for i2, f in enumerate(sorted_cluster)]
                groups.append(FileGroup(
                    group_id=str(uuid.uuid4()),
                    similarity=avg_sim,
                    file_type=sorted_cluster[0].file_type,
                    category=similarity_to_category(avg_sim),
                    files=group_files_info,
                ))
                for idx in cluster_indices:
                    grouped_ids.add(remaining[idx].id)

    # ── Step 3: グループに入ったファイルだけサムネイル生成 ────────────
    # （全ファイルではなく対象ファイルのみ → 大幅な時間短縮）
    grouped_file_map = {f.id: f for f in scanned_files if f.id in grouped_ids}
    n_thumb = sum(len(g.files) for g in groups)
    thumb_done = 0

    for g in groups:
        for file_info in g.files:
            sf = grouped_file_map.get(file_info['id'])
            if sf:
                # キャッシュ済みサムネイルがあればそれを使用
                if sf.thumbnail_b64:
                    file_info['thumbnailBase64'] = sf.thumbnail_b64
                else:
                    file_info['thumbnailBase64'] = generate_thumbnail(sf.path, sf.file_type)
            thumb_done += 1
            if thumb_done % 20 == 0 or thumb_done == n_thumb:
                report('サムネイルを生成中...', thumb_done, n_thumb or 1)

    return groups
