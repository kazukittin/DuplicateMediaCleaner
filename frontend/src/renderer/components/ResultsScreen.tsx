import { useState, useLayoutEffect, useRef, useCallback } from 'react'
import { Film, Trash2, ExternalLink, RotateCcw, X, Maximize2, Shield } from 'lucide-react'
import { useAppStore, getSelectedCount, getSelectedSize } from '../stores/appStore'
import { useWebSocket } from '../hooks/useWebSocket'
import type { FileGroup, FileInfo } from '../types'
import { formatBytes, formatDate } from '../utils/format'

// Parse "736 × 1349" or "736x1349" → { w, h }
function parseWH(resolution?: string): { w: string; h: string } {
  const m = resolution?.match(/(\d+)\s*[×xX]\s*(\d+)/)
  return m ? { w: m[1], h: m[2] } : { w: '-', h: '-' }
}

export default function ResultsScreen() {
  const {
    scanResult,
    scanOptions,
    selectedFileIds,
    thumbnails,
    toggleFileSelection,
    selectAllInGroup,
    clearSelection,
    setScreen,
    reset,
    updateThumbnails,
  } = useAppStore()

  const [viewMode, setViewMode] = useState<'duplicates' | 'bad_quality'>('duplicates')
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null)
  const [compareGroup, setCompareGroup] = useState<FileGroup | null>(null)
  const [displayLimit, setDisplayLimit] = useState(200)

  const { connect } = useWebSocket({ onThumbnailBatch: updateThumbnails })
  useLayoutEffect(() => {
    const socket = connect()
    return () => { socket?.off('thumbnail_batch') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!scanResult) return null

  const { statistics, groups } = scanResult

  const isBadQuality = (g: FileGroup) =>
    g.category.includes('ブレ画像') || g.category.includes('ノイズ画像')
  const viewGroups = groups.filter(g =>
    viewMode === 'bad_quality' ? isBadQuality(g) : !isBadQuality(g)
  )
  const sortedGroups = [...viewGroups].sort((a, b) => b.similarity - a.similarity)
  const visibleGroups = sortedGroups.slice(0, displayLimit)

  const selectedCount = getSelectedCount(useAppStore.getState())
  const selectedSize = getSelectedSize(useAppStore.getState())

  const previewGroup = previewGroupId
    ? groups.find(g => g.groupId === previewGroupId) ?? null
    : null
  const previewKeep = previewGroup?.files.find(f => f.isKeep) ?? previewGroup?.files[0] ?? null
  const previewSimilar = previewGroup?.files.find(f => !f.isKeep) ?? null

  const selectAllFiltered = () => sortedGroups.forEach(g => selectAllInGroup(g))

  return (
    <div className="flex flex-col h-full bg-bg-base">
      {/* ── Top toolbar ── */}
      <div className="bg-bg-panel border-b border-border px-3 py-1.5 flex-shrink-0 space-y-1">
        {/* Row 1: フォルダパス */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary w-28 flex-shrink-0 text-right">対象フォルダ</span>
          <div className="flex-1 border border-border bg-bg-card px-2 py-0.5 text-sm text-text-secondary truncate">
            {scanOptions.folderPath}
          </div>
        </div>
        {/* Row 2: stats + tabs */}
        <div className="flex items-center gap-4 pl-32">
          <span className="text-xs text-text-muted">
            重複: {statistics.duplicateGroups} / 類似: {statistics.similarGroups} グループ
            削除候補: <strong className="text-accent">{statistics.deletableFiles}</strong> 件
            解放容量: <strong className="text-success">{formatBytes(statistics.recoverableSpace)}</strong>
            選択中: <strong className="text-primary">{selectedCount}</strong> 件
          </span>
          <div className="flex border border-border ml-auto">
            <button
              onClick={() => { setViewMode('duplicates'); setDisplayLimit(200) }}
              className={`px-3 py-0.5 text-xs border-r border-border ${viewMode === 'duplicates' ? 'bg-primary text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-panel'}`}
            >
              類似・重複 ({groups.filter(g => !isBadQuality(g)).length})
            </button>
            <button
              onClick={() => { setViewMode('bad_quality'); setDisplayLimit(200) }}
              className={`px-3 py-0.5 text-xs ${viewMode === 'bad_quality' ? 'bg-primary text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-panel'}`}
            >
              ブレ・ノイズ ({groups.filter(g => isBadQuality(g)).length})
            </button>
          </div>
        </div>
      </div>

      {/* ── Main: table + right buttons ── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Table header */}
          <div className="bg-bg-panel border-b border-border flex text-xs text-text-secondary font-medium flex-shrink-0 select-none">
            <div className="w-8 px-1 py-1.5 border-r border-border text-center flex-shrink-0">
              <input
                type="checkbox"
                className="accent-primary"
                checked={selectedCount > 0 && sortedGroups.every(g => {
                  const deletable = g.files.filter(f => !f.isKeep)
                  return deletable.length > 0 && deletable.every(f => selectedFileIds.has(f.id))
                })}
                onChange={(e) => e.target.checked ? selectAllFiltered() : clearSelection()}
              />
            </div>
            <div className="flex-1 min-w-0 px-2 py-1.5 border-r border-border">画像名</div>
            <div className="w-24 px-2 py-1.5 border-r border-border text-right flex-shrink-0">サイズ</div>
            <div className="w-40 px-2 py-1.5 border-r border-border flex-shrink-0">日付</div>
            <div className="w-14 px-2 py-1.5 border-r border-border text-right flex-shrink-0">幅</div>
            <div className="w-14 px-2 py-1.5 border-r border-border text-right flex-shrink-0">高</div>
            <div className="flex-1 min-w-0 px-2 py-1.5 border-r border-border">類似画像名</div>
            <div className="w-20 px-2 py-1.5 text-right flex-shrink-0">画像差</div>
          </div>

          {/* Table body */}
          <div className="flex-1 bg-bg-card overflow-y-auto">
            {visibleGroups.map((group) => (
              <TableRow
                key={group.groupId}
                group={group}
                selectedFileIds={selectedFileIds}
                isPreview={previewGroupId === group.groupId}
                onSelect={() => setPreviewGroupId(group.groupId)}
                onToggleGroup={() => {
                  const deletable = group.files.filter(f => !f.isKeep)
                  const allSelected = deletable.every(f => selectedFileIds.has(f.id))
                  if (allSelected) {
                    deletable.forEach(f => { if (selectedFileIds.has(f.id)) toggleFileSelection(f.id) })
                  } else {
                    selectAllInGroup(group)
                  }
                }}
                onCompare={() => setCompareGroup(group)}
              />
            ))}
            {displayLimit < sortedGroups.length && (
              <div className="flex items-center justify-center py-3 border-t border-border">
                <button
                  onClick={() => setDisplayLimit(d => d + 200)}
                  className="px-4 py-1.5 border border-border bg-bg-panel hover:bg-primary hover:text-white hover:border-primary text-sm text-text-secondary transition-colors"
                >
                  さらに 200 件表示（残り {sortedGroups.length - displayLimit} グループ）
                </button>
              </div>
            )}
            {visibleGroups.length === 0 && (
              <div className="flex items-center justify-center h-32 text-sm text-text-muted">
                このカテゴリに結果はありません
              </div>
            )}
          </div>

          {/* ── Bottom preview pane (SimiPix style) ── */}
          <div className="h-52 border-t border-border bg-bg-card flex flex-shrink-0">
            <PreviewPane
              label="画像"
              file={previewKeep}
              thumbnail={previewKeep ? (thumbnails.get(previewKeep.id) ?? previewKeep.thumbnailBase64) : undefined}
              onOpen={() => previewKeep && window.electronAPI?.openFileLocation(previewKeep.path)}
            />
            <div className="w-px bg-border flex-shrink-0" />
            <PreviewPane
              label="類似画像"
              file={previewSimilar}
              thumbnail={previewSimilar ? (thumbnails.get(previewSimilar.id) ?? previewSimilar.thumbnailBase64) : undefined}
              isDeleteTarget={previewSimilar ? !previewSimilar.isKeep : false}
              selected={previewSimilar ? selectedFileIds.has(previewSimilar.id) : false}
              onToggle={previewSimilar ? () => toggleFileSelection(previewSimilar.id) : undefined}
              onOpen={() => previewSimilar && window.electronAPI?.openFileLocation(previewSimilar.path)}
            />
          </div>
        </div>

        {/* Right button panel */}
        <div className="w-28 flex-shrink-0 bg-bg-panel border-l border-border flex flex-col p-2 gap-2">
          <button
            onClick={() => reset()}
            className="px-2 py-1.5 border border-border bg-bg-card hover:bg-bg-panel text-xs text-text-primary text-center w-full flex items-center justify-center gap-1"
          >
            <RotateCcw size={11} />
            最初に戻る
          </button>
          <button
            onClick={selectAllFiltered}
            className="px-2 py-1.5 border border-border bg-bg-card hover:bg-bg-panel text-xs text-text-primary text-center w-full"
          >
            全選択
          </button>
          <button
            onClick={clearSelection}
            className="px-2 py-1.5 border border-border bg-bg-card hover:bg-bg-panel text-xs text-text-secondary text-center w-full"
          >
            選択解除
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setScreen('delete-confirm')}
            disabled={selectedCount === 0}
            className="px-2 py-1.5 border border-border text-xs font-medium text-center w-full disabled:text-text-muted disabled:bg-bg-panel bg-bg-card hover:bg-accent hover:text-white hover:border-accent transition-colors flex flex-col items-center gap-0.5"
          >
            <Trash2 size={13} />
            まとめて
            <br />移動
            {selectedCount > 0 && (
              <span className="text-xs">({selectedCount})</span>
            )}
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t border-border bg-bg-panel px-3 py-0.5 text-xs text-text-muted flex-shrink-0 flex justify-between">
        <span>{sortedGroups.length} グループ（表示: {visibleGroups.length}）</span>
        {selectedCount > 0 && (
          <span className="text-accent font-medium">
            {selectedCount} ファイル選択中 / {formatBytes(selectedSize)} 解放予定
          </span>
        )}
      </div>

      {/* Compare modal */}
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

// ─── TableRow ───────────────────────────────────────────────────────────────

function TableRow({
  group,
  selectedFileIds,
  isPreview,
  onSelect,
  onToggleGroup,
  onCompare,
}: {
  group: FileGroup
  selectedFileIds: Set<string>
  isPreview: boolean
  onSelect: () => void
  onToggleGroup: () => void
  onCompare: () => void
}) {
  const keepFile = group.files.find(f => f.isKeep) ?? group.files[0]
  const deletableFiles = group.files.filter(f => !f.isKeep)
  const similarFile = deletableFiles[0]

  const allSelected = deletableFiles.length > 0 && deletableFiles.every(f => selectedFileIds.has(f.id))
  const someSelected = deletableFiles.some(f => selectedFileIds.has(f.id))

  const checkRef = useRef<HTMLInputElement>(null)
  if (checkRef.current) {
    checkRef.current.indeterminate = someSelected && !allSelected
  }

  const keepName = keepFile.path.split(/[\\/]/).pop() ?? keepFile.path
  const similarName = similarFile?.path.split(/[\\/]/).pop() ?? ''
  const { w: kw, h: kh } = parseWH(keepFile.resolution)

  const diff = group.similarity < 100
    ? `${100 - group.similarity}%`
    : '完全一致'

  return (
    <div
      className={`flex items-center text-xs border-b border-border cursor-pointer select-none hover:bg-blue-50 ${isPreview ? 'bg-[#CCE4F7]' : ''}`}
      onClick={onSelect}
    >
      {/* Checkbox */}
      <div className="w-8 px-1 py-1 border-r border-border text-center flex-shrink-0" onClick={e => e.stopPropagation()}>
        <input
          ref={checkRef}
          type="checkbox"
          className="accent-primary"
          checked={allSelected}
          disabled={deletableFiles.length === 0}
          onChange={onToggleGroup}
        />
      </div>

      {/* 画像名 (keep) */}
      <div className="flex-1 min-w-0 px-2 py-1 border-r border-border truncate" title={keepFile.path}>
        <span className="flex items-center gap-1">
          {keepFile.isKeep && <Shield size={9} className="text-success flex-shrink-0" />}
          {keepName}
        </span>
      </div>

      {/* サイズ */}
      <div className="w-24 px-2 py-1 border-r border-border text-right flex-shrink-0 text-text-secondary">
        {keepFile.size.toLocaleString()}
      </div>

      {/* 日付 */}
      <div className="w-40 px-2 py-1 border-r border-border flex-shrink-0 text-text-secondary">
        {formatDate(keepFile.modified)}
      </div>

      {/* 幅 */}
      <div className="w-14 px-2 py-1 border-r border-border text-right flex-shrink-0 text-text-secondary">
        {kw}
      </div>

      {/* 高 */}
      <div className="w-14 px-2 py-1 border-r border-border text-right flex-shrink-0 text-text-secondary">
        {kh}
      </div>

      {/* 類似画像名 */}
      <div className="flex-1 min-w-0 px-2 py-1 border-r border-border truncate text-text-secondary" title={similarFile?.path ?? ''}>
        {similarName}
        {deletableFiles.length > 1 && (
          <span className="ml-1 text-text-muted">他{deletableFiles.length - 1}件</span>
        )}
      </div>

      {/* 画像差 */}
      <div className="w-20 px-2 py-1 flex-shrink-0 flex items-center justify-end gap-1">
        <span className={`font-medium ${
          group.similarity === 100 ? 'text-accent' :
          group.similarity >= 90 ? 'text-warning' : 'text-text-secondary'
        }`}>
          {diff}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onCompare() }}
          className="p-0.5 text-text-muted hover:text-primary flex-shrink-0"
          title="拡大比較"
        >
          <Maximize2 size={11} />
        </button>
      </div>
    </div>
  )
}

// ─── PreviewPane ─────────────────────────────────────────────────────────────

function PreviewPane({
  label,
  file,
  thumbnail,
  isDeleteTarget = false,
  selected = false,
  onToggle,
  onOpen,
}: {
  label: string
  file: FileInfo | null
  thumbnail?: string
  isDeleteTarget?: boolean
  selected?: boolean
  onToggle?: () => void
  onOpen?: () => void
}) {
  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-text-muted">
        {label}がここに表示されます
      </div>
    )
  }

  const name = file.path.split(/[\\/]/).pop() ?? file.path
  const { w, h } = parseWH(file.resolution)

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* File info text */}
      <div className="w-44 flex-shrink-0 p-2 text-xs text-text-secondary space-y-0.5 overflow-hidden border-r border-border">
        <p className="text-text-muted font-medium truncate" title={file.path}>{file.path}</p>
        <p>{formatDate(file.modified)}</p>
        {w !== '-' && <p>( {w} × {h} )</p>}
        <p>{file.size.toLocaleString()} BYTE</p>
        {file.duration != null && <p>{file.duration.toFixed(1)} 秒</p>}
        {isDeleteTarget && (
          <div className="pt-1 flex gap-1">
            {onToggle && (
              <button
                onClick={onToggle}
                className={`flex-1 py-0.5 border text-xs ${selected ? 'bg-accent text-white border-accent' : 'bg-bg-card border-border hover:border-accent hover:text-accent'}`}
              >
                {selected ? '選択中' : '削除対象'}
              </button>
            )}
            {onOpen && (
              <button onClick={onOpen} className="p-0.5 text-text-muted hover:text-primary" title="場所を開く">
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        )}
        {!isDeleteTarget && onOpen && (
          <button onClick={onOpen} className="flex items-center gap-0.5 text-text-muted hover:text-primary pt-1" title="場所を開く">
            <ExternalLink size={11} />
            <span>場所を開く</span>
          </button>
        )}
        {file.isKeep && (
          <div className="flex items-center gap-1 text-success pt-1">
            <Shield size={10} />
            <span>保持（削除対象外）</span>
          </div>
        )}
      </div>

      {/* Thumbnail */}
      <div className={`flex-1 flex items-center justify-center bg-bg-panel overflow-hidden ${selected ? 'outline outline-2 outline-accent' : ''}`}>
        {thumbnail ? (
          <img
            src={`data:image/jpeg;base64,${thumbnail}`}
            alt={name}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-text-muted">
            <Film size={28} className="opacity-30 animate-pulse" />
            <span className="text-xs">読み込み中...</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CompareModal ────────────────────────────────────────────────────────────

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
  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex flex-col"
      onKeyDown={handleKey}
      tabIndex={-1}
    >
      {/* Modal header */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-panel border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2 py-0.5 border ${
            group.similarity === 100 ? 'bg-accent/10 text-accent border-accent/40' : 'bg-primary/10 text-primary border-primary/40'
          }`}>
            {group.similarity === 100 ? '完全一致' : `類似度 ${group.similarity}%`}
          </span>
          <span className="text-sm text-text-primary">{group.category}</span>
          <span className="text-xs text-text-muted">· {group.files.length} ファイル</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-bg-panel border border-transparent hover:border-border text-text-secondary hover:text-text-primary transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* File grid */}
      <div className="flex-1 overflow-auto p-4 bg-bg-base">
        <div className="flex gap-3 justify-center flex-wrap">
          {group.files.map((file) => {
            const thumb = thumbnails.get(file.id) ?? file.thumbnailBase64
            const name = file.path.split(/[\\/]/).pop() ?? file.path
            const selected = selectedFileIds.has(file.id)
            const { w, h } = parseWH(file.resolution)
            return (
              <div
                key={file.id}
                className={`flex flex-col bg-bg-card border-2 overflow-hidden transition-colors ${
                  file.isKeep ? 'border-success/60' : selected ? 'border-accent' : 'border-border'
                }`}
                style={{ width: 280 }}
              >
                <div
                  className="relative bg-bg-panel cursor-zoom-in group"
                  style={{ height: 220 }}
                  onClick={() => setZoomedFile(file)}
                >
                  {thumb ? (
                    <img src={`data:image/jpeg;base64,${thumb}`} alt={name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-text-muted">
                      <Film size={40} className="opacity-30 animate-pulse" />
                      <span className="text-xs">読み込み中...</span>
                    </div>
                  )}
                  {file.isKeep && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 bg-success text-white text-xs px-1.5 py-0.5 font-semibold">
                      <Shield size={9} />保持
                    </div>
                  )}
                  <div className="absolute top-2 right-2 p-1 bg-white/60 text-text-muted group-hover:text-text-primary transition-colors">
                    <Maximize2 size={12} />
                  </div>
                </div>
                <div className="p-3 space-y-2 text-xs">
                  <p className="font-medium text-text-primary truncate" title={name}>{name}</p>
                  <div className="text-text-muted space-y-0.5">
                    <div className="flex justify-between">
                      <span>サイズ</span>
                      <span className="text-text-secondary">{formatBytes(file.size)}</span>
                    </div>
                    {w !== '-' && (
                      <div className="flex justify-between">
                        <span>解像度</span>
                        <span className="text-text-secondary">{w} × {h}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>日付</span>
                      <span className="text-text-secondary">{formatDate(file.modified)}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {file.isKeep ? (
                      <span className="flex-1 text-center py-1 bg-success/10 text-success border border-success/30 font-medium">
                        保持（削除対象外）
                      </span>
                    ) : (
                      <button
                        onClick={() => onToggle(file.id)}
                        className={`flex-1 py-1 border font-medium transition-colors ${
                          selected
                            ? 'bg-accent text-white border-accent'
                            : 'border-border text-text-secondary hover:border-accent hover:text-accent'
                        }`}
                      >
                        {selected ? '削除対象に選択中' : '削除対象に追加'}
                      </button>
                    )}
                    <button
                      onClick={() => window.electronAPI?.openFileLocation(file.path)}
                      className="p-1 border border-border text-text-muted hover:text-primary transition-colors"
                      title="場所を開く"
                    >
                      <ExternalLink size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Zoomed overlay */}
      {zoomedFile && (
        <div
          className="absolute inset-0 bg-black/95 z-10 flex items-center justify-center cursor-zoom-out"
          onClick={() => setZoomedFile(null)}
        >
          {(thumbnails.get(zoomedFile.id) ?? zoomedFile.thumbnailBase64) && (
            <img
              src={`data:image/jpeg;base64,${thumbnails.get(zoomedFile.id) ?? zoomedFile.thumbnailBase64}`}
              alt=""
              className="object-contain select-none"
              style={{ maxWidth: '92vw', maxHeight: '88vh' }}
            />
          )}
          <button
            className="absolute top-4 right-4 p-2 bg-bg-panel border border-border text-text-secondary hover:text-white"
            onClick={() => setZoomedFile(null)}
          >
            <X size={18} />
          </button>
          <p className="absolute bottom-4 text-xs text-white/40">クリックで閉じる</p>
        </div>
      )}
    </div>
  )
}
