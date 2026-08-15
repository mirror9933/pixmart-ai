import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { logger } from '../utils/logger'

let initialized = false

/** 向所有窗口发送更新状态(渲染进程据此更新设置页 UI) */
function sendStatus(status: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('updater:status', { status, payload })
    }
  }
}

function ensureInit(): void {
  if (initialized) return
  initialized = true
  // 发现更新后不自动下载,由用户在设置页点击"下载更新"
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => sendStatus('checking'))
  autoUpdater.on('update-available', (info) => sendStatus('available', info))
  autoUpdater.on('update-not-available', (info) => sendStatus('not-available', info))
  autoUpdater.on('error', (err) => {
    logger.error('Auto updater error:', err)
    sendStatus('error', { message: err?.message || '更新出错' })
  })
  autoUpdater.on('download-progress', (p) => {
    sendStatus('progress', {
      percent: Math.round(p.percent * 10) / 10,
      transferred: p.transferred,
      total: p.total
    })
  })
  autoUpdater.on('update-downloaded', (info) => sendStatus('downloaded', info))
}

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    try {
      if (!app.isPackaged) {
        return { success: false, error: '开发模式不支持在线更新' }
      }
      ensureInit()
      await autoUpdater.checkForUpdates()
      return { success: true }
    } catch (e: any) {
      logger.error('Failed to check for updates:', e)
      return { success: false, error: e?.message || '检查更新失败' }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      ensureInit()
      autoUpdater.downloadUpdate()
      return { success: true }
    } catch (e: any) {
      logger.error('Failed to download update:', e)
      return { success: false, error: e?.message || '下载更新失败' }
    }
  })

  ipcMain.handle('updater:quitAndInstall', async () => {
    autoUpdater.quitAndInstall()
    return { success: true }
  })

  ipcMain.handle('updater:getState', async () => {
    return {
      isPackaged: app.isPackaged,
      version: app.getVersion()
    }
  })
}

/** 启动后延迟数秒静默检查更新(仅打包环境) */
export function checkForUpdatesOnStartup(): void {
  if (!app.isPackaged) return
  setTimeout(() => {
    try {
      ensureInit()
      autoUpdater.checkForUpdates()
      logger.info('Auto update check started on startup')
    } catch (e) {
      logger.error('Startup update check failed:', e)
    }
  }, 10 * 1000)
}
