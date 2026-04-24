import asyncio
import uuid
import os
import csv
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import socketio

from ..core.scanner import ScanConfig, collect_files, scan_file_sync
from ..core.grouper import group_files
from ..core.hasher import generate_thumbnail
from ..db.cache import get_cache_stats, purge_missing_entries, mark_deleted, get_deleted_paths, update_thumbnail_cache

sio = socketio.AsyncServer(cors_allowed_origins='*', async_mode='asgi', max_http_buffer_size=10**9)

# 最後のスキャン結果をグローバルに保持（sid に依存しないため再接続後も削除可能）
latest_session: dict | None = None
cancel_flags: dict[str, bool] = {}

LOGS_DIR = Path(os.environ.get('APPDATA', '')) / 'DuplicateMediaCleaner' / 'logs'
LOGS_DIR.mkdir(parents=True, exist_ok=True)

_WORKERS = min(8, max(2, os.cpu_count() or 4))
_scan_executor  = ThreadPoolExecutor(max_workers=_WORKERS)  # スキャン用
_thread_executor = ThreadPoolExecutor(max_workers=2)        # グループ化・DB用


@sio.event
async def connect(sid, environ):
    print(f'Client connected: {sid}')
    cancel_flags[sid] = False


@sio.event
async def disconnect(sid):
    cancel_flags[sid] = True
    print(f'Client disconnected: {sid}')


@sio.event
async def scan_start(sid, data):
    cancel_flags[sid] = False
    config = ScanConfig(
        folder_path=data.get('folder_path', ''),
        include_subfolders=data.get('include_subfolders', True),
        detect_duplicates=data.get('detect_duplicates', True),
        detect_similar=data.get('detect_similar', True),
        similarity_threshold=float(data.get('similarity_threshold', 85)),
        file_types=data.get('file_types', ['image', 'video']),
    )
    try:
        await _run_scan(sid, config)
    except Exception as e:
        import traceback
        traceback.print_exc()
        await sio.emit('error', {'message': str(e)}, to=sid)


@sio.event
async def scan_cancel(sid, data):
    cancel_flags[sid] = True


@sio.event
async def delete_files(sid, data):
    global latest_session
    file_ids = set(data.get('file_ids', []))
    method = data.get('method', 'trash')

    if not latest_session:
        await sio.emit('error', {'message': 'No active scan session'}, to=sid)
        return

    all_files = {f['id']: f for g in latest_session['groups'] for f in g.files}
    to_delete = [all_files[fid] for fid in file_ids if fid in all_files]

    success = 0
    failed = 0
    failed_files = []
    freed_space = 0
    log_rows = []

    for i, file_info in enumerate(to_delete):
        await sio.emit('delete_progress', {'processed': i + 1, 'total': len(to_delete)}, to=sid)
        path = file_info['path']
        try:
            size = file_info['size']
            if method == 'trash':
                from send2trash import send2trash
                send2trash(path)
            else:
                os.remove(path)
            success += 1
            freed_space += size
            log_rows.append({'path': path, 'size': size, 'status': 'deleted', 'method': method,
                              'timestamp': datetime.now().isoformat(), 'error': ''})
        except Exception as e:
            failed += 1
            failed_files.append({'path': path, 'reason': str(e)})
            log_rows.append({'path': path, 'size': 0, 'status': 'failed', 'method': method,
                              'timestamp': datetime.now().isoformat(), 'error': str(e)})
        await asyncio.sleep(0)

    log_path = LOGS_DIR / f'delete_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
    with open(log_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['path', 'size', 'status', 'method', 'timestamp', 'error'])
        writer.writeheader()
        writer.writerows(log_rows)

    # 削除成功したパスを「削除済み」としてDBに記録
    try:
        deleted_paths = [r['path'] for r in log_rows if r['status'] == 'deleted']
        if deleted_paths:
            mark_deleted(deleted_paths)
    except Exception as e:
        print(f'[delete] Error recording deleted paths: {e}')

    await sio.emit('delete_complete', {
        'success': success,
        'failed': failed,
        'failedFiles': failed_files,
        'freedSpace': freed_space,
    }, to=sid)


