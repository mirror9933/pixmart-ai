import { ipcMain, dialog, shell, app } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../utils/logger'
import { getDb, saveDatabase } from '../database'
import { ensureDir } from '../utils/paths'

const PATH_KEYS = ['projects', 'exports', 'temp', 'logs'] as const
type PathKey = typeof PATH_KEYS[number]

const DEFAULT_PATHS: Record<PathKey, () => string> = {
  projects: () => path.join(app.getPath('userData'), 'projects'),
  exports: () => path.join(app.getPath('userData'), 'exports'),
  temp: () => path.join(app.getPath('userData'), 'temp'),
  logs: () => path.join(app.getPath('userData'), 'logs'),
}

function getPathFromDb(key: PathKey): string {
  try {
    const db = getDb()
    const stmt = db.prepare("SELECT value FROM settings WHERE key = ?")
    stmt.bind([`path_${key}`])
    if (stmt.step()) {
      const row = stmt.getAsObject() as { value: string }
      stmt.free()
      return row.value
    }
    stmt.free()
  } catch {}
  return DEFAULT_PATHS[key]()
}

function setPathInDb(key: PathKey, value: string): void {
  const db = getDb()
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
  db.run(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
  `, [`path_${key}`, value, now, value, now])
  saveDatabase()
}

function moveDirectoryContents(src: string, dest: string): { moved: number; errors: string[] } {
  const errors: string[] = []
  let moved = 0

  if (!fs.existsSync(src)) return { moved: 0, errors: [] }
  ensureDir(dest)

  try {
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      try {
        if (entry.isDirectory()) {
          if (fs.existsSync(destPath)) {
            const sub = moveDirectoryContents(srcPath, destPath)
            moved += sub.moved
            errors.push(...sub.errors)
          } else {
            fs.renameSync(srcPath, destPath)
            moved++
          }
        } else {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath)
          }
          fs.renameSync(srcPath, destPath)
          moved++
        }
      } catch (e) {
        errors.push(`${entry.name}: ${(e as Error).message}`)
        try {
          fs.copyFileSync(srcPath, destPath)
          fs.unlinkSync(srcPath)
          moved++
        } catch {
          errors.push(`${entry.name}: copy fallback failed`)
        }
      }
    }
  } catch (e) {
    errors.push(`read dir: ${(e as Error).message}`)
  }

  return { moved, errors }
}

export function getPath(key: PathKey): string {
  return getPathFromDb(key)
}

export function registerPathsHandlers(): void {
  ipcMain.handle('paths:getAll', async () => {
    try {
      const platform = process.platform === 'darwin' ? 'mac' : 'windows'
      const result: Record<string, { current: string; default: string }> = {}
      for (const key of PATH_KEYS) {
        result[key] = {
          current: getPathFromDb(key),
          default: DEFAULT_PATHS[key](),
        }
      }
      return { platform, paths: result }
    } catch (error) {
      logger.error('Failed to get paths:', error)
      throw error
    }
  })

  ipcMain.handle('paths:update', async (_event, key: PathKey, newPath: string) => {
    try {
      const oldPath = getPathFromDb(key)
      if (oldPath === newPath) return { success: true, moved: 0 }

      if (!fs.existsSync(oldPath)) {
        setPathInDb(key, newPath)
        ensureDir(newPath)
        logger.info(`Path ${key} updated (no migration needed): ${newPath}`)
        return { success: true, moved: 0 }
      }

      logger.info(`Path ${key} migration starting: ${oldPath} -> ${newPath}`)
      const { moved, errors } = moveDirectoryContents(oldPath, newPath)

      setPathInDb(key, newPath)

      if (errors.length > 0) {
        logger.warn(`Path ${key} migration partial errors:`, errors)
      }

      logger.info(`Path ${key} updated: moved ${moved} items, ${errors.length} errors`)
      return { success: true, moved, errors }
    } catch (error) {
      logger.error(`Failed to update path ${key}:`, error)
      throw error
    }
  })

  ipcMain.handle('paths:selectDirectory', async (event, title?: string) => {
    try {
      const win = require('electron').BrowserWindow.fromWebContents(event.sender)
      if (!win) throw new Error('No window found')

      const result = await dialog.showOpenDialog(win, {
        title: title || '选择目录',
        properties: ['openDirectory']
      })

      if (result.canceled) return null
      return result.filePaths[0]
    } catch (error) {
      logger.error('Failed to select directory:', error)
      throw error
    }
  })

  ipcMain.handle('paths:openDirectory', async (_event, dirPath: string) => {
    try {
      if (fs.existsSync(dirPath)) {
        // Reveal the location in the system file manager (selects the item)
        shell.showItemInFolder(dirPath)
        logger.info(`Revealed location: ${dirPath}`)
      } else {
        logger.warn(`Directory not found: ${dirPath}`)
      }
      return { success: true }
    } catch (error) {
      logger.error('Failed to open directory:', error)
      throw error
    }
  })

  // 打开外部链接(仅允许 http/https,用于网盘下载等跳转)
  ipcMain.handle('paths:openExternal', async (_event, url: string) => {
    try {
      if (!url || !/^https?:\/\//i.test(url)) {
        return { success: false, error: '无效链接' }
      }
      await shell.openExternal(url)
      logger.info(`Opened external url: ${url}`)
      return { success: true }
    } catch (error) {
      logger.error('Failed to open external url:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('paths:resetToDefault', async (_event, key: PathKey) => {
    try {
      const oldPath = getPathFromDb(key)
      const defaultPath = DEFAULT_PATHS[key]()

      if (oldPath === defaultPath) return { success: true, moved: 0 }

      if (!fs.existsSync(oldPath)) {
        setPathInDb(key, defaultPath)
        ensureDir(defaultPath)
        logger.info(`Path ${key} reset to default (no migration): ${defaultPath}`)
        return { success: true, moved: 0 }
      }

      logger.info(`Path ${key} reset starting: ${oldPath} -> ${defaultPath}`)
      const { moved, errors } = moveDirectoryContents(oldPath, defaultPath)
      setPathInDb(key, defaultPath)

      logger.info(`Path ${key} reset to default: moved ${moved} items, ${errors.length} errors`)
      return { success: true, moved, errors }
    } catch (error) {
      logger.error(`Failed to reset path ${key}:`, error)
      throw error
    }
  })

  ipcMain.handle('paths:getLogs', async () => {
    try {
      const logsDir = getPathFromDb('logs')
      const date = new Date().toISOString().split('T')[0]
      const logFile = path.join(logsDir, `pixmart-${date}.log`)

      if (!fs.existsSync(logFile)) {
        const files = fs.existsSync(logsDir)
          ? fs.readdirSync(logsDir).filter(f => f.endsWith('.log')).sort().reverse()
          : []
        return { content: '', files, currentFile: `pixmart-${date}.log` }
      }
      const content = fs.readFileSync(logFile, 'utf-8')
      const files = fs.readdirSync(logsDir)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse()
      return { content, files, currentFile: `pixmart-${date}.log` }
    } catch (error) {
      logger.error('Failed to get logs:', error)
      return { content: '', files: [], error: (error as Error).message }
    }
  })

  ipcMain.handle('paths:getLogFile', async (_event, filename: string) => {
    try {
      const logsDir = getPathFromDb('logs')
      const logFile = path.join(logsDir, filename)
      if (!fs.existsSync(logFile)) return { content: '' }
      return { content: fs.readFileSync(logFile, 'utf-8') }
    } catch (error) {
      logger.error('Failed to get log file:', error)
      return { content: '' }
    }
  })

  ipcMain.handle('paths:clearLogs', async () => {
    try {
      const logsDir = getPathFromDb('logs')
      if (fs.existsSync(logsDir)) {
        const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'))
        for (const f of files) {
          fs.unlinkSync(path.join(logsDir, f))
        }
        logger.info(`Cleared ${files.length} log files`)
      }
      return { success: true }
    } catch (error) {
      logger.error('Failed to clear logs:', error)
      throw error
    }
  })

  ipcMain.handle('paths:exportLogs', async () => {
    try {
      const logsDir = getPathFromDb('logs')
      logger.info(`Log export requested: ${logsDir}`)
      return { path: logsDir }
    } catch (error) {
      logger.error('Failed to export logs:', error)
      throw error
    }
  })
}
