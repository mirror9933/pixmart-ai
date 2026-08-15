import { ipcMain, dialog, BrowserWindow, app } from 'electron'
import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import extract from 'extract-zip'
import { getDb, saveDatabase } from '../database'
import { logger } from '../utils/logger'
import { ensureDir, getProjectsPath } from '../utils/paths'

interface BackupData {
  app: string
  formatVersion: number
  exportedAt: string
  settings: Array<{ key: string; value: string; updated_at: string }>
  modelConfigs: Array<Record<string, unknown>>
  projects: Array<Record<string, unknown>>
}

const BACKUP_APP = 'pixmart-ai'
const FORMAT_VERSION = 1

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function getAllRows(table: string): Array<Record<string, unknown>> {
  const db = getDb()
  const stmt = db.prepare(`SELECT * FROM ${table}`)
  const rows: Array<Record<string, unknown>> = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as Record<string, unknown>)
  }
  stmt.free()
  return rows
}

function getSetting(key: string): string {
  try {
    const db = getDb()
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
    stmt.bind([key])
    if (stmt.step()) {
      const row = stmt.getAsObject() as { value: string }
      stmt.free()
      return row.value
    }
    stmt.free()
  } catch {}
  return ''
}

function setSetting(key: string, value: string): void {
  const db = getDb()
  const stamp = now()
  db.run(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `, [key, value, stamp])
  saveDatabase()
}

/** Collect all backup data from the database. */
export function collectBackupData(): BackupData {
  return {
    app: BACKUP_APP,
    formatVersion: FORMAT_VERSION,
    exportedAt: now(),
    settings: getAllRows('settings'),
    modelConfigs: getAllRows('model_configs'),
    projects: getAllRows('projects')
  }
}

/** 项目图片目录(优先设置中的自定义路径,否则默认) */
function getActualProjectsDir(): string {
  const custom = getSetting('path_projects')
  return custom && fs.existsSync(custom) ? custom : getProjectsPath()
}

/** 统计项目图片文件夹数(仅用于导出提示) */
function countProjectFolders(): number {
  const dir = getActualProjectsDir()
  try {
    if (!fs.existsSync(dir)) return 0
    return fs.readdirSync(dir).length
  } catch {
    return 0
  }
}

/**
 * 写入备份 zip(backup.json + projects/ 项目图片目录)
 * zip 结构:
 *   backup.json           数据库备份(设置/模型/项目记录)
 *   projects/             项目图片目录(每个项目一个子文件夹)
 */
export async function writeBackupFile(targetPath: string): Promise<{ settings: number; modelConfigs: number; projects: number; images: number }> {
  const data = collectBackupData()
  ensureDir(path.dirname(targetPath))
  const tmpJson = targetPath + '.tmp.json'
  fs.writeFileSync(tmpJson, JSON.stringify(data, null, 2), 'utf-8')
  try {
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(targetPath)
      const archive = archiver('zip', { zlib: { level: 9 } })
      output.on('close', () => resolve())
      output.on('error', reject)
      archive.on('error', reject)
      archive.pipe(output)
      archive.file(tmpJson, { name: 'backup.json' })
      const projectsDir = getActualProjectsDir()
      if (fs.existsSync(projectsDir)) {
        archive.directory(projectsDir, 'projects')
      }
      archive.finalize()
    })
  } finally {
    try { fs.unlinkSync(tmpJson) } catch {}
  }
  const images = countProjectFolders()
  logger.info(`Backup zip written: ${targetPath} (settings=${data.settings.length}, models=${data.modelConfigs.length}, projects=${data.projects.length}, imageDirs=${images})`)
  return {
    settings: data.settings.length,
    modelConfigs: data.modelConfigs.length,
    projects: data.projects.length,
    images
  }
}

/** 恢复项目图片:把 zip 解压出的 projects/ 目录复制回当前项目目录(失败不影响数据库恢复) */
function restoreProjectImages(imagesSrcDir: string): number {
  const dest = getActualProjectsDir()
  let restored = 0
  try {
    if (fs.existsSync(imagesSrcDir)) {
      ensureDir(dest)
      for (const entry of fs.readdirSync(imagesSrcDir)) {
        fs.cpSync(path.join(imagesSrcDir, entry), path.join(dest, entry), { recursive: true })
        restored++
      }
      logger.info(`Project images restored: ${restored} project folder(s) -> ${dest}`)
    }
  } catch (e) {
    logger.error('Failed to restore project images:', e)
  }
  return restored
}

/** Restore backup data into the database (upsert, keeps existing records). */
export function restoreBackupData(data: BackupData): { settings: number; modelConfigs: number; projects: number } {
  const db = getDb()
  const stamp = now()

  // Restore settings (overwrite existing keys)
  if (Array.isArray(data.settings)) {
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `)
    for (const row of data.settings) {
      if (!row || typeof row.key !== 'string') continue
      stmt.run([row.key, String(row.value ?? ''), String(row.updated_at ?? stamp)])
    }
    stmt.free()
  }

  // Restore model configs (upsert by id)
  if (Array.isArray(data.modelConfigs)) {
    const stmt = db.prepare(`
      INSERT INTO model_configs (id, vendor, vendor_label, api_key, base_url, protocol, status, latency, tested_at, models, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        vendor = excluded.vendor,
        vendor_label = excluded.vendor_label,
        api_key = excluded.api_key,
        base_url = excluded.base_url,
        protocol = excluded.protocol,
        status = excluded.status,
        latency = excluded.latency,
        tested_at = excluded.tested_at,
        models = excluded.models,
        updated_at = excluded.updated_at
    `)
    for (const row of data.modelConfigs) {
      if (!row || typeof row.id !== 'string') continue
      stmt.run([
        row.id,
        String(row.vendor ?? ''),
        String(row.vendor_label ?? ''),
        String(row.api_key ?? ''),
        String(row.base_url ?? ''),
        String(row.protocol ?? 'openai'),
        String(row.status ?? 'untested'),
        Number(row.latency ?? 0),
        row.tested_at == null ? null : String(row.tested_at),
        typeof row.models === 'string' ? row.models : JSON.stringify(row.models ?? []),
        String(row.created_at ?? stamp),
        String(row.updated_at ?? stamp)
      ])
    }
    stmt.free()
  }

  // Restore project records (upsert by id)
  if (Array.isArray(data.projects)) {
    const stmt = db.prepare(`
      INSERT INTO projects (id, title, category, category_label, status, status_label, image_count, description, params, source_images, output_images, preview_color, points, error_message, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        category_label = excluded.category_label,
        status = excluded.status,
        status_label = excluded.status_label,
        image_count = excluded.image_count,
        description = excluded.description,
        params = excluded.params,
        source_images = excluded.source_images,
        output_images = excluded.output_images,
        preview_color = excluded.preview_color,
        points = excluded.points,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at
    `)
    for (const row of data.projects) {
      if (!row || typeof row.id !== 'string') continue
      stmt.run([
        row.id,
        String(row.title ?? ''),
        String(row.category ?? ''),
        String(row.category_label ?? ''),
        String(row.status ?? 'pending'),
        String(row.status_label ?? '待处理'),
        Number(row.image_count ?? 0),
        String(row.description ?? ''),
        String(row.params ?? '{}'),
        String(row.source_images ?? '[]'),
        String(row.output_images ?? '[]'),
        String(row.preview_color ?? '#6366f1'),
        Number(row.points ?? 0),
        row.error_message == null ? null : String(row.error_message),
        String(row.created_at ?? stamp),
        String(row.updated_at ?? stamp)
      ])
    }
    stmt.free()
  }

  saveDatabase()
  return {
    settings: data.settings?.length ?? 0,
    modelConfigs: data.modelConfigs?.length ?? 0,
    projects: data.projects?.length ?? 0
  }
}