async def _run_scan(sid: str, config: ScanConfig):
    global latest_session
    loop = asyncio.get_running_loop()
    start_time = loop.time()

    # Collect file list
    await sio.emit('scan_progress', {
        'currentFile': config.folder_path,
        'processed': 0, 'total': 0, 'speed': 0,
        'elapsedTime': 0, 'phase': 'ファイル一覧を取得中...',
        'cacheHits': 0, 'cacheMisses': 0,
    }, to=sid)

    file_paths = await loop.run_in_executor(_thread_executor, lambda: collect_files(
        config.folder_path, config.include_subfolders, config.file_types
    ))

    # 過去に削除したファイルはスキャン対象から除外
    deleted = get_deleted_paths()
    if deleted:
        before = len(file_paths)
        file_paths = [p for p in file_paths if p not in deleted]
        skipped = before - len(file_paths)
        if skipped:
            print(f'[scan] skipped {skipped} previously-deleted file(s)')

    total = len(file_paths)

    if total == 0:
        await sio.emit('scan_complete', {
            'scanId': str(uuid.uuid4()),
            'statistics': {'totalFiles': 0, 'duplicateGroups': 0, 'similarGroups': 0,
                           'deletableFiles': 0, 'recoverableSpace': 0, 'cacheHits': 0},
            'groups': [],
        }, to=sid)
        return

    scanned = []
    cache_hits = 0
    BATCH = 100  # asyncio.gather で同時に処理するファイル数

    for batch_start in range(0, total, BATCH):
        if cancel_flags.get(sid):
            return

        batch = file_paths[batch_start:batch_start + BATCH]

        # asyncio ノンブロッキング並列実行（イベントループをブロックしない）
        tasks = [loop.run_in_executor(_scan_executor, scan_file_sync, p) for p in batch]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                continue
            if result:
                scanned.append(result)
                if result.from_cache:
                    cache_hits += 1

        processed = min(batch_start + BATCH, total)
        elapsed = loop.time() - start_time
        speed = processed / elapsed if elapsed > 0 else 0

        await sio.emit('scan_progress', {
            'currentFile': batch[-1] if batch else '',
            'processed': processed,
            'total': total,
            'totalScanned': total,
            'speed': round(speed, 1),
            'elapsedTime': round(elapsed, 1),
            'phase': 'ファイルを分析中...',
            'cacheHits': cache_hits,
            'cacheMisses': processed - cache_hits,
        }, to=sid)
        await asyncio.sleep(0)

    # Grouping phase — コールバックでスレッドから進捗を送信
    def make_group_progress_callback(event_loop):
        def callback(phase: str, processed: int, group_total: int):
            payload = {
                'currentFile': '',
                'processed': processed,
                'total': group_total,
                'totalScanned': total,   # グループ化中も総スキャン数は変わらない
                'speed': 0,
                'elapsedTime': round(event_loop.time() - start_time, 1),
                'phase': phase,
                'cacheHits': cache_hits,
                'cacheMisses': total - cache_hits,
            }
            asyncio.run_coroutine_threadsafe(sio.emit('scan_progress', payload, to=sid), event_loop)
        return callback

    groups = await loop.run_in_executor(
        _thread_executor,
        lambda: group_files(
            scanned,
            config.detect_duplicates,
            config.detect_similar,
            config.similarity_threshold,
            on_progress=make_group_progress_callback(loop),
        ),
    )

    duplicate_groups = sum(1 for g in groups if g.similarity == 100)
    similar_groups = sum(1 for g in groups if g.similarity < 100)
    deletable_files = sum(len([f for f in g.files if not f['isKeep']]) for g in groups)
    recoverable_space = sum(f['size'] for g in groups for f in g.files if not f['isKeep'])

    scan_id = str(uuid.uuid4())
    latest_session = {'scan_id': scan_id, 'groups': groups}

    groups_data = [
        {'groupId': g.group_id, 'similarity': g.similarity, 'fileType': g.file_type,
         'category': g.category, 'files': g.files}
        for g in groups
    ]

    await sio.emit('scan_complete', {
        'scanId': scan_id,
        'statistics': {
            'totalFiles': total,
            'duplicateGroups': duplicate_groups,
            'similarGroups': similar_groups,
            'deletableFiles': deletable_files,
            'recoverableSpace': recoverable_space,
            'cacheHits': cache_hits,
        },
        'groups': groups_data,
    }, to=sid)

    # scan_complete 送信直後にサムネイルをバックグラウンドで生成開始
    # → フロントエンドは結果画面をすぐに表示でき、サムネイルは逐次届く
    scanned_map = {sf.id: sf for sf in scanned}
    asyncio.ensure_future(_generate_thumbnails_bg(sid, groups, scanned_map, loop))


