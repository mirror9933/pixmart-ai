import { app, ipcMain, BrowserWindow } from 'electron'
import { autoUpdater, ElectronHttpExecutor } from 'electron-updater'
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

/** 尽量提取可读的错误信息(electron-updater 的错误对象有时是空对象) */
function extractErrorMessage(err: unknown): string {
  if (!err) return '更新出错'
  if (err instanceof Error && err.message) return err.message
  try {
    const str = JSON.stringify(err)
    if (str && str !== '{}') return str
  } catch {}
  return '更新出错'
}

function ensureInit(): void {
  if (initialized) return
  initialized = true
  // 使用 Electron net 模块发起更新请求:自动走系统代理,
  // 解决 Node 网络栈直连 GitHub 超时/被墙导致检查更新失败的问题
  try {
    autoUpdater.httpExecutor = new ElectronHttpExecutor()
  } catch (e) {
    logger.warn('ElectronHttpExecutor init failed, falling back to default:', e)
  }
  // 发现更新后不自动下载,由用户在设置页点击"下载更新"
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => sendStatus('checking'))
  autoUpdater.on('update-available', (info) => sendStatus('available', info))
  autoUpdater.on('update-not-available', (info) => sendStatus('not-available', info))
  autoUpdater.on('error', (err) => {
    logger.error('Auto updater error:', err)
    sendStatus('error', { message: extractErrorMessage(err) })
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
      return { success: false, error: extractErrorMessage(e) }
    }
  })

  ipcMain.handle('updater:download', async () => {
    try {
      ensureInit()
      autoUpdater.downloadUpdate()
      return { success: true }
    } catch (e: any) {
      logger.error('Failed to download update:', e)
      return { success: false, error: extractErrorMessage(e) }
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
      autoUpdater.checkForUpdates().catch((e) => {
        // 防止 unhandled rejection(error 事件已推送 UI,此处仅记录)
        logger.error('Startup update check failed:', e)
      })
      logger.info('Auto update check started on startup')
    } catch (e) {
      logger.error('Startup update check exception:', e)
    }
  }, 10 * 1000)
}
