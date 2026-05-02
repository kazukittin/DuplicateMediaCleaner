import { CheckCircle, XCircle, FolderOpen, RotateCcw } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { formatBytes } from '../utils/format'

export default function DeleteCompleteScreen() {
  const { deleteResult, reset } = useAppStore()

  if (!deleteResult) return null

  const { success, failed, freedSpace, failedFiles } = deleteResult
  const hasErrors = failed > 0

  return (
    <div className="flex flex-col h-full bg-bg-base">
      <div className="bg-bg-panel border-b border-border px-4 py-2">
        <h1 className="text-sm font-medium text-text-primary">削除完了</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg space-y-4">
          {/* Result icon */}
          <div className="text-center">
            {hasErrors ? (
              <XCircle size={52} className="text-accent mx-auto mb-2" />
            ) : (
              <CheckCircle size={52} className="text-success mx-auto mb-2" />
            )}
            <h2 className="text-lg font-bold text-text-primary">
              {hasErrors ? '一部のファイルの削除に失敗しました' : '削除が完了しました'}
            </h2>
          </div>

          {/* Stats */}
          <div className="bg-bg-card border border-border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">削除成功</span>
              <span className="font-bold text-success">{success} 件</span>
            </div>
            {failed > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">削除失敗</span>
                <span className="font-bold text-accent">{failed} 件</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-border pt-2">
              <span className="text-text-secondary">解放されたディスク容量</span>
              <span className="font-bold text-primary">{formatBytes(freedSpace)}</span>
            </div>
          </div>

          {/* Failed files */}
          {failedFiles.length > 0 && (
            <div className="bg-red-50 border border-red-200 p-3 space-y-2 max-h-40 overflow-y-auto">
              <h3 className="text-xs font-semibold text-accent">削除失敗ファイル</h3>
              {failedFiles.map((f, i) => (
                <div key={i} className="text-xs">
                  <p className="text-text-secondary font-mono truncate">{f.path}</p>
                  <p className="text-text-muted">{f.reason}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => window.electronAPI?.openLogsFolder()}
              className="flex-1 py-2 border border-border hover:border-primary text-text-secondary hover:text-primary text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-bg-card"
            >
              <FolderOpen size={14} />
              ログフォルダを開く
            </button>
            <button
              onClick={reset}
              className="flex-1 py-2 bg-primary hover:bg-blue-700 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} />
              最初に戻る
            </button>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t border-border bg-bg-panel px-3 py-0.5 text-xs text-text-muted">
        削除完了: 成功 {success} 件 / 失敗 {failed} 件
      </div>
    </div>
  )
}
