export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function similarityLabel(similarity: number): string {
  if (similarity === 100) return '完全重複'
  if (similarity >= 95) return '極度に類似'
  if (similarity >= 85) return 'よく似ている'
  return 'やや似ている'
}

export function similarityColor(similarity: number): string {
  if (similarity === 100) return 'text-red-400'
  if (similarity >= 95) return 'text-orange-400'
  if (similarity >= 85) return 'text-yellow-400'
  return 'text-blue-400'
}
