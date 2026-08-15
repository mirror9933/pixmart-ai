import { ipcMain } from 'electron'
import { getDb } from '../database'
import { logger } from '../utils/logger'
import { createProvider, type ModelConfig } from '../services/ai-provider'
import type { ChatContentPart } from '../services/ai-provider'
import { taskQueue } from '../services/task-queue'
import { checkSizeSupported } from '../services/size-capabilities'
import fs from 'fs'
import path from 'path'

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

function getActiveProvider() {
  const db = getDb()
  const stmt = db.prepare(
    "SELECT * FROM model_configs WHERE status = 'connected' ORDER BY latency ASC LIMIT 1"
  )
  if (!stmt.step()) {
    stmt.free()
    throw new Error('没有可用的AI模型配置，请先在设置中配置并测试连接')
  }
  const row = stmt.getAsObject()
  stmt.free()

  const vendor = String(row.vendor || '')
  const vendorLabel = String(row.vendor_label || '')
  const apiKey = String(row.api_key || '')
  const baseUrl = String(row.base_url || '')

  if (!vendor) {
    logger.error(`Model config ${row.id} has no vendor. Row keys: ${Object.keys(row)}. Row: ${JSON.stringify(row)}`)
    throw new Error('模型配置中缺少厂商(vendor)信息，请在设置中重新配置')
  }

  let models: string[] = []
  try {
    if (row.models && typeof row.models === 'string' && row.models !== 'undefined') {
      models = JSON.parse(row.models)
    }
  } catch {
    logger.warn(`Invalid models JSON for config ${row.id}, resetting to empty`)
  }

  const config: ModelConfig = {
    id: row.id as string,
    vendor,
    vendor_label: vendorLabel,
    api_key: apiKey,
    base_url: baseUrl,
    protocol: String((row as any).protocol || 'openai'),
    status: (row.status as string) || '',
    latency: (row.latency as number) || 0,
    tested_at: (row.tested_at as string) || null,
    models
  }

  return createProvider(config)
}

function getProviderByModel(model?: string): AIProvider {
  const db = getDb()

  // If a specific model is requested, find the config that contains it
  if (model) {
    const stmt = db.prepare("SELECT * FROM model_configs WHERE status = 'connected'")
    while (stmt.step()) {
      const row = stmt.getAsObject()
      let models: string[] = []
      try {
        if (row.models && typeof row.models === 'string' && row.models !== 'undefined') {
          models = JSON.parse(row.models)
        }
      } catch { /* ignore */ }

      if (models.includes(model)) {
        stmt.free()
        logger.info(`Provider matched by model "${model}": vendor=${row.vendor} id=${row.id}`)
        return createProviderFromRow(row, model)
      }
    }
    stmt.free()
    logger.warn(`Model "${model}" not found in any connected config, falling back to default`)
  }

  return getActiveProvider()
}

function createProviderFromRow(row: any, preferredModel?: string): AIProvider {
  const vendor = String(row.vendor || '')
  const vendorLabel = String(row.vendor_label || '')
  const apiKey = String(row.api_key || '')
  const baseUrl = String(row.base_url || '')

  let models: string[] = []
  try {
    if (row.models && typeof row.models === 'string' && row.models !== 'undefined') {
      models = JSON.parse(row.models)
    }
  } catch { /* ignore */ }

  // Put the user-selected model first so getTextModel picks it
  if (preferredModel && models.includes(preferredModel)) {
    models = [preferredModel, ...models.filter(m => m !== preferredModel)]
  }

  const config: ModelConfig = {
    id: row.id as string,
    vendor,
    vendor_label: vendorLabel,
    api_key: apiKey,
    base_url: baseUrl,
    protocol: String((row as any).protocol || 'openai'),
    status: (row.status as string) || '',
    latency: (row.latency as number) || 0,
    tested_at: (row.tested_at as string) || null,
    models
  }

  if (!vendor) {
    throw new Error('模型配置中缺少厂商(vendor)信息，请在设置中重新配置')
  }

  return createProvider(config)
}