async def _generate_thumbnails_bg(sid: str, groups, scanned_map: dict, loop):
    """
    scan_complete 後にバックグラウンドでサムネイルを並列生成する。

    優先順位:
      1. キャッシュ済みサムネイル → 即座にまとめて送信（生成不要）
      2. 各グループ先頭2ファイル（ユーザーが最初に目にする）
      3. 残りのファイル（上限 MAX_TAIL まで）

    生成したサムネイルは DB にキャッシュし、次回スキャン時は即表示。
    """
    try:
        # フロントエンドが scan_complete を受信して ResultsScreen をマウントし
        # thumbnail_batch ハンドラを登録するまでの時間を確保する
        await asyncio.sleep(0.5)

        print(f'[thumb] start: {len(groups)} groups, {len(scanned_map)} files in map')

        MAX_DUP_GROUPS = 200    # 重複・類似グループの優先対象上限
        MAX_DUP_FILES  = 2      # グループあたりの優先ファイル数
        MAX_BAD_GROUPS = 300    # ブレ・ノイズグループの優先対象上限
        MAX_TAIL       = 100    # それ以降の補完ファイル上限
        BATCH = _WORKERS        # 一度に asyncio.gather する件数

        def _is_bad_quality(g) -> bool:
            return 'ブレ' in g.category or 'ノイズ' in g.category

        # ── Phase 0: キャッシュ済みサムネイルを 50 件ずつ送信 ──────────────
        cached_batch: dict[str, str] = {}
        for g in groups:
            for file_info in g.files:
                sf = scanned_map.get(file_info['id'])
                if sf and sf.thumbnail_b64:
                    cached_batch[file_info['id']] = sf.thumbnail_b64

        print(f'[thumb] phase0: {len(cached_batch)} cached thumbnails')
        cached_items = list(cached_batch.items())
        for i in range(0, len(cached_items), 50):
            chunk = dict(cached_items[i:i + 50])
            await sio.emit('thumbnail_batch', {'thumbnails': chunk}, to=sid)
            await asyncio.sleep(0)

        already_sent = set(cached_batch.keys())

        def _collect(group_iter, max_groups: int, max_files_per_group: int) -> list:
            result = []
            count = 0
            for g in group_iter:
                if count >= max_groups:
                    break
                added = False
                for file_info in g.files[:max_files_per_group]:
                    fid = file_info['id']
                    if fid in already_sent:
                        continue
                    sf = scanned_map.get(fid)
                    if sf:
                        result.append((fid, sf))
                        added = True
                if added:
                    count += 1
            return result

        # ── Phase 1a: 重複・類似グループ（類似度降順・先頭 2 ファイル × 200 グループ）──
        dup_groups = sorted(
            [g for g in groups if not _is_bad_quality(g)],
            key=lambda g: g.similarity, reverse=True
        )
        # ── Phase 1b: ブレ・ノイズグループ（スコア降順・1 ファイル × 300 グループ）──
        # フロントエンドも similarity 降順で表示するため、同じ順で処理する
        bad_groups = sorted(
            [g for g in groups if _is_bad_quality(g)],
            key=lambda g: g.similarity, reverse=True
        )
        priority_dup = _collect(dup_groups, MAX_DUP_GROUPS, MAX_DUP_FILES)

        priority_ids_so_far = already_sent | {fid for fid, _ in priority_dup}
        priority_bad: list[tuple[str, object]] = []
        bad_count = 0
        for g in bad_groups:
            if bad_count >= MAX_BAD_GROUPS:
                break
            for file_info in g.files[:1]:
                fid = file_info['id']
                if fid in priority_ids_so_far:
                    continue
                sf = scanned_map.get(fid)
                if sf:
                    priority_bad.append((fid, sf))
                    bad_count += 1

        # ── Phase 2: 残り補完（上限付き）─────────────────────────────────
        all_priority_ids = priority_ids_so_far | {fid for fid, _ in priority_bad}
        tail: list[tuple[str, object]] = []
        for g in groups:
            for file_info in g.files:
                fid = file_info['id']
                if fid in all_priority_ids:
                    continue
                sf = scanned_map.get(fid)
                if sf and not sf.thumbnail_b64:
                    tail.append((fid, sf))
                if len(tail) >= MAX_TAIL:
                    break
            if len(tail) >= MAX_TAIL:
                break

        all_targets = priority_dup + priority_bad + tail
        print(f'[thumb] dup={len(priority_dup)} bad={len(priority_bad)} tail={len(tail)} total={len(all_targets)}')

        def _gen_and_cache(sf) -> str | None:
            """スレッド内でサムネイル生成 → DB キャッシュ更新（キャッシュ済みならそのまま返す）"""
            try:
                # キャッシュ済みサムネイルがあればそのまま返す（再生成不要）
                if sf.thumbnail_b64:
                    return sf.thumbnail_b64
                thumb = generate_thumbnail(sf.path, sf.file_type)
                if thumb:
                    try:
                        update_thumbnail_cache(sf.path, thumb)
                    except Exception as e:
                        print(f'[thumb] cache update error: {e}')
                else:
                    print(f'[thumb] generate_thumbnail returned None: {sf.path} (type={sf.file_type})')
                return thumb
            except Exception as e:
                print(f'[thumb] _gen_and_cache exception: {sf.path}: {e}')
                return None

        generated = 0
        for batch_start in range(0, len(all_targets), BATCH):
            if cancel_flags.get(sid):
                print('[thumb] cancelled')
                break

            batch = all_targets[batch_start:batch_start + BATCH]
            tasks = [
                loop.run_in_executor(_scan_executor, _gen_and_cache, sf)
                for _, sf in batch
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            batch_data: dict[str, str] = {}
            for (file_id, _), result in zip(batch, results):
                if isinstance(result, Exception):
                    print(f'[thumb] gather exception: {result}')
                elif isinstance(result, str) and result:
                    batch_data[file_id] = result
                    generated += 1

            if batch_data:
                await sio.emit('thumbnail_batch', {'thumbnails': batch_data}, to=sid)
                print(f'[thumb] sent {len(batch_data)} thumbnails (total: {generated})')

            await asyncio.sleep(0)

        print(f'[thumb] done. generated={generated}')

    except Exception as e:
        import traceback
        print(f'[thumb] FATAL ERROR: {e}')
        traceback.print_exc()
