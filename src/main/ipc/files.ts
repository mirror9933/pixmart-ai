import { ipcMain, dialog, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { logger } from '../utils/logger'
import { getProjectsPath, getProjectPath, getExportsPath, ensureDir } from '../utils/paths'
import { getDb, saveDatabase } from '../database'
import { getPath } from './paths'
import { v4 } from '../utils/ids'

export function clearTempState(): boolean {
  try {
    const file = path.join(getPath('temp'), 'ui-state.json')
    if (fs.existsSync(file)) fs.unlinkSync(file)
    return true
  } catch {
    return false
  }
}

function getTempStateFile(): string {
  return path.join(getPath('temp'), 'ui-state.json')
}

function readTempState(): Record<string, unknown> {
  try {
    const file = getTempStateFile()
    if (!fs.existsSync(file)) return {}
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return {}
  }
}

export function registerFilesHandlers(): void {
  ipcMain.handle('files:selectImages', async (event) => {
    try {
      const win = require('electron').BrowserWindow.fromWebContents(event.sender)
      if (!win) throw new Error('No window found')

      const result = await dialog.showOpenDialog(win, {
        title: '选择产品图片',
        filters: [
          { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }
        ],
        properties: ['openFile', 'multiSelections']
      })

      if (result.canceled) return []

      logger.info(`User selected ${result.filePaths.length} image(s)`)
      return result.filePaths.map(fp => ({
        path: fp,
        name: path.basename(fp),
        size: fs.statSync(fp).size
      }))
    } catch (error) {
      logger.error('Failed to select images:', error)
      throw error
    }
  })

  ipcMain.handle('files:saveImage', async (_event, projectId: string, sourcePath: string) => {
    try {
      const projectDir = getProjectPath(projectId)
      ensureDir(projectDir)

      const imagesDir = path.join(projectDir, 'images')
      ensureDir(imagesDir)

      const ext = path.extname(sourcePath)
      const filename = `${v4()}${ext}`
      const destPath = path.join(imagesDir, filename)

      fs.copyFileSync(sourcePath, destPath)
      logger.info(`Image saved: ${path.basename(sourcePath)} -> ${filename} (project=${projectId})`)

      return {
        filename,
        path: destPath,
        relativePath: `images/${filename}`
      }
    } catch (error) {
      logger.error('Failed to save image:', error)
      throw error
    }
  })

  ipcMain.handle('files:saveImageFromDataUrl', async (_event, projectId: string, dataUrl: string) => {
    try {
      const projectDir = getProjectPath(projectId)
      ensureDir(projectDir)

      const imagesDir = path.join(projectDir, 'images')
      ensureDir(imagesDir)

      // 兼容三种来源：base64 data URL、http(s) 远程图片、原始 buffer 字符串
      let buffer: Buffer
      if (dataUrl.startsWith('data:image/')) {
        const matches = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
        buffer = matches ? Buffer.from(matches[1], 'base64') : Buffer.from(dataUrl)
      } else if (/^https?:\/\//.test(dataUrl)) {
        const resp = await fetch(dataUrl)
        if (!resp.ok) throw new Error(`Failed to download image: HTTP ${resp.status}`)
        buffer = Buffer.from(await resp.arrayBuffer())
      } else {
        buffer = Buffer.from(dataUrl)
      }

      // 按文件内容识别真实格式（部分中转返回的 b64/URL 是 JPEG 而非 PNG）
      const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
      const isJpeg = buffer.length > 2 && buffer[0] === 0xFF && buffer[1] === 0xD8
      const ext = isPng ? '.png' : isJpeg ? '.jpg' : '.png'
      const filename = `${v4()}${ext}`
      const destPath = path.join(imagesDir, filename)

      fs.writeFileSync(destPath, buffer)
      logger.info(`Image saved from data URL: ${filename} (project=${projectId}, ${buffer.length} bytes)`)

      // Update project record
      const db = getDb()
      // 注意:必须用 bind + step + getAsObject 读取。sql.js 的 Statement.get() 不接受查询参数、
      // 也不会自动 step,直接调用会返回空数组,导致第二次保存时读不到已有图片列表而被覆盖,
      // 项目记录里只剩最后保存的一张图。
      const stmt = db.prepare('SELECT output_images, status FROM projects WHERE id = ?')
      stmt.bind([projectId])
      if (!stmt.step()) {
        stmt.free()
        throw new Error(`Project not found: ${projectId}`)
      }
      const projectRow = stmt.getAsObject() as { output_images: string; status: string }
      stmt.free()

      const existingImages: string[] = (() => {
        try {
          const parsed = JSON.parse(projectRow.output_images)
          return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
        } catch {
          return []
        }
      })()
      existingImages.push(`images/${filename}`)
      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      // 已保存产物即视为完成(生成任务的终态由任务队列负责更新状态,此处兜底,
      // 避免项目因停留在 processing 而永远显示"生成中")
      db.run(`
        UPDATE projects
        SET output_images = ?, image_count = ?, status = 'completed', status_label = '完成', error_message = NULL, updated_at = ?
        WHERE id = ?
      `, [JSON.stringify(existingImages), existingImages.length, now, projectId])
      saveDatabase()

      return {
        filename,
        path: destPath,
        relativePath: `images/${filename}`
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to save image from data URL: ${msg}`)
      throw error
    }
  })

  ipcMain.handle('files:saveToExports', async (_event, dataUrl: string) => {
    try {
      // Resolve actual exports path from DB settings or default
      const exportsPath = (() => {
        try {
          const db = getDb()
          const stmt = db.prepare("SELECT value FROM settings WHERE key = ?")
          stmt.bind(['path_exports'])
          if (stmt.step()) {
            const row = stmt.getAsObject() as { value: string }
            stmt.free()
            if (row.value) return row.value
          }
          stmt.free()
        } catch {}
        return getExportsPath()
      })()

      ensureDir(exportsPath)

      // 兼容 base64 data URL 与 http(s) 远程图片
      let buffer: Buffer
      if (dataUrl.startsWith('data:image/')) {
        const matches = dataUrl.match(/^data:image\/\w+;base64,(.+)$/)
        buffer = matches ? Buffer.from(matches[1], 'base64') : Buffer.from(dataUrl)
      } else if (/^https?:\/\//.test(dataUrl)) {
        const resp = await fetch(dataUrl)
        if (!resp.ok) throw new Error(`Failed to download image: HTTP ${resp.status}`)
        buffer = Buffer.from(await resp.arrayBuffer())
      } else {
        buffer = Buffer.from(dataUrl)
      }
      const isPng = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47
      const isJpeg = buffer.length > 2 && buffer[0] === 0xFF && buffer[1] === 0xD8
      const ext = isPng ? '.png' : isJpeg ? '.jpg' : '.png'
      const filename = `generated-${v4()}${ext}`
      const destPath = path.join(exportsPath, filename)

      fs.writeFileSync(destPath, buffer)
      logger.info(`Image exported to: ${destPath}`)

      return { filename, path: destPath }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to export image: ${msg}`)
      throw error
    }
  })

  ipcMain.handle('files:getImagePath', async (_event, projectId: string, filename: string) => {
    try {
      const projectDir = getProjectPath(projectId)
      const imagePath = path.join(projectDir, filename)

      if (fs.existsSync(imagePath)) {
        return imagePath
      }

      const imagesPath = path.join(projectDir, 'images', filename)
      if (fs.existsSync(imagesPath)) {
        return imagesPath
      }

      return null
    } catch (error) {
      logger.error('Failed to get image path:', error)
      return null
    }
  })

  // Temporary UI state (saved to configured temp path, auto-deleted on app exit)
  ipcMain.handle('files:saveTempState', async (_event, key: string, data: unknown) => {
    try {
      const tempDir = getPath('temp')
      ensureDir(tempDir)
      const state = readTempState()
      state[key] = data
      fs.writeFileSync(getTempStateFile(), JSON.stringify(state), 'utf-8')
      logger.info(`Temp UI state saved: ${key}`)
      return true
    } catch (error) {
      logger.error('Failed to save temp state:', error)
      return false
    }
  })

  ipcMain.handle('files:loadTempState', async (_event, key: string) => {
    try {
      return readTempState()[key] ?? null
    } catch (error) {
      logger.error('Failed to load temp state:', error)
      return null
    }
  })

  ipcMain.handle('files:clearTempState', async () => clearTempState())

  ipcMain.handle('files:getImageDataUrl', async (_event, projectId: string, relativePath: string) => {
    try {
      // Resolve actual project path from DB settings or default
      const projectsDir = (() => {
        try {
          const db = getDb()
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
      })()
      const projectDir = path.join(projectsDir, projectId)
      // Try candidates based on the given relative path
      const candidates = [
        path.join(projectDir, relativePath),
        path.join(projectDir, 'images', path.basename(relativePath)),
        ...(relativePath.startsWith('images/') ? [path.join(projectDir, relativePath)] : [])
      ]
      for (const imagePath of candidates) {
        if (fs.existsSync(imagePath)) {
          const buffer = fs.readFileSync(imagePath)
          const ext = path.extname(imagePath).toLowerCase()
          const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png'
          return `data:${mime};base64,${buffer.toString('base64')}`
        }
      }
      // Fallback: scan the project images folder for any image
      const imagesDir = path.join(projectDir, 'images')
      if (fs.existsSync(imagesDir)) {
        for (const entry of fs.readdirSync(imagesDir)) {
          const ext = path.extname(entry).toLowerCase()
          if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            const imagePath = path.join(imagesDir, entry)
            const buffer = fs.readFileSync(imagePath)
            const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp'
            return `data:${mime};base64,${buffer.toString('base64')}`
          }
        }
      }
      // Also try files directly in project root
      if (fs.existsSync(projectDir)) {
        for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue
          const ext = path.extname(entry.name).toLowerCase()
          if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            const imagePath = path.join(projectDir, entry.name)
            const buffer = fs.readFileSync(imagePath)
            const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp'
            return `data:${mime};base64,${buffer.toString('base64')}`
          }
        }
      }
      return null
    } catch {
      return null
    }
  })

  ipcMain.handle('files:openPath', async (_event, targetPath: string) => {
    try {
      const stat = fs.statSync(targetPath)
      if (stat.isDirectory()) {
        shell.openPath(targetPath)
        logger.info(`Opened directory: ${targetPath}`)
      } else {
        shell.showItemInFolder(targetPath)
        logger.info(`Showed file in folder: ${targetPath}`)
      }
      return { success: true }
    } catch (error) {
      logger.error('Failed to open path:', error)
      throw error
    }
  })

  ipcMain.handle('files:selectDirectory', async (event) => {
    try {
      const win = require('electron').BrowserWindow.fromWebContents(event.sender)
      if (!win) throw new Error('No window found')

      const result = await dialog.showOpenDialog(win, {
        title: '选择目录',
        properties: ['openDirectory']
      })

      if (result.canceled) return null
      return result.filePaths[0]
    } catch (error) {
      logger.error('Failed to select directory:', error)
      throw error
    }
  })

  ipcMain.handle('files:exportImages', async (_event, data: {
    projectId: string
    imageNames: string[]
    exportDir?: string
  }) => {
    try {
      const { projectId, imageNames, exportDir } = data
      const projectDir = getProjectPath(projectId)
      const targetDir = exportDir || path.join(getExportsPath(), projectId)
      ensureDir(targetDir)

      const exported: string[] = []

      for (const name of imageNames) {
        let sourcePath = path.join(projectDir, name)
        if (!fs.existsSync(sourcePath)) {
          sourcePath = path.join(projectDir, 'images', name)
        }

        if (fs.existsSync(sourcePath)) {
          const destPath = path.join(targetDir, name)
          fs.copyFileSync(sourcePath, destPath)
          exported.push(destPath)
        } else {
          logger.warn(`Image not found for export: ${name}`)
        }
      }

      logger.info(`Exported ${exported.length}/${imageNames.length} images from project ${projectId} to ${targetDir}`)

      return {
        success: true,
        exportDir: targetDir,
        exportedCount: exported.length,
        exportedPaths: exported
      }
    } catch (error) {
      logger.error('Failed to export images:', error)
      throw error
    }
  })

  ipcMain.handle('files:readAsDataUrl', async (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        logger.warn(`File not found for dataUrl: ${filePath}`)
        return null
      }
      const ext = path.extname(filePath).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png', '.webp': 'image/webp',
        '.gif': 'image/gif', '.bmp': 'image/bmp'
      }
      const mime = mimeMap[ext] || 'image/png'
      const buffer = fs.readFileSync(filePath)
      const base64 = buffer.toString('base64')
      return `data:${mime};base64,${base64}`
    } catch (error) {
      logger.error('Failed to read file as dataUrl:', error)
      return null
    }
  })
}
