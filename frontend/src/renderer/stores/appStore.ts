import { create } from 'zustand'
import type {
  AppScreen,
  ScanOptions,
  ScanProgress,
  ScanResult,
  FileGroup,
  DeleteResult,
  DeleteMethod,
} from '../types'

interface AppState {
  screen: AppScreen
  scanOptions: ScanOptions
  scanProgress: ScanProgress | null
  scanResult: ScanResult | null
  selectedFileIds: Set<string>
  deleteMethod: DeleteMethod
  deleteResult: DeleteResult | null
  activeTab: 'image' | 'video'
  activeCategory: string | null
  backendPort: number  // 0 = not yet known

  thumbnails: Map<string, string>   // fileId → base64（バックグラウンドで逐次届く）

  setScreen: (screen: AppScreen) => void
  setScanOptions: (opts: Partial<ScanOptions>) => void
  setScanProgress: (progress: ScanProgress | null) => void
  setScanResult: (result: ScanResult | null) => void
  toggleFileSelection: (fileId: string) => void
  selectAllInGroup: (group: FileGroup) => void
  clearSelection: () => void
  setDeleteMethod: (method: DeleteMethod) => void
  setDeleteResult: (result: DeleteResult | null) => void
  setActiveTab: (tab: 'image' | 'video') => void
  setActiveCategory: (category: string | null) => void
  setBackendPort: (port: number) => void
  updateThumbnails: (batch: Record<string, string>) => void
  reset: () => void
}

const defaultScanOptions: ScanOptions = {
  folderPath: '',
  includeSubfolders: true,
  detectDuplicates: true,
  detectSimilar: true,
  similarityThreshold: 85,
  fileTypes: ['image', 'video'],
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'home',
  scanOptions: defaultScanOptions,
  scanProgress: null,
  scanResult: null,
  selectedFileIds: new Set(),
  deleteMethod: 'trash',
  deleteResult: null,
  activeTab: 'image',
  activeCategory: null,
  backendPort: 0,
  thumbnails: new Map(),

  setScreen: (screen) => set({ screen }),
  setScanOptions: (opts) =>
    set((state) => ({ scanOptions: { ...state.scanOptions, ...opts } })),
  setScanProgress: (scanProgress) => set({ scanProgress }),
  setScanResult: (scanResult) => set({ scanResult }),

  toggleFileSelection: (fileId) =>
    set((state) => {
      const next = new Set(state.selectedFileIds)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return { selectedFileIds: next }
    }),

  selectAllInGroup: (group) =>
    set((state) => {
      const next = new Set(state.selectedFileIds)
      group.files.filter((f) => !f.isKeep).forEach((f) => next.add(f.id))
      return { selectedFileIds: next }
    }),

  clearSelection: () => set({ selectedFileIds: new Set() }),
  setDeleteMethod: (deleteMethod) => set({ deleteMethod }),
  setDeleteResult: (deleteResult) => set({ deleteResult }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setActiveCategory: (activeCategory) => set({ activeCategory }),
  setBackendPort: (backendPort) => set({ backendPort }),

  updateThumbnails: (batch) =>
    set((state) => {
      const next = new Map(state.thumbnails)
      for (const [id, b64] of Object.entries(batch)) {
        next.set(id, b64)
      }
      return { thumbnails: next }
    }),

  reset: () =>
    set({
      screen: 'home',
      scanProgress: null,
      scanResult: null,
      selectedFileIds: new Set(),
      deleteResult: null,
      activeCategory: null,
      thumbnails: new Map(),
    }),
}))

export function getSelectedCount(state: AppState): number {
  return state.selectedFileIds.size
}

export function getSelectedSize(state: AppState): number {
  if (!state.scanResult) return 0
  let total = 0
  for (const group of state.scanResult.groups) {
    for (const file of group.files) {
      if (state.selectedFileIds.has(file.id)) {
        total += file.size
      }
    }
  }
  return total
}
