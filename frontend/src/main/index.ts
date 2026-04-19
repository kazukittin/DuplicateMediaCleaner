import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'path'
import { PythonBridge } from './python-bridge'

let mainWindow: BrowserWindow | null = null
let pythonBridge: PythonBridge | null = null

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1F1F1F',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../resources/icon.png'),
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  pythonBridge = new PythonBridge()
  await pythonBridge.start()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  if (pythonBridge) {
    await pythonBridge.stop()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'スキャンするフォルダを選択（ネットワークドライブも選択可能）',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('get-backend-port', () => {
  return pythonBridge?.port ?? 8765
})

ipcMain.handle('open-file-location', async (_event, filePath: string) => {
  await shell.showItemInFolder(filePath)
})

ipcMain.handle('open-logs-folder', async () => {
  const logsPath = path.join(app.getPath('appData'), 'DuplicateMediaCleaner', 'logs')
  await shell.openPath(logsPath)
})
