import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import fs from 'fs'
import path from 'path'
import { getDbPath } from '../utils/paths'
import { logger } from '../utils/logger'
import { runMigrations } from './migrations'

let db: SqlJsDatabase | null = null
let dbPath: string = ''

export function getDb(): SqlJsDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export async function initDatabase(): Promise<SqlJsDatabase> {
  if (db) return db

  const SQL = await initSqlJs()
  dbPath = getDbPath()

  logger.info(`Initializing database at: ${dbPath}`)

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  runMigrations(db)
  saveDatabase()

  logger.info('Database initialized successfully')
  return db
}

export function saveDatabase(): void {
  if (!db || !dbPath) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const tmpPath = dbPath + '.tmp'
    fs.writeFileSync(tmpPath, buffer)
    try {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath)
      }
      fs.renameSync(tmpPath, dbPath)
    } catch {
      fs.copyFileSync(tmpPath, dbPath)
      try { fs.unlinkSync(tmpPath) } catch {}
    }
  } catch (err) {
    logger.error('Failed to save database:', err)
  }
}

export function closeDatabase(): void {
  if (db) {
    saveDatabase()
    db.close()
    db = null
    logger.info('Database closed')
  }
}
