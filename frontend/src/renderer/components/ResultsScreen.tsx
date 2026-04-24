import { useState, useLayoutEffect } from 'react'
import {
  Image,
  Film,
  Trash2,
  ChevronRight,
  CheckSquare,
  Square,
  ExternalLink,
  HardDrive,
  RotateCcw,
  Zap,
  Maximize2,
  X,
  Shield,
} from 'lucide-react'
import { useAppStore, getSelectedCount, getSelectedSize } from '../stores/appStore'
import { useWebSocket } from '../hooks/useWebSocket'
import type { FileGroup, FileInfo } from '../types'
import { formatBytes, formatDate } from '../utils/format'

export default function ResultsScreen() {
  const {
    scanResult,
    activeCategory,
    selectedFileIds,
    thumbnails,
    setActiveCategory,
    toggleFileSelection,
    selectAllInGroup,
    clearSelection,
    setScreen,
    reset,
    updateThumbnails,
  } = useAppStore()

  const [compareGroup, setCompareGroup] = useState<FileGroup | null>(null)
  const [viewMode, setViewMode] = useState<'duplicates' | 'bad_quality'>('duplicates')
  const [displayLimit, setDisplayLimit] = useState(100)

  // バックグラウンドで届くサムネイルを受信してストアに逐次反映
  const { connect } = useWebSocket({ onThumbnailBatch: updateThumbnails })
  useLayoutEffect(() => {
    const socket = connect()
    return () => { socket?.off('thumbnail_batch') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!scanResult) return null

  const { statistics, groups } = scanResult

  // 表示モードでフィルタリング
  const isBadQuality = (g: FileGroup) => g.category.includes('ブレ画像') || g.category.includes('ノイズ画像')
  const viewGroups = groups.filter(g => viewMode === 'bad_quality' ? isBadQuality(g) : !isBadQuality(g))

  // 選択中のモードのグループを類似度/スコア降順でソート
  const sortedGroups = [...viewGroups].sort((a, b) => b.similarity - a.similarity)
  const visibleGroups = sortedGroups.slice(0, displayLimit)

  const selectedCount = getSelectedCount(useAppStore.getState())
  const selectedSize = getSelectedSize(useAppStore.getState())

  // すべてのグループを一括選択
  const selectAllFiltered = () => {
    sortedGroups.forEach((g) => selectAllInGroup(g))
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="bg-bg-card border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <HardDrive size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-primary">スキャン結果</h1>
            <p className="text-xs text-text-secondary">
              重複: {statistics.duplicateGroups} / 類似: {statistics.similarGroups} グループ
            </p>
          </div>
        </div>

        <div className="flex gap-6 text-center">
          <div>
            <p className="text-xs text-text-muted">削除対象</p>
            <p className="text-lg font-bold text-accent">{statistics.deletableFiles} 件</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">解放容量</p>
            <p className="text-lg font-bold text-success">{formatBytes(statistics.recoverableSpace)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted">選択中</p>
            <p className="text-lg font-bold text-primary">{selectedCount} 件</p>
          </div>
          {(statistics.cacheHits ?? 0) > 0 && (
            <div className="flex items-center gap-1 text-xs text-success border border-success/30 bg-success/10 rounded-lg px-2 py-1">
              <Zap size={12} />
              キャッシュ {statistics.cacheHits} 件
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="px-3 py-2 border border-border hover:border-primary text-text-secondary hover:text-primary rounded-lg text-sm transition-colors flex items-center gap-1"
          >
            <RotateCcw size={14} />
            最初に戻る
          </button>
          <button
            onClick={() => setScreen('delete-confirm')}
            disabled={selectedCount === 0}
            className="px-4 py-2 bg-accent hover:bg-accent/80 disabled:bg-bg-panel disabled:text-text-muted text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Trash2 size={15} />
            削除 ({selectedCount})
          </button>
        </div>
      </div>

      {/* ── Tabs & Select All Toolbar ── */}
      <div className="bg-bg-card border-b border-border px-4 flex items-stretch justify-between">
        {/* ViewMode Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => { setViewMode('duplicates'); setActiveCategory(null); setDisplayLimit(100) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'duplicates'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            類似・重複
            <span className="text-xs text-text-muted">
              ({groups.filter(g => !isBadQuality(g)).length})
            </span>
          </button>
          <button
            onClick={() => { setViewMode('bad_quality'); setActiveCategory(null); setDisplayLimit(100) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'bad_quality'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            ブレ・ノイズ
            <span className="text-xs text-text-muted">
              ({groups.filter(g => isBadQuality(g)).length})
            </span>
          </button>
        </div>

        {/* 一括選択ボタン */}
        <div className="flex items-center gap-2 py-1.5">
          <button
            onClick={selectAllFiltered}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium transition-colors"
          >
            <CheckSquare size={13} />
            表示中の候補を全選択
          </button>
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted hover:text-text-secondary border border-border hover:border-text-muted rounded-lg text-xs transition-colors"
          >
            <Square size={13} />
            選択解除
          </button>
        </div>
      </div>

      {/* ── Body: main list ── */}
      <div className="flex-1 overflow-hidden">
        {/* Main: results list */}
        <div className="h-full bg-bg-base overflow-y-auto w-full p-4 space-y-4">
          <div className="px-1">
            <p className="text-xs text-text-muted">
              {sortedGroups.length} グループ（表示中: {visibleGroups.length}）
            </p>
          </div>
          {visibleGroups.map((group) => (
            <GroupCard
              key={group.groupId}
              group={group}
              selectedFileIds={selectedFileIds}
              thumbnails={thumbnails}
              onToggle={toggleFileSelection}
              onSelectAll={() => selectAllInGroup(group)}
              onCompare={() => setCompareGroup(group)}
            />
          ))}
          {displayLimit < sortedGroups.length && (
            <div className="flex flex-col items-center gap-2 py-4">
              <p className="text-xs text-text-muted">
                残り {sortedGroups.length - displayLimit} グループ
              </p>
              <button
                onClick={() => setDisplayLimit(d => d + 100)}
                className="px-6 py-2 bg-bg-card border border-border hover:border-primary text-text-secondary hover:text-primary rounded-lg text-sm transition-colors"
              >
                さらに 100 件表示
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      {selectedCount > 0 && (
        <div className="bg-bg-card border-t border-border px-6 py-2 flex items-center justify-between text-sm">
          <span className="text-text-secondary">
            {selectedCount} ファイル選択中（{formatBytes(selectedSize)} 解放予定）
          </span>
          <button
            onClick={() => setScreen('delete-confirm')}
            className="px-4 py-1.5 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Trash2 size={14} />
            削除確認へ
          </button>
        </div>
      )}

      {/* ── Comparison modal ── */}
      {compareGroup && (
        <CompareModal
          group={compareGroup}
          selectedFileIds={selectedFileIds}
          thumbnails={thumbnails}
          onToggle={toggleFileSelection}
          onClose={() => setCompareGroup(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// GroupCard — horizontal image comparison strip
// ─────────────────────────────────────────────

function GroupCard({
  group,
  selectedFileIds,
  thumbnails,
  onToggle,
  onSelectAll,
  onCompare,
}: {
  group: FileGroup
  selectedFileIds: Set<string>
  thumbnails: Map<string, string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onCompare: () => void
}) {
  const isDuplicate = group.similarity === 100

  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-panel">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isDuplicate ? 'bg-accent/20 text-accent' : 
            group.category.includes('画像') ? 'bg-orange-500/20 text-orange-400' : 'bg-secondary/20 text-secondary'
          }`}>
            {group.similarity}%
          </span>
          <span className="text-xs text-text-secondary">{group.category}</span>
          <span className="text-xs text-text-muted">· {group.files.length} ファイル</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCompare}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary border border-border hover:border-primary px-2.5 py-1 rounded-lg transition-colors"
          >
            <Maximize2 size={11} />
            拡大比較
          </button>
          <button
            onClick={onSelectAll}
            className="text-xs text-accent hover:underline font-medium"
          >
            削除候補を全選択
          </button>
        </div>
      </div>

      {/* Image strip */}
      <div className="flex overflow-x-auto">
        {group.files.map((file, idx) => (
          <ImageCell
            key={file.id}
            file={file}
            thumbnail={thumbnails.get(file.id) ?? file.thumbnailBase64}
            selected={selectedFileIds.has(file.id)}
            onToggle={() => onToggle(file.id)}
            showDivider={idx < group.files.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// ImageCell — one file inside a group card
// ─────────────────────────────────────────────

function ImageCell({
  file,
  thumbnail,
  selected,
  onToggle,
  showDivider,
}: {
  file: FileInfo
  thumbnail?: string
  selected: boolean
  onToggle: () => void
  showDivider: boolean
}) {
  const name = file.path.split(/[\\/]/).pop() ?? file.path

  return (
    <div className={`flex-shrink-0 w-52 flex flex-col ${showDivider ? 'border-r border-border' : ''}`}>
      {/* Thumbnail area */}
      <div className="relative bg-bg-dark overflow-hidden" style={{ height: '168px' }}>
        {thumbnail ? (
          <img
            src={`data:image/jpeg;base64,${thumbnail}`}
            alt={name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-text-muted">
            <Film size={36} className="opacity-30 animate-pulse" />
            <span className="text-xs opacity-50">読み込み中...</span>
          </div>
        )}

        {/* Keep badge */}
        {file.isKeep && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-success text-white text-xs px-1.5 py-0.5 rounded-full font-semibold shadow">
            <Shield size={9} />
            保持
          </div>
        )}

        {/* Selection highlight border */}
        {!file.isKeep && selected && (
          <div className="absolute inset-0 border-2 border-primary pointer-events-none" />
        )}
      </div>

      {/* Info section */}
      <div className="p-2.5 flex flex-col gap-2 flex-1">
        <p className="text-xs font-medium text-text-primary truncate leading-tight" title={name}>
          {name}
        </p>
        <div className="text-xs text-text-muted space-y-0.5 leading-tight">
          <p>{formatBytes(file.size)}</p>
          {file.resolution && <p>{file.resolution}</p>}
          {file.duration != null && <p>{file.duration.toFixed(1)} 秒</p>}
          <p className="text-text-muted/60 truncate" title={file.path}>{file.path}</p>
        </div>

        <div className="flex items-center gap-1.5 mt-auto">
          {file.isKeep ? (
            <span className="flex-1 text-center text-xs text-success">削除対象外</span>
          ) : (
            <button
              onClick={onToggle}
              className={`flex-1 flex items-center justify-center gap-1 text-xs py-1 rounded transition-colors ${
                selected
                  ? 'bg-primary/20 text-primary border border-primary/50'
                  : 'bg-bg-dark text-text-muted border border-border hover:border-primary hover:text-primary'
              }`}
            >
              {selected ? <CheckSquare size={12} /> : <Square size={12} />}
              {selected ? '選択中' : '削除対象へ'}
            </button>
          )}
          <button
            onClick={() => window.electronAPI?.openFileLocation(file.path)}
            className="p-1 text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
            title="ファイルの場所を開く"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// CompareModal — full-screen side-by-side view
// ─────────────────────────────────────────────

function CompareModal({
  group,
  selectedFileIds,
  thumbnails,
  onToggle,
  onClose,
}: {
  group: FileGroup
  selectedFileIds: Set<string>
  thumbnails: Map<string, string>
  onToggle: (id: string) => void
  onClose: () => void
}) {
  const [zoomedFile, setZoomedFile] = useState<FileInfo | null>(null)

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
      {/* Modal header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${
            group.similarity === 100 ? 'bg-accent/20 text-accent' : 'bg-secondary/20 text-secondary'
          }`}>
            {group.similarity}%
          </span>
          <span className="text-sm text-text-primary font-medium">{group.category}</span>
          <span className="text-xs text-text-muted">· {group.files.length} ファイル</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-bg-panel rounded-lg text-text-secondary hover:text-text-primary transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Scrollable image comparison area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex gap-4 justify-center flex-wrap">
          {group.files.map((file) => (
            <CompareCard
              key={file.id}
              file={file}
              thumbnail={thumbnails.get(file.id) ?? file.thumbnailBase64}
              selected={selectedFileIds.has(file.id)}
              onToggle={() => onToggle(file.id)}
              onZoom={() => setZoomedFile(file)}
            />
          ))}
        </div>
      </div>

      {/* Zoomed image overlay */}
      {zoomedFile && (
        <div
          className="absolute inset-0 bg-black/95 z-10 flex items-center justify-center cursor-zoom-out"
          onClick={() => setZoomedFile(null)}
        >
          {(thumbnails.get(zoomedFile.id) ?? zoomedFile.thumbnailBase64) ? (
            <img
              src={`data:image/jpeg;base64,${thumbnails.get(zoomedFile.id) ?? zoomedFile.thumbnailBase64}`}
              alt=""
              className="object-contain select-none"
              style={{ maxWidth: '92vw', maxHeight: '88vh' }}
            />
          ) : (
            <div className="text-text-muted text-sm">プレビューなし</div>
          )}
          <button
            className="absolute top-4 right-4 p-2 bg-bg-card/80 rounded-lg text-text-secondary hover:text-white"
            onClick={() => setZoomedFile(null)}
          >
            <X size={20} />
          </button>
          <p className="absolute bottom-4 text-xs text-white/40">
            クリックで閉じる
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// CompareCard — one file card inside the modal
// ─────────────────────────────────────────────

function CompareCard({
  file,
  thumbnail,
  selected,
  onToggle,
  onZoom,
}: {
  file: FileInfo
  thumbnail?: string
  selected: boolean
  onToggle: () => void
  onZoom: () => void
}) {
  const name = file.path.split(/[\\/]/).pop() ?? file.path

  return (
    <div
      className={`flex flex-col rounded-xl overflow-hidden border-2 transition-colors bg-bg-card ${
        file.isKeep
          ? 'border-success/60'
          : selected
            ? 'border-primary'
            : 'border-border'
      }`}
      style={{ width: '300px' }}
    >
      {/* Image */}
      <div
        className="relative bg-bg-dark cursor-zoom-in group"
        style={{ height: '240px' }}
        onClick={onZoom}
      >
        {thumbnail ? (
          <img
            src={`data:image/jpeg;base64,${thumbnail}`}
            alt={name}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-text-muted">
            <Film size={48} className="opacity-30 animate-pulse" />
            <span className="text-xs opacity-50">読み込み中...</span>
          </div>
        )}

        {/* Keep badge */}
        {file.isKeep && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-success text-white text-xs px-2 py-0.5 rounded-full font-semibold shadow">
            <Shield size={10} />
            保持
          </div>
        )}

        {/* Zoom hint */}
        <div className="absolute top-2 right-2 p-1.5 bg-black/40 rounded-lg text-white/50 group-hover:text-white/90 transition-colors">
          <Maximize2 size={14} />
        </div>
      </div>

      {/* File info */}
      <div className="p-4 space-y-3">
        <p className="text-sm font-semibold text-text-primary truncate" title={name}>{name}</p>

        <div className="text-xs text-text-muted space-y-1">
          <div className="flex justify-between">
            <span>サイズ</span>
            <span className="text-text-secondary font-medium">{formatBytes(file.size)}</span>
          </div>
          {file.resolution && (
            <div className="flex justify-between">
              <span>解像度</span>
              <span className="text-text-secondary font-medium">{file.resolution}</span>
            </div>
          )}
          {file.duration != null && (
            <div className="flex justify-between">
              <span>長さ</span>
              <span className="text-text-secondary font-medium">{file.duration.toFixed(1)} 秒</span>
            </div>
          )}
          <div className="flex justify-between">
            <span>更新日時</span>
            <span className="text-text-secondary">{formatDate(file.modified)}</span>
          </div>
          <p className="text-text-muted/60 truncate pt-0.5" title={file.path}>{file.path}</p>
        </div>

        <div className="flex items-center gap-2">
          {file.isKeep ? (
            <span className="flex-1 text-center text-xs text-success border border-success/30 bg-success/10 rounded-lg py-2 font-medium">
              保持（削除対象外）
            </span>
          ) : (
            <button
              onClick={onToggle}
              className={`flex-1 flex items-center justify-center gap-1.5 text-sm rounded-lg py-2 font-medium transition-colors ${
                selected
                  ? 'bg-primary text-white'
                  : 'bg-bg-dark text-text-secondary border border-border hover:border-primary hover:text-primary'
              }`}
            >
              {selected ? <CheckSquare size={14} /> : <Square size={14} />}
              {selected ? '削除対象に選択中' : '削除対象に追加'}
            </button>
          )}
          <button
            onClick={() => window.electronAPI?.openFileLocation(file.path)}
            className="p-2 text-text-muted hover:text-text-primary border border-border rounded-lg transition-colors flex-shrink-0"
            title="ファイルの場所を開く"
          >
            <ExternalLink size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
