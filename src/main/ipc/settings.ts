import { ipcMain } from 'electron'
import { getDb, saveDatabase } from '../database'
import { logger } from '../utils/logger'

interface SettingRow {
  key: string
  value: string
  updated_at: string
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:getAll', async () => {
    try {
      const db = getDb()
      const stmt = db.prepare('SELECT * FROM settings')
      const rows: SettingRow[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as SettingRow)
      }
      stmt.free()
      const settings: Record<string, string> = {}
      for (const row of rows) {
        settings[row.key] = row.value
      }
      return settings
    } catch (error) {
      logger.error('Failed to get all settings:', error)
      throw error
    }
  })

  ipcMain.handle('settings:get', async (_event, key: string) => {
    try {
      const db = getDb()
      const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
      stmt.bind([key])
      if (!stmt.step()) {
        stmt.free()
        return null
      }
      const row = stmt.getAsObject() as SettingRow
      stmt.free()
      return row.value
    } catch (error) {
      logger.error(`Failed to get setting ${key}:`, error)
      throw error
    }
  })

  ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
    try {
      const db = getDb()
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      db.run(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
      `, [key, value, now, value, now])

      saveDatabase()
      logger.info(`Setting updated: ${key} = ${value}`)
      return { success: true }
    } catch (error) {
      logger.error(`Failed to set setting ${key}:`, error)
      throw error
    }
  })

  ipcMain.handle('settings:setMany', async (_event, settings: Record<string, string>) => {
    try {
      const db = getDb()
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

      for (const [key, value] of Object.entries(settings)) {
        db.run(`
          INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
        `, [key, value, now, value, now])
      }

      saveDatabase()
      logger.info(`Multiple settings updated: ${Object.keys(settings).join(', ')}`)
      return { success: true }
    } catch (error) {
      logger.error('Failed to set multiple settings:', error)
      throw error
    }
  })
}
