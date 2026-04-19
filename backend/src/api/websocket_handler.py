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
from ..db.cache import get_cache_stats, purge_missing_entries

sio = socketio.AsyncServer(cors_allowed_origins='*', async_mode='asgi')

scan_sessions: dict[str, dict] = {}
cancel_flags: dict[str, bool] = {}

LOGS_DIR = Path(os.environ.get('APPDATA', '')) / 'DuplicateMediaCleaner' / 'logs'
LOGS_DIR.mkdir(parents=True, exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=max(2, os.cpu_count() or 4))


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
        await sio.emit('error', {'message': str(e)}, to=sid)


@sio.event
async def scan_cancel(sid, data):
    cancel_flags[sid] = True


@sio.event
async def delete_files(sid, data):
    file_ids = set(data.get('file_ids', []))
    method = data.get('method', 'trash')

    session = scan_sessions.get(sid)
    if not session:
        await sio.emit('error', {'message': 'No active scan session'}, to=sid)
        return

    all_files = {f['id']: f for g in session['groups'] for f in g.files}
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

    await sio.emit('delete_complete', {
        'success': success,
        'failed': failed,
        'failedFiles': failed_files,
        'freedSpace': freed_space,
    }, to=sid)


async def _run_scan(sid: str, config: ScanConfig):
    loop = asyncio.get_event_loop()
    start_time = loop.time()

    # Collect file list
    await sio.emit('scan_progress', {
        'currentFile': config.folder_path,
        'processed': 0, 'total': 0, 'speed': 0,
        'elapsedTime': 0, 'phase': 'ファイル一覧を取得中...',
        'cacheHits': 0, 'cacheMisses': 0,
    }, to=sid)

    file_paths = await loop.run_in_executor(_executor, lambda: collect_files(
        config.folder_path, config.include_subfolders, config.file_types
    ))
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

    for i, path in enumerate(file_paths):
        if cancel_flags.get(sid):
            return

        elapsed = loop.time() - start_time
        speed = (i + 1) / elapsed if elapsed > 0 else 0

        result = await loop.run_in_executor(_executor, scan_file_sync, path)
        if result:
            scanned.append(result)
            if result.from_cache:
                cache_hits += 1

        if i % 5 == 0:
            await sio.emit('scan_progress', {
                'currentFile': path,
                'processed': i + 1,
                'total': total,
                'speed': round(speed, 1),
                'elapsedTime': round(elapsed, 1),
                'phase': 'ファイルを分析中...',
                'cacheHits': cache_hits,
                'cacheMisses': (i + 1) - cache_hits,
            }, to=sid)
            await asyncio.sleep(0)

    # Grouping phase
    await sio.emit('scan_progress', {
        'currentFile': '',
        'processed': total, 'total': total, 'speed': 0,
        'elapsedTime': round(loop.time() - start_time, 1),
        'phase': 'グループ化中...',
        'cacheHits': cache_hits,
        'cacheMisses': total - cache_hits,
    }, to=sid)

    groups = await loop.run_in_executor(_executor, lambda: group_files(
        scanned, config.detect_duplicates, config.detect_similar, config.similarity_threshold
    ))

    duplicate_groups = sum(1 for g in groups if g.similarity == 100)
    similar_groups = sum(1 for g in groups if g.similarity < 100)
    deletable_files = sum(len([f for f in g.files if not f['is_keep']]) for g in groups)
    recoverable_space = sum(f['size'] for g in groups for f in g.files if not f['is_keep'])

    scan_id = str(uuid.uuid4())
    scan_sessions[sid] = {'scan_id': scan_id, 'groups': groups}

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
