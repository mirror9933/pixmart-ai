import { app, BrowserWindow, shell, nativeTheme, ipcMain, Menu } from 'electron'
import { ensureAllDirs, getPreloadPath, getRendererUrl } from './utils/paths'
import path from 'path'
import fs from 'fs'
import { initDatabase, closeDatabase, getDb } from './database'
import { logger } from './utils/logger'
import { registerProjectsHandlers } from './ipc/projects'
import { registerSettingsHandlers } from './ipc/settings'
import { registerModelsHandlers } from './ipc/models'
import { registerFilesHandlers, clearTempState } from './ipc/files'
import { registerAIHandlers } from './ipc/ai'
import { registerPathsHandlers } from './ipc/paths'
import { registerBackupHandlers, startAutoBackup } from './ipc/backup'
import { registerUpdaterHandlers, checkForUpdatesOnStartup } from './services/updater'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function getInitialTheme(): string {
  try {
    const db = getDb()
    const stmt = db.prepare("SELECT value FROM settings WHERE key = 'theme'")
    if (stmt.step()) {
      const row = stmt.getAsObject() as { value: string }
      stmt.free()
      return row.value
    }
    stmt.free()
  } catch {}
  return 'system'
}

function applyThemeToWindow(theme: string): void {
  nativeTheme.themeSource = theme === 'system' ? 'system' : theme
}

function createWindow(): BrowserWindow {
  const preloadPath = getPreloadPath()
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Pixmart AI',
    icon: path.join(__dirname, '../renderer/icon-letter.svg'),
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    const theme = getInitialTheme()
    applyThemeToWindow(theme)
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isDev && !url.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  const rendererUrl = getRendererUrl()
  if (isDev && rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(rendererUrl.replace('file://', ''))
  }

  return mainWindow
}

ipcMain.on('theme:apply', (_, theme: string) => {
  applyThemeToWindow(theme)
})

function registerAllHandlers(): void {
  registerProjectsHandlers()
  registerSettingsHandlers()
  registerModelsHandlers()
  registerFilesHandlers()
  registerAIHandlers()
  registerPathsHandlers()
  registerBackupHandlers()
  registerUpdaterHandlers()
  // 真实版本号(来自打包后的 app,跟随 package.json version)
  ipcMain.handle('app:getVersion', () => app.getVersion())
  startAutoBackup()
  logger.info('All IPC handlers registered')
}

app.whenReady().then(async () => {
  logger.info('App starting...')

  if (process.platform === 'win32') {
    app.setAppUserModelId('com.pixmart-ai')
  }

  ensureAllDirs()

  await initDatabase()

  registerAllHandlers()

  createWindow()

  // 启动后静默检查更新(仅打包环境)
  checkForUpdatesOnStartup()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  logger.info('App started successfully')
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  clearTempState()
  closeDatabase()
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason)
})
