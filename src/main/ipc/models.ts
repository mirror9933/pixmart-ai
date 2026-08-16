import { ipcMain, BrowserWindow } from 'electron'
import { getDb, saveDatabase } from '../database'
import { logger } from '../utils/logger'
import { v4 } from '../utils/ids'
import { createProvider } from '../services/ai-provider'

interface ModelConfigRow {
  id: string
  vendor: string
  vendor_label: string
  api_key: string
  base_url: string
  status: string
  latency: number
  tested_at: string | null
  models: string
  created_at: string
  updated_at: string
}

/** 安全解析 JSON 列 */
function parseJsonField(raw: unknown, fallback: unknown): any {
  if (typeof raw !== 'string' || !raw || raw === 'undefined') return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function parseModelConfig(row: ModelConfigRow) {
  let models: string[] = []
  try {
    if (row.models && typeof row.models === 'string' && row.models !== 'undefined') {
      models = JSON.parse(row.models)
    }
  } catch { /* ignore invalid JSON */ }

  return {
    id: row.id,
    vendor: row.vendor,
    vendorLabel: row.vendor_label,
    name: row.vendor_label,
    protocol: (row as any).protocol || 'openai',
    orgId: (row as any).org_id || '',
    headers: parseJsonField((row as any).headers, {}) as Record<string, string>,
    timeout: Number((row as any).timeout || 0),
    modelMeta: parseJsonField((row as any).model_meta, {}) as Record<string, any>,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    status: row.status,
    latency: row.latency,
    testedAt: row.tested_at,
    models,
    isActive: row.status === 'connected',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function registerModelsHandlers(): void {
  const notifyClients = () => {
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('models:changed'))
  }

  ipcMain.handle('models:getAll', async () => {
    try {
      const db = getDb()
      const stmt = db.prepare('SELECT * FROM model_configs ORDER BY created_at DESC')
      const rows: ModelConfigRow[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as ModelConfigRow)
      }
      stmt.free()
      return rows.map(parseModelConfig)
    } catch (error) {
      logger.error('Failed to get model configs:', error)
      throw error
    }
  })

  ipcMain.handle('models:create', async (_event, data: {
    vendor: string
    vendorLabel: string
    apiKey: string
    baseUrl?: string
    protocol?: string
    orgId?: string
    headers?: Record<string, string>
    timeout?: number
    modelMeta?: Record<string, unknown>
  }) => {
    try {
      const db = getDb()
      const id = v4()
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

      db.run(`
        INSERT INTO model_configs (id, vendor, vendor_label, api_key, base_url, protocol, org_id, headers, timeout, model_meta, status, latency, models, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        data.vendor,
        data.vendorLabel || data.vendor,
        data.api_key || data.apiKey || '',
        data.baseUrl || '',
        data.protocol || 'openai',
        data.orgId || '',
        JSON.stringify(data.headers || {}),
        Number(data.timeout || 0),
        JSON.stringify(data.modelMeta || {}),
        'untested',
        0,
        JSON.stringify([]),
        now,
        now
      ])

      saveDatabase()
      logger.info(`Model config created: vendor=${data.vendor} label="${data.vendorLabel}" id=${id}`)
      notifyClients()

      const stmt = db.prepare('SELECT * FROM model_configs WHERE id = ?')
      stmt.bind([id])
      stmt.step()
      const created = stmt.getAsObject() as ModelConfigRow
      stmt.free()
      return parseModelConfig(created)
    } catch (error) {
      logger.error('Failed to create model config:', error)
      throw error
    }
  })

  ipcMain.handle('models:update', async (_event, id: string, data: Record<string, unknown>) => {
    try {
      const db = getDb()
      
      const stmt = db.prepare('SELECT * FROM model_configs WHERE id = ?')
      stmt.bind([id])
      if (!stmt.step()) {
        stmt.free()
        throw new Error('Model config not found')
      }
      const existing = stmt.getAsObject() as ModelConfigRow
      stmt.free()

      const fieldMap: Record<string, string> = {
        vendor: 'vendor',
        vendorLabel: 'vendor_label',
        apiKey: 'api_key',
        baseUrl: 'base_url',
        protocol: 'protocol',
        orgId: 'org_id',
        timeout: 'timeout',
        status: 'status',
        latency: 'latency',
        testedAt: 'tested_at'
      }

      const jsonFields: Record<string, string> = {
        headers: 'headers',
        modelMeta: 'model_meta'
      }

      const updates: string[] = []
      const values: unknown[] = []

      for (const [key, value] of Object.entries(data)) {
        // 忽略 undefined 值(前端对非自定义厂商会传 protocol: undefined 等)
        if (value === undefined) continue
        if (key === 'models') {
          updates.push('models = ?')
          values.push(JSON.stringify(value))
        } else if (jsonFields[key]) {
          updates.push(`${jsonFields[key]} = ?`)
          values.push(JSON.stringify(value || {}))
        } else if (fieldMap[key]) {
          updates.push(`${fieldMap[key]} = ?`)
          values.push(value)
        }
      }

      if (updates.length === 0) return parseModelConfig(existing)

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      updates.push('updated_at = ?')
      values.push(now)
      values.push(id)

      db.run(`UPDATE model_configs SET ${updates.join(', ')} WHERE id = ?`, values)

      saveDatabase()
      logger.info(`Model config updated: vendor=${existing.vendor} [${id}] fields=[${Object.keys(data).join(', ')}]`)
      notifyClients()

      const stmt2 = db.prepare('SELECT * FROM model_configs WHERE id = ?')
      stmt2.bind([id])
      stmt2.step()
      const updated = stmt2.getAsObject() as ModelConfigRow
      stmt2.free()
      return parseModelConfig(updated)
    } catch (error) {
      logger.error('Failed to update model config:', error)
      throw error
    }
  })

  ipcMain.handle('models:delete', async (_event, id: string) => {
    try {
      const db = getDb()
      db.run('DELETE FROM model_configs WHERE id = ?', [id])
      const changes = db.getRowsModified()
      saveDatabase()
      logger.info(`Model config deleted: id=${id}, success=${changes > 0}`)
      notifyClients()
      return { success: changes > 0 }
    } catch (error) {
      logger.error('Failed to delete model config:', error)
      throw error
    }
  })

  ipcMain.handle('models:testConnection', async (_event, id: string) => {
    try {
      const db = getDb()
      const stmt = db.prepare('SELECT * FROM model_configs WHERE id = ?')
      stmt.bind([id])
      if (!stmt.step()) {
        stmt.free()
        throw new Error('Model config not found')
      }
      const row = stmt.getAsObject() as ModelConfigRow
      stmt.free()

      let testModels: string[] = []
      try {
        if (row.models && typeof row.models === 'string' && row.models !== 'undefined') {
          testModels = JSON.parse(row.models)
        }
      } catch { /* ignore */ }

      const config = {
        ...row,
        org_id: String((row as any).org_id || ''),
        headers: parseJsonField((row as any).headers, {}) as Record<string, string>,
        timeout: Number((row as any).timeout || 0),
        model_meta: parseJsonField((row as any).model_meta, {}) as Record<string, any>,
        models: testModels
      }

      logger.info(`Testing connection: vendor=${row.vendor} base_url=${row.base_url} api_key=${row.api_key ? '***' + row.api_key.slice(-4) : 'empty'}`)
      let provider
      try {
        provider = createProvider(config)
      } catch (e: any) {
        const createErr = e?.message || e?.constructor?.name || String(e)
        logger.error(`Failed to create provider: ${createErr}`)
        throw e
      }
      const result = await provider.testConnection()

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      db.run(`
        UPDATE model_configs
        SET status = ?, latency = ?, tested_at = ?, updated_at = ?
        WHERE id = ?
      `, [
        result.success ? 'connected' : 'error',
        result.latency,
        now,
        now,
        id
      ])

      saveDatabase()

      if (result.success) {
        logger.info(`Connection test passed: vendor=${row.vendor} latency=${result.latency}ms`)
      } else {
        logger.warn(`Connection test failed: vendor=${row.vendor} latency=${result.latency}ms error=${result.error || 'unknown'}`)
      }
      notifyClients()

      return {
        success: result.success,
        latency: result.latency,
        error: result.error || ''
      }
    } catch (error: any) {
      const status = error?.status || error?.code || ''
      const msg = error?.message || error?.error?.message || error?.statusText || ''
      const cause = error?.cause?.message || error?.cause?.code || ''
      const type = error?.type || error?.constructor?.name || ''
      const errMsg = msg || cause || (status ? `HTTP ${status}` : '') || (type ? `[${type}]` : '') || 'Unknown network error'
      logger.error(`Failed to test model connection: ${errMsg}`)
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      try {
        const db = getDb()
        db.run(`
          UPDATE model_configs SET status = ?, updated_at = ? WHERE id = ?
        `, ['error', now, id])
        saveDatabase()
      } catch {
        // ignore
      }
      throw error
    }
  })

  ipcMain.handle('models:fetchModels', async (_event, id: string, opts?: { persist?: boolean }) => {
    try {
      const db = getDb()
      const stmt = db.prepare('SELECT * FROM model_configs WHERE id = ?')
      stmt.bind([id])
      if (!stmt.step()) {
        stmt.free()
        throw new Error('Model config not found')
      }
      const row = stmt.getAsObject() as ModelConfigRow
      stmt.free()

      let fetchModels_list: string[] = []
      try {
        if (row.models && typeof row.models === 'string' && row.models !== 'undefined') {
          fetchModels_list = JSON.parse(row.models)
        }
      } catch { /* ignore */ }

      const config = {
        ...row,
        org_id: String((row as any).org_id || ''),
        headers: parseJsonField((row as any).headers, {}) as Record<string, string>,
        timeout: Number((row as any).timeout || 0),
        model_meta: parseJsonField((row as any).model_meta, {}) as Record<string, any>,
        models: fetchModels_list
      }

      logger.info(`Fetching models: vendor=${row.vendor} base_url=${row.base_url}`)
      const provider = createProvider(config)
      const models = await provider.fetchModels()

      // models 列保持纯 id 数组（模型元数据存 model_meta 列），仅返回给前端完整 ModelInfo 列表
      const modelIds = (models as any[]).map((m) => (typeof m === 'string' ? m : m?.id)).filter(Boolean)

      // 编辑模式(persist=false)不覆盖数据库中已保存的模型列表,最终以「保存修改」为准
      if (opts?.persist !== false) {
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
        db.run(`
          UPDATE model_configs SET models = ?, updated_at = ? WHERE id = ?
        `, [JSON.stringify(modelIds), now, id])

        saveDatabase()
        logger.info(`Models fetched: vendor=${row.vendor} count=${models.length}`)
        notifyClients()
      } else {
        logger.info(`Models fetched (no persist): vendor=${row.vendor} count=${models.length}`)
      }

      return models
    } catch (error) {
      logger.error('Failed to fetch models:', error)
      throw error
    }
  })

  ipcMain.handle('models:clearAll', async () => {
    try {
      const db = getDb()
      db.run('DELETE FROM model_configs')
      saveDatabase()
      notifyClients()
      logger.info('All model configs cleared from database')
      return { success: true }
    } catch (error) {
      logger.error('Failed to clear model configs:', error)
      throw error
    }
  })
}
