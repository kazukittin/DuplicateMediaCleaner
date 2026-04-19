import { useState, useCallback } from 'react'
import { FolderOpen, Play, Settings, HardDrive, Image, Film, Network } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useWebSocket } from '../hooks/useWebSocket'
import type { ScanProgress, ScanResult } from '../types'

export default function HomeScreen() {
  const { scanOptions, setScanOptions, setScreen, setScanProgress, setScanResult, backendPort } = useAppStore()
  const [error, setError] = useState<string | null>(null)
  const [manualPath, setManualPath] = useState(scanOptions.folderPath)

  const { connect } = useWebSocket({
    onScanProgress: (progress: ScanProgress) => {
      setScanProgress(progress)
    },
    onScanComplete: (result: ScanResult) => {
      setScanResult(result)
      setScreen('results')
    },
    onError: (msg: string) => {
      // Do NOT call setScreen('home') here — this handler may fire as a stale
      // closure while ScanProgressScreen is active, which would wrongly navigate away.
      // ScanProgressScreen registers its own onError that shows the error in-place.
      setError(msg)
    },
  })

  const handleSelectFolder = async () => {
    const path = await window.electronAPI?.selectFolder()
    if (path) {
      setScanOptions({ folderPath: path })
      setManualPath(path)
    }
  }

  const handleManualPathChange = (value: string) => {
    setManualPath(value)
    setScanOptions({ folderPath: value })
  }

  const handleStartScan = useCallback(() => {
    const target = manualPath.trim()
    if (!target) {
      setError('フォルダを選択またはパスを入力してください')
      return
    }
    setError(null)
    setScanOptions({ folderPath: target })
    // connect() returns the singleton socket — stays alive after screen change
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-bg-card border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <HardDrive size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-primary">DuplicateMediaCleaner</h1>
          <p className="text-xs text-text-secondary">重複・類似メディアファイル削除ツール</p>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-2xl space-y-6">

          {/* Folder selection */}
          <div className="bg-bg-card rounded-xl border border-border p-6 space-y-4">
            <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <FolderOpen size={18} className="text-primary" />
              スキャン対象フォルダ
            </h2>

            {/* Path input (supports local & UNC) */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                {isUncPath && (
                  <Network
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary"
                  />
                )}
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => handleManualPathChange(e.target.value)}
                  placeholder="C:\Users\... または \\NAS\share\..."
                  className={`w-full bg-bg-dark border border-border rounded-lg py-3 pr-4 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-primary transition-colors ${isUncPath ? 'pl-8' : 'pl-4'}`}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartScan()}
                />
              </div>
              <button
                onClick={handleSelectFolder}
                className="px-4 py-3 bg-primary hover:bg-primary/80 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-shrink-0"
              >
                <FolderOpen size={16} />
                参照
              </button>
            </div>

            {/* NAS hint */}
            {isUncPath && (
              <div className="flex items-start gap-2 bg-secondary/10 border border-secondary/30 rounded-lg px-3 py-2 text-xs text-secondary">
                <Network size={13} className="flex-shrink-0 mt-0.5" />
                <span>
                  NAS / ネットワークドライブを検出しました。スキャン速度はネットワーク帯域に依存します。
                </span>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={scanOptions.includeSubfolders}
                onChange={(e) => setScanOptions({ includeSubfolders: e.target.checked })}
                className="accent-primary w-4 h-4"
              />
              サブフォルダを含める
            </label>
          </div>

          {/* Scan options */}
          <div className="bg-bg-card rounded-xl border border-border p-6 space-y-5">
            <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
              <Settings size={18} className="text-primary" />
              スキャンオプション
            </h2>

            {/* File types */}
            <div className="space-y-2">
              <p className="text-xs text-text-secondary uppercase tracking-wider">対象ファイル形式</p>
              <div className="flex gap-3">
                <button
                  onClick={() => toggleFileType('image')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    scanOptions.fileTypes.includes('image')
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-bg-dark border-border text-text-secondary'
                  }`}
                >
                  <Image size={15} />
                  画像
                </button>
                <button
                  onClick={() => toggleFileType('video')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    scanOptions.fileTypes.includes('video')
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-bg-dark border-border text-text-secondary'
                  }`}
                >
                  <Film size={15} />
                  動画
                </button>
              </div>
            </div>

            {/* Detection options */}
            <div className="space-y-2">
              <p className="text-xs text-text-secondary uppercase tracking-wider">検出方法</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scanOptions.detectDuplicates}
                    onChange={(e) => setScanOptions({ detectDuplicates: e.target.checked })}
                    className="accent-primary w-4 h-4"
                  />
                  完全重複を検出（ハッシュ一致）
                </label>
                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scanOptions.detectSimilar}
                    onChange={(e) => setScanOptions({ detectSimilar: e.target.checked })}
                    className="accent-primary w-4 h-4"
                  />
                  類似ファイルも検出（知覚ハッシュ）
                </label>
              </div>
            </div>

            {/* Similarity threshold */}
            {scanOptions.detectSimilar && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <p className="text-xs text-text-secondary uppercase tracking-wider">類似度スレッショルド</p>
                  <span className="text-sm font-bold text-primary">{scanOptions.similarityThreshold}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={100}
                  value={scanOptions.similarityThreshold}
                  onChange={(e) => setScanOptions({ similarityThreshold: Number(e.target.value) })}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-text-muted">
                  <span>低感度 (誤検出多)</span>
                  <span>推奨: 85%</span>
                  <span>高感度 (見落とし多)</span>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Start button */}
          <button
            onClick={handleStartScan}
            disabled={!manualPath.trim() || !backendPort}
            className="w-full py-4 bg-primary hover:bg-primary/80 disabled:bg-bg-panel disabled:text-text-muted text-white font-bold rounded-xl text-base transition-colors flex items-center justify-center gap-3"
          >
            <Play size={20} />
            スキャン開始
          </button>

          <p className="text-xs text-text-muted text-center">
            {backendPort
              ? `バックエンド: localhost:${backendPort} ✓`
              : 'バックエンド起動中...'}
          </p>
        </div>
      </div>
    </div>
  )
}
