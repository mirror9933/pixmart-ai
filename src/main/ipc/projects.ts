import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb, saveDatabase } from '../database'
import { logger } from '../utils/logger'
import { getProjectsPath } from '../utils/paths'
import { v4 } from '../utils/ids'

interface ProjectRow {
  id: string
  title: string
  category: string
  category_label: string
  status: string
  status_label: string
  image_count: number
  description: string
  params: string
  source_images: string
  output_images: string
  preview_color: string
  points: number
  error_message: string | null
  created_at: string
  updated_at: string
}

function parseProject(row: ProjectRow) {
  return {
    ...row,
    params: JSON.parse(row.params),
    sourceImages: JSON.parse(row.source_images),
    outputImages: JSON.parse(row.output_images),
    previewColor: row.preview_color,
    imageCount: row.image_count,
    categoryLabel: row.category_label,
    statusLabel: row.status_label,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 解析实际项目目录（优先取设置中的自定义路径，否则用默认） */
function resolveProjectsDir(): string {
  const db = getDb()
  try {
    const s = db.prepare('SELECT value FROM settings WHERE key = ?')
    s.bind(['path_projects'])
    if (s.step()) {
      const r = s.getAsObject() as { value: string }
      s.free()
      if (r.value) return r.value
    }
    s.free()
  } catch {}
  return getProjectsPath()
}

export function registerProjectsHandlers(): void {
  ipcMain.handle('projects:getAll', async (_event, args?: { category?: string; search?: string }) => {
    try {
      const db = getDb()
      let sql = 'SELECT * FROM projects'
      const conditions: string[] = []
      const params: unknown[] = []

      if (args?.category && args.category !== 'all') {
        conditions.push('category = ?')
        params.push(args.category)
      }

      if (args?.search) {
        conditions.push('(title LIKE ? OR description LIKE ?)')
        params.push(`%${args.search}%`, `%${args.search}%`)
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ')
      }

      sql += ' ORDER BY updated_at DESC'

      const stmt = db.prepare(sql)
      stmt.bind(params as any[])
      const rows: ProjectRow[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as ProjectRow)
      }
      stmt.free()

      // Resolve actual projects directory (from settings or default)
      const projectsDir = resolveProjectsDir()

      // Filter to only projects that exist on disk
      const existingIds = new Set<string>()
      if (fs.existsSync(projectsDir)) {
        for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
          if (entry.isDirectory()) existingIds.add(entry.name)
        }
      }

      // Clean up DB: remove records for projects whose folders don't exist
      const orphanIds = rows.filter(r => !existingIds.has(r.id)).map(r => r.id)
      if (orphanIds.length > 0) {
        for (const id of orphanIds) {
          db.run('DELETE FROM projects WHERE id = ?', [id])
        }
        saveDatabase()
        logger.info(`Cleaned up ${orphanIds.length} orphaned project records`)
      }

      // Sync image counts from disk for existing projects
      for (const row of rows) {
        if (!existingIds.has(row.id)) continue
        const imgDir = path.join(projectsDir, row.id, 'images')
        let actualCount = 0
        try {
          if (fs.existsSync(imgDir)) {
            actualCount = fs.readdirSync(imgDir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).length
          }
        } catch {}
        if (actualCount !== row.image_count) {
          db.run('UPDATE projects SET image_count = ?, updated_at = ? WHERE id = ?',
            [actualCount, new Date().toISOString().replace('T', ' ').slice(0, 19), row.id])
        }
      }

      return rows.filter(r => existingIds.has(r.id)).map(parseProject)
    } catch (error) {
      logger.error('Failed to get projects:', error)
      throw error
    }
  })

  ipcMain.handle('projects:getById', async (_event, id: string) => {
    try {
      const db = getDb()
      const stmt = db.prepare('SELECT * FROM projects WHERE id = ?')
      stmt.bind([id])
      if (!stmt.step()) {
        stmt.free()
        return null
      }
      const row = stmt.getAsObject() as ProjectRow
      stmt.free()
      return parseProject(row)
    } catch (error) {
      logger.error('Failed to get project:', error)
      throw error
    }
  })

  ipcMain.handle('projects:create', async (_event, data: {
    title: string
    category?: string
    categoryLabel?: string
    description?: string
    params?: Record<string, unknown>
    sourceImages?: string[]
    previewColor?: string
  }) => {
    try {
      const db = getDb()
      const id = v4()
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

      db.run(`
        INSERT INTO projects (id, title, category, category_label, status, status_label, image_count, description, params, source_images, output_images, preview_color, points, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        data.title,
        data.category || '',
        data.categoryLabel || '',
        'pending',
        '待处理',
        0,
        data.description || '',
        JSON.stringify(data.params || {}),
        JSON.stringify(data.sourceImages || []),
        JSON.stringify([]),
        data.previewColor || '#6366f1',
        0,
        null,
        now,
        now
      ])

      saveDatabase()
      logger.info(`Project created: "${data.title}" [${data.category || 'uncategorized'}] id=${id}`)

      const stmt = db.prepare('SELECT * FROM projects WHERE id = ?')
      stmt.bind([id])
      stmt.step()
      const created = stmt.getAsObject() as ProjectRow
      stmt.free()
      return parseProject(created)
    } catch (error) {
      logger.error('Failed to create project:', error)
      throw error
    }
  })

  ipcMain.handle('projects:update', async (_event, id: string, data: Record<string, unknown>) => {
    try {
      const db = getDb()
      
      const stmt = db.prepare('SELECT * FROM projects WHERE id = ?')
      stmt.bind([id])
      if (!stmt.step()) {
        stmt.free()
        throw new Error('Project not found')
      }
      const existing = stmt.getAsObject() as ProjectRow
      stmt.free()

      const fieldMap: Record<string, string> = {
        title: 'title',
        category: 'category',
        categoryLabel: 'category_label',
        status: 'status',
        statusLabel: 'status_label',
        imageCount: 'image_count',
        description: 'description',
        previewColor: 'preview_color',
        points: 'points',
        errorMessage: 'error_message'
      }

      const updates: string[] = []
      const values: unknown[] = []

      for (const [key, value] of Object.entries(data)) {
        if (key === 'params' || key === 'sourceImages' || key === 'outputImages') {
          const dbKey = key === 'sourceImages' ? 'source_images'
            : key === 'outputImages' ? 'output_images'
            : 'params'
          updates.push(`${dbKey} = ?`)
          values.push(JSON.stringify(value))
        } else if (fieldMap[key]) {
          updates.push(`${fieldMap[key]} = ?`)
          values.push(value)
        }
      }

      if (updates.length === 0) return parseProject(existing)

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      updates.push('updated_at = ?')
      values.push(now)
      values.push(id)

      const sql = `UPDATE projects SET ${updates.join(', ')} WHERE id = ?`
      db.run(sql, values)

      saveDatabase()
      logger.info(`Project updated: "${existing.title}" [${id}] fields=[${Object.keys(data).join(', ')}]`)

      const stmt2 = db.prepare('SELECT * FROM projects WHERE id = ?')
      stmt2.bind([id])
      stmt2.step()
      const updated = stmt2.getAsObject() as ProjectRow
      stmt2.free()
      return parseProject(updated)
    } catch (error) {
      logger.error('Failed to update project:', error)
      throw error
    }
  })

  ipcMain.handle('projects:delete', async (_event, id: string) => {
    try {
      const db = getDb()
      db.run('DELETE FROM projects WHERE id = ?', [id])
      const changes = db.getRowsModified()

      // 同步删除对应的项目文件夹（含生成图片等文件）
      const projectDir = path.join(resolveProjectsDir(), id)
      try {
        if (fs.existsSync(projectDir)) {
          fs.rmSync(projectDir, { recursive: true, force: true })
        }
      } catch (e) {
        logger.warn(`Failed to remove project folder: ${projectDir}`, e)
      }

      saveDatabase()
      logger.info(`Project deleted: id=${id}, success=${changes > 0}`)
      return { success: changes > 0 }
    } catch (error) {
      logger.error('Failed to delete project:', error)
      throw error
    }
  })

  ipcMain.handle('projects:deleteMany', async (_event, ids: string[]) => {
    try {
      const db = getDb()
      const placeholders = ids.map(() => '?').join(',')
      db.run(`DELETE FROM projects WHERE id IN (${placeholders})`, ids)
      const deletedCount = db.getRowsModified()

      // 同步删除对应项目文件夹
      const projectsDir = resolveProjectsDir()
      for (const id of ids) {
        const projectDir = path.join(projectsDir, id)
        try {
          if (fs.existsSync(projectDir)) {
            fs.rmSync(projectDir, { recursive: true, force: true })
          }
        } catch (e) {
          logger.warn(`Failed to remove project folder: ${projectDir}`, e)
        }
      }

      saveDatabase()
      logger.info(`Projects batch deleted: ${deletedCount} projects removed`)
      return { success: true, deletedCount }
    } catch (error) {
      logger.error('Failed to delete projects:', error)
      throw error
    }
  })

  ipcMain.handle('projects:getStats', async () => {
    try {
      const db = getDb()
      const stmt = db.prepare(`
        SELECT status, status_label, COUNT(*) as count
        FROM projects
        GROUP BY status
      `)
      const rows: Array<{ status: string; status_label: string; count: number }> = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as { status: string; status_label: string; count: number })
      }
      stmt.free()

      const total = rows.reduce((sum, r) => sum + r.count, 0)

      return {
        total,
        byStatus: rows.map(r => ({
          status: r.status,
          label: r.status_label,
          count: r.count
        }))
      }
    } catch (error) {
      logger.error('Failed to get project stats:', error)
      throw error
    }
  })
}
