import { useState } from 'react'
import {
  Image,
  Film,
  Trash2,
  FolderOpen,
  ChevronRight,
  CheckSquare,
  Square,
  ExternalLink,
  HardDrive,
  RotateCcw,
  Zap,
} from 'lucide-react'
import { useAppStore, getSelectedCount, getSelectedSize } from '../stores/appStore'
import type { FileGroup, FileInfo } from '../types'
import { formatBytes, formatDate, similarityLabel, similarityColor } from '../utils/format'

export default function ResultsScreen() {
  const {
    scanResult,
    activeTab,
    activeCategory,
    selectedFileIds,
    setActiveTab,
    setActiveCategory,
    toggleFileSelection,
    selectAllInGroup,
    clearSelection,
    setScreen,
    reset,
  } = useAppStore()

  const [previewFile, setPreviewFile] = useState<FileInfo | null>(null)

  if (!scanResult) return null

  const { statistics, groups } = scanResult

  const filteredGroups = groups.filter(
    (g) => g.fileType === activeTab && (!activeCategory || g.category === activeCategory)
  )

  const categories = Array.from(
    new Set(groups.filter((g) => g.fileType === activeTab).map((g) => g.category))
  ).sort()

  const selectedCount = getSelectedCount(useAppStore.getState())
  const selectedSize = getSelectedSize(useAppStore.getState())

  const handleSelectAllInCategory = () => {
    filteredGroups.forEach((g) => selectAllInGroup(g))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-bg-card border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <HardDrive size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-primary">スキャン結果</h1>
            <p className="text-xs text-text-secondary">
              重複グループ: {statistics.duplicateGroups} / 類似グループ: {statistics.similarGroups}
            </p>
          </div>
        </div>

        {/* Stats */}
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
            onClick={() => { reset() }}
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

      {/* Tabs */}
      <div className="bg-bg-card border-b border-border px-6 flex gap-1">
        {(['image', 'video'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setActiveCategory(null) }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab === 'image' ? <Image size={15} /> : <Film size={15} />}
            {tab === 'image' ? '画像' : '動画'}
          </button>
        ))}
      </div>

      {/* Three-pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Category tree */}
        <div className="w-48 border-r border-border bg-bg-card overflow-y-auto flex-shrink-0">
          <div className="p-2 space-y-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                !activeCategory ? 'bg-primary/20 text-primary' : 'text-text-secondary hover:bg-bg-panel'
              }`}
            >
              <ChevronRight size={14} />
              すべて ({groups.filter((g) => g.fileType === activeTab).length})
            </button>
            {categories.map((cat) => {
              const count = groups.filter((g) => g.fileType === activeTab && g.category === cat).length
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                    activeCategory === cat
                      ? 'bg-primary/20 text-primary'
                      : 'text-text-secondary hover:bg-bg-panel'
                  }`}
                >
                  <span className="truncate">{cat}</span>
                  <span className="text-xs bg-bg-dark px-1.5 py-0.5 rounded">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Center: File list */}
        <div className="flex-1 overflow-y-auto bg-bg-dark">
          <div className="p-2">
            <div className="flex items-center justify-between px-2 py-1.5 mb-1">
              <p className="text-xs text-text-muted">{filteredGroups.length} グループ</p>
              <div className="flex gap-2">
                <button
                  onClick={handleSelectAllInCategory}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <CheckSquare size={12} />
                  カテゴリ全選択
                </button>
                <button
                  onClick={clearSelection}
                  className="text-xs text-text-muted hover:underline"
                >
                  選択解除
                </button>
              </div>
            </div>

            {filteredGroups.map((group) => (
              <GroupCard
                key={group.groupId}
                group={group}
                selectedFileIds={selectedFileIds}
                onToggle={toggleFileSelection}
                onSelectAll={() => selectAllInGroup(group)}
                onPreview={setPreviewFile}
                activePreviewId={previewFile?.id}
              />
            ))}

            {filteredGroups.length === 0 && (
              <div className="text-center text-text-muted py-16 text-sm">
                該当するファイルがありません
              </div>
            )}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="w-64 border-l border-border bg-bg-card overflow-y-auto flex-shrink-0">
          <PreviewPane file={previewFile} />
        </div>
      </div>

      {/* Footer */}
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
    </div>
  )
}

