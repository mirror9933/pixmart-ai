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
  }) => {
    try {
      const db = getDb()
      const id = v4()
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

      db.run(`
        INSERT INTO model_configs (id, vendor, vendor_label, api_key, base_url, protocol, status, latency, models, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        data.vendor,
        data.vendorLabel || data.vendor,
        data.api_key || data.apiKey || '',
        data.baseUrl || '',
        data.protocol || 'openai',
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
        status: 'status',
        latency: 'latency',
        testedAt: 'tested_at'
      }

      const updates: string[] = []
      const values: unknown[] = []

      for (const [key, value] of Object.entries(data)) {
        if (key === 'models') {
          updates.push('models = ?')
          values.push(JSON.stringify(value))
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
        logger.warn(`Connection test failed: vendor=${row.vendor} latency=${result.latency}ms`)
      }
      notifyClients()

      return {
        success: result.success,
        latency: result.latency
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

  ipcMain.handle('models:fetchModels', async (_event, id: string) => {
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
        models: fetchModels_list
      }

      logger.info(`Fetching models: vendor=${row.vendor} base_url=${row.base_url}`)
      const provider = createProvider(config)
      const models = await provider.fetchModels()

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      db.run(`
        UPDATE model_configs SET models = ?, updated_at = ? WHERE id = ?
      `, [JSON.stringify(models), now, id])

      saveDatabase()
      logger.info(`Models fetched: vendor=${row.vendor} count=${models.length}`)
      notifyClients()

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
