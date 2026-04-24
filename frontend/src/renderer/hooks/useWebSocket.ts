import { useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { getSocket, disconnectSocket } from '../lib/socket'
import type { ScanProgress, ScanResult, DeleteResult } from '../types'

interface WSHandlers {
  onScanProgress?: (progress: ScanProgress) => void
  onScanComplete?: (result: ScanResult) => void
  onDeleteProgress?: (progress: { processed: number; total: number }) => void
  onDeleteComplete?: (result: DeleteResult) => void
  onThumbnailBatch?: (batch: Record<string, string>) => void
  onError?: (message: string) => void
}

export function useWebSocket(handlers: WSHandlers = {}) {
  const backendPort = useAppStore((s) => s.backendPort)

  // Connect explicitly — do NOT auto-connect on mount.
  // This avoids connecting to the wrong port before Electron IPC resolves the real port.
  const connect = useCallback(() => {
    if (!backendPort) throw new Error('Backend port not yet known')

    const socket = getSocket(backendPort)

    // Re-register handlers each time (idempotent because we off() first)
    socket.off('scan_progress')
    socket.off('scan_complete')
    socket.off('delete_progress')
    socket.off('delete_complete')
    socket.off('thumbnail_batch')
    socket.off('error')

    if (handlers.onScanProgress) socket.on('scan_progress', handlers.onScanProgress)
    if (handlers.onScanComplete) socket.on('scan_complete', handlers.onScanComplete)
    if (handlers.onDeleteProgress) socket.on('delete_progress', handlers.onDeleteProgress)
    if (handlers.onDeleteComplete) socket.on('delete_complete', handlers.onDeleteComplete)
    if (handlers.onThumbnailBatch) socket.on('thumbnail_batch', (d: { thumbnails: Record<string, string> }) => {
      console.log('[thumbnail_batch] received', Object.keys(d.thumbnails).length, 'thumbnails, sample id:', Object.keys(d.thumbnails)[0])
      handlers.onThumbnailBatch!(d.thumbnails)
    })
    if (handlers.onError) socket.on('error', (d: { message: string }) => handlers.onError!(d.message))

    return socket  // caller can use this reference for cleanup
  }, [backendPort, handlers.onScanProgress, handlers.onScanComplete, handlers.onDeleteProgress, handlers.onDeleteComplete, handlers.onThumbnailBatch, handlers.onError])

  const disconnect = useCallback(() => {
    disconnectSocket()
  }, [])

  const emit = useCallback((event: string, data: unknown) => {
    if (!backendPort) return
    getSocket(backendPort).emit(event, data)
  }, [backendPort])

  return { connect, disconnect, emit }
}
