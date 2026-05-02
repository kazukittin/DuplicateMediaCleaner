import { useState } from 'react'
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react'
import { useAppStore, getSelectedCount, getSelectedSize } from '../stores/appStore'
import { useWebSocket } from '../hooks/useWebSocket'
import { formatBytes } from '../utils/format'
import type { DeleteResult } from '../types'

export default function DeleteConfirmScreen() {
  const {
    selectedFileIds,
    deleteMethod,
    setDeleteMethod,
    setDeleteResult,
    setScreen,
    scanResult,
  } = useAppStore()

  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState({ processed: 0, total: 0 })

  const selectedCount = getSelectedCount(useAppStore.getState())
  const selectedSize = getSelectedSize(useAppStore.getState())

  const { connect } = useWebSocket({
    onDeleteProgress: (progress) => setDeleteProgress(progress),
    onDeleteComplete: (result: DeleteResult) => {
      setDeleteResult(result)
      setIsDeleting(false)
      setScreen('delete-complete')
    },
    onError: (msg) => {
      console.error(msg)
      setIsDeleting(false)
    },
  })

  const handleDelete = () => {
    setIsDeleting(true)
    setDeleteProgress({ processed: 0, total: selectedCount })
    const socket = connect()
    socket?.emit('delete_files', {
      file_ids: Array.from(selectedFileIds),
      method: deleteMethod,
    })
  }

  if (isDeleting) {
    const percent =
      deleteProgress.total > 0
        ? Math.round((deleteProgress.processed / deleteProgress.total) * 100)
        : 0

    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-bg-base">
        <div className="w-full max-w-md text-center space-y-5">
          <Loader2 size={40} className="text-accent animate-spin mx-auto" />
          <p className="text-base font-semibold text-text-primary">削除中...</p>
          <div className="h-2.5 bg-bg-panel border border-border overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm text-text-secondary">
            {deleteProgress.processed} / {deleteProgress.total} ファイル処理済み
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-bg-base">
      <div className="bg-bg-panel border-b border-border px-4 py-2 flex items-center gap-2">
        <AlertTriangle size={15} className="text-accent" />
        <h1 className="text-sm font-medium text-text-primary">削除の確認</h1>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg space-y-4">
          {/* Summary */}
          <div className="bg-bg-card border border-border p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">削除対象ファイル数</span>
              <span className="font-bold text-accent">{selectedCount} 件</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">解放されるディスク容量</span>
              <span className="font-bold text-success">{formatBytes(selectedSize)}</span>
            </div>
          </div>

          {/* Delete method */}
          <div className="bg-bg-card border border-border p-4 space-y-3">
            <h2 className="text-sm font-semibold text-text-primary">削除方法</h2>
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  value="trash"
                  checked={deleteMethod === 'trash'}
                  onChange={() => setDeleteMethod('trash')}
                  className="accent-primary mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-text-primary">ごみ箱へ移動（推奨）</p>
                  <p className="text-xs text-text-secondary">ごみ箱から復元が可能です</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  value="permanent"
                  checked={deleteMethod === 'permanent'}
                  onChange={() => setDeleteMethod('permanent')}
                  className="accent-red-500 mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-accent">完全削除</p>
                  <p className="text-xs text-text-secondary">復元できません。注意して使用してください。</p>
                </div>
              </label>
            </div>
          </div>

          {deleteMethod === 'permanent' && (
            <div className="bg-red-50 border border-red-300 px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={14} className="text-accent flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                完全削除を選択しました。この操作は元に戻せません。
                実行前にバックアップを確認してください。
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setScreen('results')}
              className="flex-1 py-2 border border-border hover:border-primary text-text-secondary hover:text-primary text-sm font-medium transition-colors flex items-center justify-center gap-2 bg-bg-card"
            >
              <X size={15} />
              キャンセル
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 py-2 bg-accent hover:bg-red-700 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={15} />
              削除実行
            </button>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t border-border bg-bg-panel px-3 py-0.5 text-xs text-text-muted">
        削除方法: {deleteMethod === 'trash' ? 'ごみ箱へ移動' : '完全削除'}
      </div>
    </div>
  )
}
