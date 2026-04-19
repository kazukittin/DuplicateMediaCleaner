import { Loader2, X, HardDrive, Zap } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useWebSocket } from '../hooks/useWebSocket'
import type { ScanProgress, ScanResult } from '../types'
import { formatDuration } from '../utils/format'

export default function ScanProgressScreen() {
  const { scanProgress, setScanProgress, setScanResult, setScreen, scanOptions } = useAppStore()

  const { emit } = useWebSocket({
    onScanProgress: (progress: ScanProgress) => setScanProgress(progress),
    onScanComplete: (result: ScanResult) => {
      setScanResult(result)
      setScreen('results')
    },
    onError: (msg: string) => {
      console.error(msg)
      setScreen('home')
    },
  })

  const handleCancel = () => {
    emit('scan_cancel', {})
    setScanProgress(null)
    setScreen('home')
  }

  const percent =
    scanProgress && scanProgress.total > 0
      ? Math.round((scanProgress.processed / scanProgress.total) * 100)
      : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-bg-card border-b border-border px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <HardDrive size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-primary">DuplicateMediaCleaner</h1>
          <p className="text-xs text-text-secondary">スキャン中...</p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg space-y-6">
          {/* Spinner */}
          <div className="flex justify-center">
            <Loader2 size={56} className="text-primary animate-spin" />
          </div>

          <div className="text-center">
            <p className="text-lg font-semibold text-text-primary">
              {scanProgress?.phase ?? 'スキャン準備中...'}
            </p>
            <p className="text-sm text-text-secondary mt-1 truncate px-4" title={scanProgress?.currentFile}>
              {scanProgress?.currentFile ?? scanOptions.folderPath}
            </p>
          </div>

          {/* Progress bar */}
          <div className="bg-bg-card rounded-xl border border-border p-6 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">進捗</span>
              <span className="font-bold text-primary">{percent}%</span>
            </div>
            <div className="h-3 bg-bg-dark rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <p className="text-text-muted text-xs uppercase">処理済み</p>
                <p className="font-bold text-text-primary">
                  {(scanProgress?.processed ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase">合計</p>
                <p className="font-bold text-text-primary">
                  {(scanProgress?.total ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase">速度</p>
                <p className="font-bold text-text-primary">
                  {(scanProgress?.speed ?? 0).toFixed(1)} 件/秒
                </p>
              </div>
            </div>
            {scanProgress?.elapsedTime != null && (
              <p className="text-center text-xs text-text-muted">
                経過時間: {formatDuration(scanProgress.elapsedTime)}
              </p>
            )}
            {(scanProgress?.cacheHits ?? 0) > 0 && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-success">
                <Zap size={12} />
                キャッシュヒット: {scanProgress!.cacheHits} 件
                （{Math.round(scanProgress!.cacheHits / (scanProgress!.processed || 1) * 100)}%）
              </div>
            )}
          </div>

          <button
            onClick={handleCancel}
            className="w-full py-3 border border-border hover:border-accent hover:text-accent text-text-secondary rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <X size={16} />
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
