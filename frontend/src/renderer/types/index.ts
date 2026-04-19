export type AppScreen = 'home' | 'scanning' | 'results' | 'delete-confirm' | 'delete-complete'

export type FileType = 'image' | 'video'

export type DeleteMethod = 'trash' | 'permanent'

export interface ScanOptions {
  folderPath: string
  includeSubfolders: boolean
  detectDuplicates: boolean
  detectSimilar: boolean
  similarityThreshold: number
  fileTypes: FileType[]
}

export interface ScanProgress {
  currentFile: string
  processed: number
  total: number
  speed: number
  elapsedTime: number
  phase: string
  cacheHits: number
  cacheMisses: number
  totalScanned: number  // スキャン済みファイル総数（グループ化フェーズでも変わらない）
}

export interface ScanStatistics {
  totalFiles: number
  duplicateGroups: number
  similarGroups: number
  deletableFiles: number
  recoverableSpace: number
  cacheHits: number
}

export interface FileInfo {
  id: string
  path: string
  size: number
  modified: string
  resolution?: string
  duration?: number
  isKeep: boolean
  thumbnailBase64?: string
}

export interface FileGroup {
  groupId: string
  similarity: number
  fileType: FileType
  category: string
  files: FileInfo[]
}

export interface ScanResult {
  scanId: string
  statistics: ScanStatistics
  groups: FileGroup[]
}

export interface DeleteResult {
  success: number
  failed: number
  failedFiles: Array<{ path: string; reason: string }>
  freedSpace: number
}
