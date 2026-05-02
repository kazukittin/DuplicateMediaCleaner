import { useState, useCallback } from 'react'
import { FolderOpen, Play, Network, Image, Film, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useWebSocket } from '../hooks/useWebSocket'
import type { ScanProgress, ScanResult } from '../types'

export default function HomeScreen() {
  const { scanOptions, setScanOptions, setScreen, setScanProgress, setScanResult, backendPort } = useAppStore()
  const [error, setError] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState(scanOptions.folderPath)
  const [showOptions, setShowOptions] = useState(false)

  const { connect } = useWebSocket({
    onScanProgress: (progress: ScanProgress) => { setScanProgress(progress) },
    onScanComplete: (result: ScanResult) => { setScanResult(result); setScreen('results') },
    onError: (msg: string) => { setError(msg) },
  })

  const handleSelectFolder = async () => {
    const path = await window.electronAPI?.selectFolder()
    if (path) { setScanOptions({ folderPath: path }); setManualPath(path) }
  }

  const handleManualPathChange = (value: string) => {
    setManualPath(value)
    setScanOptions({ folderPath: value })
  }

  const handleStartScan = useCallback(() => {
    const target = manualPath.trim()
    if (!target) { setError('フォルダを選択またはパスを入力してください'); return }
    setError(null)
    setScanOptions({ folderPath: target })
    const socket = connect()
    socket.emit('scan_start', {
      folder_path: target,
      include_subfolders: scanOptions.includeSubfolders,
      detect_duplicates: scanOptions.detectDuplicates,
      detect_similar: scanOptions.detectSimilar,
      similarity_threshold: scanOptions.similarityThreshold,
      file_types: scanOptions.fileTypes,
    })
    setScreen('scanning')
  }, [manualPath, scanOptions, connect, setScreen, setScanOptions])

  const toggleFileType = (type: 'image' | 'video') => {
    const current = scanOptions.fileTypes
    if (current.includes(type)) {
      if (current.length > 1) setScanOptions({ fileTypes: current.filter((t) => t !== type) })
    } else {
      setScanOptions({ fileTypes: [...current, type] })
    }
  }

  const isUncPath = manualPath.startsWith('\\\\') || manualPath.startsWith('//')
  const canStart = manualPath.trim().length > 0 && !!backendPort

  return (
    <div className="flex flex-col h-full bg-bg-base">
      {/* ── Top toolbar (SimiPix style) ── */}
      <div className="bg-bg-panel border-b border-border px-3 py-2 space-y-1.5 flex-shrink-0">
        {/* Row 1: フォルダ選択 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary w-28 flex-shrink-0 text-right">対象フォルダ</span>
          <div className="relative flex-1">
            {isUncPath && (
              <Network size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-primary" />
            )}
            <input
              type="text"
              value={manualPath}
              onChange={(e) => handleManualPathChange(e.target.value)}
              placeholder="C:\Users\... または \\NAS\share\..."
              className={`w-full border border-border bg-bg-card text-sm text-text-primary px-2 py-1 focus:outline-none focus:border-primary ${isUncPath ? 'pl-6' : ''}`}
              onKeyDown={(e) => e.key === 'Enter' && handleStartScan()}
            />
          </div>
          <button
            onClick={handleSelectFolder}
            className="px-3 py-1 border border-border bg-bg-card hover:bg-bg-panel text-sm text-text-primary flex items-center gap-1 flex-shrink-0"
          >
            <FolderOpen size={13} />
            参照
          </button>
        </div>

        {/* Row 2: ごみ箱パス（固定） */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary w-28 flex-shrink-0 text-right">ごみ箱に移動</span>
          <div className="flex-1 border border-border bg-bg-panel px-2 py-1 text-sm text-text-muted">
            Windowsのごみ箱（復元可能）
          </div>
          <div className="w-16" /> {/* spacer aligns with 参照 button */}
        </div>

        {/* Row 3: options toggle */}
        <div className="flex items-center gap-4 pl-32">
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={scanOptions.includeSubfolders}
              onChange={(e) => setScanOptions({ includeSubfolders: e.target.checked })}
              className="accent-primary"
            />
            サブフォルダ含める
          </label>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span>対象:</span>
            <button
              onClick={() => toggleFileType('image')}
              className={`px-2 py-0.5 border text-xs ${scanOptions.fileTypes.includes('image') ? 'bg-primary text-white border-primary' : 'border-border text-text-secondary bg-bg-card hover:bg-bg-panel'}`}
            >
              <Image size={10} className="inline mr-1" />画像
            </button>
            <button
              onClick={() => toggleFileType('video')}
              className={`px-2 py-0.5 border text-xs ${scanOptions.fileTypes.includes('video') ? 'bg-primary text-white border-primary' : 'border-border text-text-secondary bg-bg-card hover:bg-bg-panel'}`}
            >
              <Film size={10} className="inline mr-1" />動画
            </button>
          </div>
          <button
            onClick={() => setShowOptions(o => !o)}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary ml-auto"
          >
            <Settings size={12} />
            詳細オプション
            {showOptions ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>

        {/* Options panel */}
        {showOptions && (
          <div className="flex items-center gap-4 pl-32 pt-1 border-t border-border/50">
            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={scanOptions.detectDuplicates}
                onChange={(e) => setScanOptions({ detectDuplicates: e.target.checked })}
                className="accent-primary"
              />
              完全重複を検出
            </label>
            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={scanOptions.detectSimilar}
                onChange={(e) => setScanOptions({ detectSimilar: e.target.checked })}
                className="accent-primary"
              />
              類似ファイルを検出
            </label>
            {scanOptions.detectSimilar && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">類似度:</span>
                <input
                  type="range" min={50} max={100}
                  value={scanOptions.similarityThreshold}
                  onChange={(e) => setScanOptions({ similarityThreshold: Number(e.target.value) })}
                  className="w-24 accent-primary"
                />
                <span className="text-xs font-bold text-primary w-8">{scanOptions.similarityThreshold}%</span>
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="pl-32 text-xs text-accent">{error}</div>
        )}
      </div>

      {/* ── Main layout: table area + right button panel ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Center: empty placeholder */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Table header (empty) */}
          <div className="bg-bg-panel border-b border-border flex text-xs text-text-secondary font-medium flex-shrink-0">
            <div className="w-8 px-2 py-1.5 border-r border-border text-center">☑</div>
            <div className="flex-1 px-2 py-1.5 border-r border-border">画像名</div>
            <div className="w-24 px-2 py-1.5 border-r border-border">サイズ</div>
            <div className="w-40 px-2 py-1.5 border-r border-border">日付</div>
            <div className="w-16 px-2 py-1.5 border-r border-border text-right">幅</div>
            <div className="w-16 px-2 py-1.5 border-r border-border text-right">高</div>
            <div className="flex-1 px-2 py-1.5 border-r border-border">類似画像名</div>
            <div className="w-20 px-2 py-1.5 text-right">画像差</div>
          </div>

          {/* Empty table body */}
          <div className="flex-1 bg-bg-card flex items-center justify-center">
            <div className="text-center space-y-3">
              <FolderOpen size={48} className="text-border mx-auto" />
              <p className="text-sm text-text-muted">
                {manualPath.trim()
                  ? 'スキャンを開始してください'
                  : 'スキャンするフォルダを選択してください'}
              </p>
              {!backendPort && (
                <p className="text-xs text-warning">バックエンド起動中...</p>
              )}
            </div>
          </div>

          {/* Bottom preview pane (empty) */}
          <div className="h-52 border-t border-border bg-bg-card flex-shrink-0 flex">
            <div className="w-1/2 border-r border-border p-2 flex items-center justify-center text-xs text-text-muted">
              選択した画像がここに表示されます
            </div>
            <div className="w-1/2 p-2 flex items-center justify-center text-xs text-text-muted">
              類似画像がここに表示されます
            </div>
          </div>
        </div>

        {/* Right button panel */}
        <div className="w-28 flex-shrink-0 bg-bg-panel border-l border-border flex flex-col p-2 gap-2">
          <button
            onClick={() => setShowOptions(o => !o)}
            className="px-2 py-1.5 border border-border bg-bg-card hover:bg-bg-panel text-sm text-text-primary text-center w-full"
          >
            オプション
          </button>
          <button
            onClick={handleStartScan}
            disabled={!canStart}
            className="px-2 py-1.5 border border-border text-sm font-medium text-center w-full disabled:text-text-muted disabled:bg-bg-panel bg-bg-card hover:bg-primary hover:text-white hover:border-primary transition-colors flex items-center justify-center gap-1"
          >
            <Play size={13} />
            開始
          </button>
          <div className="flex-1" />
          <button
            disabled
            className="px-2 py-1.5 border border-border bg-bg-panel text-sm text-text-muted text-center w-full cursor-not-allowed"
          >
            まとめて
            <br />移動
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t border-border bg-bg-panel px-3 py-0.5 text-xs text-text-muted flex-shrink-0">
        {backendPort ? `バックエンド: localhost:${backendPort} ✓` : 'バックエンド起動中...'}
      </div>
    </div>
  )
}
