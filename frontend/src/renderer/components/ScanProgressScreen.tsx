import { useState, useLayoutEffect } from 'react'
import { Loader2, X, HardDrive, Zap, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useWebSocket } from '../hooks/useWebSocket'
import type { ScanProgress, ScanResult } from '../types'
import { formatDuration } from '../utils/format'

export default function ScanProgressScreen() {
  const { scanProgress, setScanProgress, setScanResult, setScreen, scanOptions } = useAppStore()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { connect, emit } = useWebSocket({
    onScanProgress: (progress: ScanProgress) => setScanProgress(progress),
    onScanComplete: (result: ScanResult) => {
      setScanResult(result)
      setScreen('results')
    },
    onError: (msg: string) => {
      console.error('[scan error]', msg)
      setErrorMsg(msg)   // ホームに戻らず画面上にエラーを表示
    },
  })

  // useLayoutEffect (not useEffect) so handlers are registered synchronously
  // before the browser paints — eliminates the race window where HomeScreen's
  // stale onError (setScreen('home')) could fire before we take ownership.
  useLayoutEffect(() => {
    const socket = connect()
    return () => {
      // Remove our handlers on unmount so they don't linger after screen change
      socket?.off('scan_progress')
      socket?.off('scan_complete')
      socket?.off('thumbnail_batch')
      socket?.off('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCancel = () => {
    emit('scan_cancel', {})
    setScanProgress(null)
    setScreen('home')
  }

  const isGrouping = scanProgress?.phase?.includes('比較中') || scanProgress?.phase?.includes('検出中') || scanProgress?.phase?.includes('グループ')
  const percent =
    scanProgress && scanProgress.total > 0
      ? Math.round((scanProgress.processed / scanProgress.total) * 100)
      : 0

  return (
    <div className="flex flex-col h-full bg-bg-base">
      {/* Header */}
      <div className="bg-bg-panel border-b border-border px-4 py-2 flex items-center gap-3">
        <HardDrive size={16} className="text-primary" />
        <span className="text-sm font-medium text-text-primary">DuplicateMediaCleaner</span>
        <span className="text-xs text-text-muted">— スキャン中...</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg space-y-5">
          {/* Spinner */}
          <div className="flex justify-center">
            <Loader2 size={48} className="text-primary animate-spin" />
          </div>

          <div className="text-center">
            <p className="text-base font-semibold text-text-primary">
              {scanProgress?.phase ?? 'スキャン準備中...'}
            </p>
            <p className="text-xs text-text-secondary mt-1 truncate px-4" title={scanProgress?.currentFile}>
              {scanProgress?.currentFile ?? scanOptions.folderPath}
            </p>
          </div>

          {/* Progress bar */}
          <div className="bg-bg-card border border-border p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">進捗</span>
              <span className="font-bold text-primary">{percent}%</span>
            </div>
            <div className="h-2.5 bg-bg-panel border border-border overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${isGrouping ? 'bg-secondary' : 'bg-primary'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 text-center text-sm">
              <div>
                <p className="text-text-muted text-xs">処理済み</p>
                <p className="font-bold text-text-primary">
                  {(scanProgress?.processed ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs">合計</p>
                <p className="font-bold text-text-primary">
                  {(scanProgress?.total ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs">{isGrouping ? 'グループ数' : '速度'}</p>
                <p className="font-bold text-text-primary">
                  {isGrouping
                    ? `${percent}%`
                    : `${(scanProgress?.speed ?? 0).toFixed(1)} 件/秒`}
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
                （{Math.round(scanProgress!.cacheHits / (scanProgress!.totalScanned || scanProgress!.cacheHits || 1) * 100)}%）
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-300 p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-accent">エラーが発生しました</p>
                <p className="text-xs text-red-700 mt-1 break-all">{errorMsg}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleCancel}
            className="w-full py-2 border border-border hover:border-accent hover:text-accent text-text-secondary text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-bg-card"
          >
            <X size={15} />
            {errorMsg ? 'ホームに戻る' : 'キャンセル'}
          </button>
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t border-border bg-bg-panel px-3 py-0.5 text-xs text-text-muted">
        スキャン中: {scanOptions.folderPath}
      </div>
    </div>
  )
}