/** Start the auto-backup scheduler (checks every 30 seconds). */
export function startAutoBackup(): void {
  setInterval(() => {
    ;(async () => {
      try {
        const enabled = getSetting('backup_enabled') === 'true'
        if (!enabled) return
        const time = getSetting('backup_time') || '09:00'
        const dir = getSetting('backup_dir')
        if (!dir || !fs.existsSync(dir)) return

        const nowDate = new Date()
        const hhmm = `${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}`
        if (hhmm !== time) return

        const today = nowDate.toISOString().slice(0, 10)
        if (getSetting('backup_last_date') === today) return

        const file = path.join(dir, `pixmart-backup-${today}.zip`)
        const result = await writeBackupFile(file)
        setSetting('backup_last_date', today)
        logger.info(`Auto backup completed: ${file} (${JSON.stringify(result)})`)
      } catch (error) {
        logger.error('Auto backup failed:', error)
      }
    })()
  }, 30 * 1000)
}

export function registerBackupHandlers(): void {
  ipcMain.handle('backup:getConfig', async () => {
    try {
      return {
        enabled: getSetting('backup_enabled') === 'true',
        time: getSetting('backup_time') || '09:00',
        dir: getSetting('backup_dir') || ''
      }
    } catch (error) {
      logger.error('Failed to get backup config:', error)
      return { enabled: false, time: '09:00', dir: '' }
    }
  })

  ipcMain.handle('backup:setConfig', async (_event, config: { enabled?: boolean; time?: string; dir?: string }) => {
    try {
      if (typeof config.enabled === 'boolean') setSetting('backup_enabled', String(config.enabled))
      if (typeof config.time === 'string' && config.time) setSetting('backup_time', config.time)
      if (typeof config.dir === 'string') setSetting('backup_dir', config.dir)
      return { success: true }
    } catch (error) {
      logger.error('Failed to set backup config:', error)
      return { success: false }
    }
  })

  ipcMain.handle('backup:export', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const defaultName = `pixmart-backup-${new Date().toISOString().slice(0, 10)}.zip`
      const result = win
        ? await dialog.showSaveDialog(win, {
            title: '导出备份',
            defaultPath: defaultName,
            filters: [{ name: 'Pixmart 备份', extensions: ['zip'] }]
          })
        : { canceled: true, filePath: '' }

      if (result.canceled || !result.filePath) return { success: false, canceled: true }

      const counts = await writeBackupFile(result.filePath)
      logger.info(`Backup exported: ${result.filePath} (${JSON.stringify(counts)})`)
      return { success: true, path: result.filePath, counts }
    } catch (error) {
      logger.error('Failed to export backup:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle('backup:import', async (event) => {
    const extractDir = path.join(app.getPath('temp'), `pixmart-restore-${Date.now()}`)
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: '导入备份',
            filters: [{ name: 'Pixmart 备份', extensions: ['zip'] }],
            properties: ['openFile']
          })
        : { canceled: true, filePaths: [] }

      if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true }

      const zipPath = result.filePaths[0]
      // 解压备份 zip(backup.json + projects/)
      await extract(zipPath, { dir: extractDir })

      const jsonPath = path.join(extractDir, 'backup.json')
      if (!fs.existsSync(jsonPath)) {
        return { success: false, error: '备份文件格式不正确（缺少 backup.json）' }
      }
      const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as BackupData
      if (raw.app !== BACKUP_APP) {
        return { success: false, error: '不是有效的 Pixmart 备份文件' }
      }

      const counts = restoreBackupData(raw)
      // 恢复项目图片(zip 内的 projects/ 目录;旧备份可能没有)
      const images = restoreProjectImages(path.join(extractDir, 'projects'))
      logger.info(`Backup imported: ${zipPath} (${JSON.stringify(counts)}, images=${images})`)
      return {
        success: true,
        path: zipPath,
        counts: { ...counts, images }
      }
    } catch (error) {
      logger.error('Failed to import backup:', error)
      return { success: false, error: (error as Error).message }
    } finally {
      try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch {}
    }
  })
}