export function registerAIHandlers(): void {
  ipcMain.handle('ai:analyzeProduct', async (_event, data: {
    projectId: string
    images: string[]
    description: string
    model?: string
    mode?: 'general' | 'replicate'
    extra?: string
  }) => {
    try {
      const provider = getProviderByModel(data.model)
      const db = getDb()

      logger.info(`Analyzing product: project=${data.projectId} images=${data.images.length} description="${data.description.slice(0, 50)}..." mode=${data.mode || 'general'}`)
      const result = await provider.analyzeProduct(data.images, data.description, {
        mode: data.mode,
        extra: data.extra
      })

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
      const s = db.prepare(`
        UPDATE projects
        SET status = 'analyzed', status_label = '已分析', description = ?, updated_at = ?
        WHERE id = ?
      `)
      s.run([result.description || data.description, now, data.projectId])
      s.free()

      logger.info(`Product analysis completed: project=${data.projectId} keywords=${result.keywords?.length || 0} plans=${result.designPlan?.length || 0}`)
      return result
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to analyze product: ${msg}`)
      throw error
    }
  })

  ipcMain.handle('ai:generateImages', async (_event, data: {
    projectId: string
    prompts: Array<{
      id: string
      prompt: string
      style?: string
      size?: string
      quality?: string
    }>
    modelConfigId?: string
    model?: string
    quality?: string
    referenceImages?: string[]
    styleImages?: string[]
    productProfile?: string
    productProfileEn?: string
    extraPrompt?: string
  }) => {
    try {
      const provider = data.model
        ? getProviderByModel(data.model)
        : getActiveProvider()
      const db = getDb()

      // Apply top-level quality to all prompts that don't have one
      const prompts = data.prompts.map(p => ({
        ...p,
        quality: p.quality || data.quality || 'standard'
      }))

      // 主体一致性约束：置于 prompt 开头并用英文书写，生图模型对英文指令和开头内容权重更高。
      // 有风格参考图时明确区分：前 N 张为风格图（样式参考），其余为产品主体图（外观必须一致）
      const styleCount = (data.styleImages || []).filter(r => r && r.startsWith('data:image/')).length
      const identityConstraint = styleCount > 0
        ? `IMPORTANT - MAINTAIN EXACT PRODUCT IDENTITY: The FIRST ${styleCount} image(s) are STYLE references - follow their colors, layout, typography, background, decorative elements and overall design style. The product subject in the image must look IDENTICAL to the product image(s) that follow (shape, structure, colors, materials, surface details, logos, packaging). You may enhance sharpness and resolution, and adjust lighting, composition and overall style, but you MUST NOT alter, replace, redesign or restyle the product itself.`
        : `IMPORTANT - MAINTAIN EXACT PRODUCT IDENTITY: The product subject in the image must look IDENTICAL to the reference product image(s) provided (shape, structure, colors, materials, surface details, logos, packaging). You may enhance sharpness and resolution, change the background and scene, and adjust lighting, composition and overall style, but you MUST NOT alter, replace, redesign or restyle the product itself.`

      const consistencyPrefix = [
        identityConstraint,
        // 优先用英文主体描述（生图模型对英文理解更准），无英文时回退中文
        (data.productProfileEn || data.productProfile) ? `\nProduct visual profile: ${data.productProfileEn || data.productProfile}` : '',
        data.extraPrompt?.trim() ? `\nUser supplementary requirements: ${data.extraPrompt.trim()}` : ''
      ].join('')

      const now = new Date().toISOString().replace('T', ' ').slice(0, 19)

      const s0 = db.prepare(`
        UPDATE projects SET status = 'processing', status_label = '生成中', updated_at = ? WHERE id = ?
      `)
      s0.run([now, data.projectId])
      s0.free()

      const win = require('electron').BrowserWindow.getAllWindows()[0]
      const taskIds: string[] = []

      logger.info(`Starting image generation: project=${data.projectId} tasks=${prompts.length}`)
      for (const item of prompts) {
        const taskId = taskQueue.addTask(
          data.projectId,
          'generate',
          async () => {
            logger.info(`Generating image: task=${item.id} prompt="${item.prompt.slice(0, 60)}..." size=${item.size || 'default'} quality=${item.quality || 'default'}`)
            const result = await provider.generateImage(consistencyPrefix + '\n' + item.prompt, {
              size: item.size,
              quality: item.quality,
              style: item.style,
              referenceImages: data.referenceImages,
              styleImages: data.styleImages
            })
            logger.info(`Image generated: task=${item.id} url=${result.url ? 'success' : 'no url'}`)
            return result
          }
        )
        taskIds.push(taskId)
      }

      // 监听本批次任务:全部进入终态后更新项目状态(completed/failed)并注销监听器,
      // 避免项目停留在"生成中",同时防止监听器随每次生成累积泄漏。
      const unsub = taskQueue.onTaskUpdate((task) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('ai:taskUpdate', task)
        }
        if (!taskIds.includes(task.id)) return
        const isTerminal = task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
        if (!isTerminal) return

        const anyActive = taskIds.some(id => {
          const t = taskQueue.getTask(id)
          return t && t.status !== 'completed' && t.status !== 'failed' && t.status !== 'cancelled'
        })
        if (anyActive) return

        try {
          const db = getDb()
          const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
          const hasSuccess = taskIds.some(id => {
            const t = taskQueue.getTask(id)
            return t && t.status === 'completed'
          })
          const failedTask = taskIds.map(id => taskQueue.getTask(id)).find(t => t && t.status === 'failed')
          if (hasSuccess) {
            const s = db.prepare(`UPDATE projects SET status = 'completed', status_label = '完成', error_message = NULL, updated_at = ? WHERE id = ?`)
            s.run([now, data.projectId])
            s.free()
          } else if (failedTask) {
            const s = db.prepare(`UPDATE projects SET status = 'failed', status_label = '失败', error_message = ?, updated_at = ? WHERE id = ?`)
            s.run([failedTask.error || '生成失败', now, data.projectId])
            s.free()
          }
          saveDatabase()
        } catch (e) {
          logger.error('Failed to update project status after tasks finished:', e)
        }
        unsub()
      })

      logger.info(`Image generation tasks submitted: project=${data.projectId} tasks=${taskIds.length}`)
      return {
        success: true,
        taskIds,
        message: `已提交 ${taskIds.length} 个生成任务`
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`Failed to generate images: ${msg}`)

      try {
        const db = getDb()
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19)
        const s = db.prepare(`
          UPDATE projects
          SET status = 'failed', status_label = '失败', error_message = ?, updated_at = ?
          WHERE id = ?
        `)
        s.run([error instanceof Error ? error.message : 'Unknown error', now, data.projectId])
        s.free()
      } catch {
        // ignore
      }

      throw error
    }
  })

  ipcMain.handle('ai:aiWrite', async (_event, data: {
    type: 'title' | 'description' | 'keywords'
    context?: string
    productInfo?: string
    style?: string
    model?: string
    images?: string[]
  }) => {
    try {
      const provider = getProviderByModel(data.model)

      logger.info(`AI writing request: type=${data.type} style="${data.style || 'default'}" images=${data.images?.length || 0}`)

      // Convert image file paths to base64 data URLs
      const imageParts: ChatContentPart[] = []
      if (data.images && data.images.length > 0) {
        logger.info(`Processing ${data.images.length} images for AI writing`)
        for (const imgPath of data.images) {
          try {
            // Support both file paths and data URLs
            if (imgPath && imgPath.startsWith('data:image/')) {
              // Already a data URL — use directly
              imageParts.push({
                type: 'image_url',
                image_url: { url: imgPath, detail: 'high' }
              })
              logger.info(`Image loaded from data URL (${imgPath.slice(0, 50)}...)`)
            } else if (imgPath && fs.existsSync(imgPath)) {
              const ext = path.extname(imgPath).toLowerCase()
              const mimeMap: Record<string, string> = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.webp': 'image/webp',
                '.gif': 'image/gif', '.bmp': 'image/bmp'
              }
              const mime = mimeMap[ext] || 'image/png'
              const buffer = fs.readFileSync(imgPath)
              const base64 = buffer.toString('base64')
              imageParts.push({
                type: 'image_url',
                image_url: { url: `data:${mime};base64,${base64}`, detail: 'high' }
              })
            }
          } catch (err) {
            logger.warn(`Failed to read image for AI writing: ${imgPath}`, err)
          }
        }
      }

      const prompts: Record<string, string> = {
        title: `请为以下产品生成15-30字的吸引眼球的标题。请仔细观察产品图片中的视觉特征。

=== 产品信息 ===
${data.productInfo || '无'}

=== 风格要求 ===
${data.style || '专业电商风格'}

=== 目标平台 ===
${data.context || '未明确'}

只输出标题文本，不要解释。`,

        description: `【重要】请先仔细观察所有产品图片，分析图片中的产品外观、材质、颜色、设计细节、包装等视觉元素，然后结合以下信息生成文案。

=== 产品信息 ===
${data.productInfo || '无'}

=== 风格要求 ===
${data.style || '专业电商风格'}

=== 目标平台 ===
${data.context || '电商平台'}

请严格按照以下 Markdown 格式输出，用图片观察到的实际细节填充（不要编造看不到的内容）：

---

**目标平台：** ${data.context || '未明确'}

**风格名称：** ${data.style || '专业电商风格'}

## 视觉风格
[根据产品图的视觉元素，用1-2句话描述整体视觉调性和氛围]

## 产品信息
**产品名称：** [根据产品信息提炼的产品全称]
**核心卖点：** [结合图片观察和产品描述，提炼最核心的卖点]

## 用户痛点
- [痛点1]
- [痛点2]
- [痛点3]
**适用人群：** [2-4类目标用户群体]

## 产品参数
材质：[从图片观察到的材质]；颜色：[从图片中识别的主色调]；功能：[核心功能]

## 关键细节
[从图片中观察到的设计亮点、材质细节、工艺特点]

## 功能清单
- [功能点1]
- [功能点2]
- [功能点3]

## 主题配色
- **主色调：** [颜色名] [#色号]
- **辅助色：** [颜色名] [#色号]
- **点缀色：** [颜色名] [#色号]

---`,

        keywords: `请根据产品图片和描述生成10个相关的搜索关键词/标签，用逗号分隔。

产品信息：${data.productInfo || ''}
目标平台：${data.context || '未明确'}

只输出关键词列表，用逗号分隔。`
      }

      const prompt = prompts[data.type]
      if (!prompt) throw new Error(`Unknown write type: ${data.type}`)

      // Build messages with images if available
      const userContent: string | ChatContentPart[] = imageParts.length > 0
        ? [...imageParts, { type: 'text', text: prompt }]
        : prompt

      const result = await provider.chat([
        {
          role: 'system',
          content: '你是一个顶级电商文案专家。当用户提供产品图片时，你必须首先仔细观察每一张图片，提取产品的材质、颜色、形状、设计细节、包装、光影等一切可见信息，再结合用户提供的产品描述和目标平台，生成真实、具体的文案。视觉细节必须来自图片观察，产品描述作为补充参考。输出严格按照指定 Markdown 格式，不编造看不到的内容。'
        },
        { role: 'user', content: userContent }
      ])

      logger.info(`AI writing completed: type=${data.type} length=${result.trim().length}`)
      return { success: true, content: result.trim() }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`AI writing failed: ${msg}`)
      throw error
    }
  })

  ipcMain.handle('ai:getTaskStatus', async (_event, taskId: string) => {
    const task = taskQueue.getTask(taskId)
    return task || null
  })

  // 生成前尺寸校验:按模型尺寸能力表判断,明确不支持时由前端弹窗提示(未知模型放行)
  ipcMain.handle('ai:checkSize', async (_event, data: { model?: string; size?: string }) => {
    try {
      if (!data?.model || !data?.size) {
        return { known: false, supported: true }
      }
      return checkSizeSupported(data.model, data.size)
    } catch (error) {
      logger.error('Failed to check size:', error)
      return { known: false, supported: true }
    }
  })
}
