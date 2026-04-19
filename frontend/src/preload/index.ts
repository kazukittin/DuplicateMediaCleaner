import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('select-folder'),

  getBackendPort: (): Promise<number> =>
    ipcRenderer.invoke('get-backend-port'),

  openFileLocation: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('open-file-location', filePath),

  openLogsFolder: (): Promise<void> =>
    ipcRenderer.invoke('open-logs-folder'),
})