function GroupCard({
  group,
  selectedFileIds,
  onToggle,
  onSelectAll,
  onPreview,
  activePreviewId,
}: {
  group: FileGroup
  selectedFileIds: Set<string>
  onToggle: (id: string) => void
  onSelectAll: () => void
  onPreview: (file: FileInfo) => void
  activePreviewId: string | undefined
}) {
  return (
    <div className="bg-bg-card border border-border rounded-lg mb-2 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-panel">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${similarityColor(group.similarity)}`}>
            {group.similarity}% {similarityLabel(group.similarity)}
          </span>
        </div>
        <button
          onClick={onSelectAll}
          className="text-xs text-primary hover:underline"
        >
          削除候補を全選択
        </button>
      </div>
      <div className="divide-y divide-border">
        {group.files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            selected={selectedFileIds.has(file.id)}
            isActive={file.id === activePreviewId}
            onToggle={() => onToggle(file.id)}
            onPreview={() => onPreview(file)}
          />
        ))}
      </div>
    </div>
  )
}

function FileRow({
  file,
  selected,
  isActive,
  onToggle,
  onPreview,
}: {
  file: FileInfo
  selected: boolean
  isActive: boolean
  onToggle: () => void
  onPreview: () => void
}) {
  const name = file.path.split(/[\\/]/).pop() ?? file.path

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
        isActive ? 'bg-primary/10' : 'hover:bg-bg-panel'
      } ${file.isKeep ? 'opacity-60' : ''}`}
      onClick={onPreview}
    >
      <div onClick={(e) => { e.stopPropagation(); if (!file.isKeep) onToggle() }}>
        {file.isKeep ? (
          <Square size={16} className="text-text-muted" />
        ) : selected ? (
          <CheckSquare size={16} className="text-primary" />
        ) : (
          <Square size={16} className="text-text-muted" />
        )}
      </div>

      {file.thumbnailBase64 ? (
        <img
          src={`data:image/jpeg;base64,${file.thumbnailBase64}`}
          alt={name}
          className="w-10 h-10 object-cover rounded border border-border flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 bg-bg-dark rounded border border-border flex-shrink-0 flex items-center justify-center">
          <Film size={16} className="text-text-muted" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate" title={name}>{name}</p>
        <p className="text-xs text-text-muted">
          {formatBytes(file.size)} · {formatDate(file.modified)}
        </p>
      </div>

      {file.isKeep && (
        <span className="text-xs bg-success/20 text-success px-1.5 py-0.5 rounded flex-shrink-0">
          保持
        </span>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation()
          window.electronAPI?.openFileLocation(file.path)
        }}
        className="p-1 text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
        title="ファイルの場所を開く"
      >
        <ExternalLink size={13} />
      </button>
    </div>
  )
}

function PreviewPane({ file }: { file: FileInfo | null }) {
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        <div className="text-center space-y-2">
          <FolderOpen size={32} className="mx-auto opacity-30" />
          <p>ファイルを選択すると<br />プレビューが表示されます</p>
        </div>
      </div>
    )
  }

  const name = file.path.split(/[\\/]/).pop() ?? file.path

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">プレビュー</h3>

      {file.thumbnailBase64 ? (
        <img
          src={`data:image/jpeg;base64,${file.thumbnailBase64}`}
          alt={name}
          className="w-full rounded-lg border border-border object-contain bg-bg-dark"
          style={{ maxHeight: 180 }}
        />
      ) : (
        <div className="w-full h-32 bg-bg-dark rounded-lg border border-border flex items-center justify-center">
          <Film size={32} className="text-text-muted" />
        </div>
      )}

      <div className="space-y-2 text-xs">
        <InfoRow label="ファイル名" value={name} mono />
        <InfoRow label="サイズ" value={formatBytes(file.size)} />
        <InfoRow label="更新日時" value={formatDate(file.modified)} />
        {file.resolution && <InfoRow label="解像度" value={file.resolution} />}
        <InfoRow label="場所" value={file.path} mono truncate title={file.path} />
        {file.isKeep && (
          <div className="bg-success/10 border border-success/30 rounded-lg p-2 text-success text-center">
            保持ファイル（削除対象外）
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
  truncate: trunc,
  title,
}: {
  label: string
  value: string
  mono?: boolean
  truncate?: boolean
  title?: string
}) {
  return (
    <div>
      <p className="text-text-muted mb-0.5">{label}</p>
      <p
        className={`text-text-secondary break-all ${mono ? 'font-mono text-xs' : ''} ${trunc ? 'truncate' : ''}`}
        title={title}
      >
        {value}
      </p>
    </div>
  )
}
