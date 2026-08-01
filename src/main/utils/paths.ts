import { app } from 'electron'
import path from 'path'
import fs from 'fs'

export function getAppDataPath(): string {
  return app.getPath('userData')
}

export function getDataPath(): string {
  return path.join(getAppDataPath(), 'data')
}

export function getDbPath(): string {
  return path.join(getDataPath(), 'pixmart.db')
}

export function getProjectsPath(): string {
  return path.join(getAppDataPath(), 'projects')
}

export function getProjectPath(projectId: string): string {
  return path.join(getProjectsPath(), projectId)
}

export function getExportsPath(): string {
  return path.join(getAppDataPath(), 'exports')
}

export function getTempPath(): string {
  return path.join(getAppDataPath(), 'temp')
}

export function getLogsPath(): string {
  return path.join(getAppDataPath(), 'logs')
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

export function ensureAllDirs(): void {
  ensureDir(getAppDataPath())
  ensureDir(getDataPath())
  ensureDir(getProjectsPath())
  ensureDir(getTempPath())
  ensureDir(getExportsPath())
  ensureDir(getLogsPath())
}

export function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

export function getRendererUrl(): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return process.env.ELECTRON_RENDERER_URL
  }
  return `file://${path.join(__dirname, '../renderer/index.html')}`
}
