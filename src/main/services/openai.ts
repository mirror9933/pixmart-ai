import OpenAI from 'openai'
import type {
  AIProvider,
  ModelConfig,
  ProductAnalysis,
  GeneratedImage,
  GenerateImageOptions,
  AnalyzeOptions,
  ChatMessage
} from './ai-provider'
import { logger } from '../utils/logger'

const MODEL_FILTERS: Record<string, (id: string) => boolean> = {
  openai: (id) => /gpt-|dall-e-|o[13]|o[13]-/.test(id),
  google: (id) => /gemini/.test(id),
  openrouter: () => true,
  agnes: (id) => id.includes('agnes'),
  ofox: () => true,
  custom: () => true,
}

const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'dall-e-3'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  openrouter: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-flash'],
  agnes: ['agnes-2.0-flash', 'agnes-image-2.1-flash', 'agnes-image-2.0-flash'],
  ofox: ['google/gemini-3.1-pro-preview', 'google/gemini-3.1-flash-lite-image', 'openai/gpt-5.5'],
  custom: [],
}

function extractError(error: any): string {
  const status = error?.status || error?.code || ''
  const msg = error?.message || error?.error?.message || error?.statusText || ''
  const cause = error?.cause?.message || error?.cause?.code || ''
  const type = error?.type || error?.constructor?.name || ''
  return msg || cause || (status ? `HTTP ${status}` : '') || (type ? `[${type}]` : '') || 'Unknown error'
}

/** 容错解析分析结果 JSON：兼容 markdown 代码围栏与前后多余文本/截断 */
function parseAnalysisContent(content: string): ProductAnalysis {
  let text = content.trim()
  // 去掉可能的 markdown 代码围栏
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) text = fenceMatch[1].trim()
  try {
    return JSON.parse(text) as ProductAnalysis
  } catch {
    // 截断兜底：提取首个 { 到最后一个 } 之间的内容再试
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as ProductAnalysis
      } catch {}
    }
    throw new Error('Failed to parse AI response as JSON')
  }
}

export class OpenAIProvider implements AIProvider {
  private client: OpenAI
  private config: ModelConfig

  constructor(config: ModelConfig) {
    this.config = config
    this.client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url || undefined
    })
  }

  /** Ofox Gemini 原生协议端点（图像编辑/参考图生图仅在 Gemini 原生协议下可用） */
  private get geminiNativeBaseUrl(): string | null {
    if (!this.config.base_url || !this.config.base_url.toLowerCase().includes('ofox')) return null
    return 'https://api.ofox.io/gemini/v1beta'
  }

  /** Pick the first text-capable model from the configured list */
  private getTextModel(): string {
    const models = this.config.models || []
    // Prefer models matching gpt/o/claude/gemini/agnes patterns
    const textModel = models.find(m => /gpt|o[0-9]|claude|gemini|agnes.*flash/i.test(m))
      || models[0]
    if (textModel) {
      logger.info(`Using text model: ${textModel} (from config)`)
      return textModel
    }
    // Fallback
    const fallback = this.config.vendor === 'agnes' ? 'agnes-2.0-flash' : 'gpt-4o'
    logger.info(`Using fallback text model: ${fallback}`)
    return fallback
  }

  /** Pick the first image-capable model from the configured list */
  private getImageModel(): string {
    const models = this.config.models || []
    const imageModel = models.find(m => /dall-e|imagen|image|flux/i.test(m))
      || models[0]
    if (imageModel) {
      logger.info(`Using image model: ${imageModel} (from config)`)
      return imageModel
    }
    const fallback = this.config.vendor === 'agnes' ? 'agnes-image-2.1-flash' : 'dall-e-3'
    logger.info(`Using fallback image model: ${fallback}`)
    return fallback
  }

  async analyzeProduct(images: string[], description: string, options?: AnalyzeOptions): Promise<ProductAnalysis> {
    const imageContent = images.map(img => ({
      type: 'image_url' as const,
      image_url: { url: img, detail: 'high' as const }
    }))

    const isReplicate = options?.mode === 'replicate'
    const extra = options?.extra?.trim()

    // 复刻场景：第一张是参考设计图（风格），其余是产品素材图（主体）
    const systemContent = isReplicate
      ? `你是一个专业的电商风格复刻设计师。用户提供【第一张】参考设计图（爆款详情页/海报，需要分析其风格）和【其余】产品素材图（需要分析产品主体）。
任务：在不改变产品主体外观（形状、颜色、材质、结构细节、标志等）的前提下，将参考设计图的风格（色彩、排版、构图、背景、装饰元素、字体风格）应用到产品上，生成电商详情图设计方案。
请以JSON格式返回分析结果，格式如下：
{
  "title": "项目标题",
  "description": "项目描述",
  "keywords": ["关键词1", "关键词2"],
  "suggestedStyles": ["风格1", "风格2"],
  "productProfile": "产品主体外观特征描述（中文）：仅基于产品素材图（除第一张参考图外）仔细观察，详细描述产品的整体形状、结构、颜色、材质、表面纹理、标志、包装等外观特征，尽可能具体到可以被文本生图模型理解并精确还原的程度，用于后续所有生成图片保持产品主体完全一致",
  "productProfileEn": "产品主体外观特征描述（英文，用英语详细描述产品的整体形状、结构、颜色、材质、表面纹理、标志、包装等，让英文生图模型能精确还原产品主体，要求比 productProfile 更精确、更具体）",
  "colorPalette": [{"name":"主色调","hex":"#4a4a4a"},{"name":"辅助色","hex":"#2c3e6b"},{"name":"背景色","hex":"#f5f0e8"}],
  "fonts": [{"role":"主标题","font":"字体名称+字重","size":"48px"}],
  "visualLanguage": {"elements":"装饰元素描述","iconStyle":"图标风格","corners":"圆角风格","shadow":"阴影描述"},
  "designPlan": [
    {
      "id": "plan-1",
      "title": "设计标题",
      "description": "设计描述",
      "prompt": "详细的英文图片生成提示词",
      "style": "风格",
      "aspectRatio": "1:1"
    }
  ]
}

注意：productProfile 与 productProfileEn 必须完全基于产品素材图中观察到的真实外观，不要编造看不到的特征。colorPalette 需从参考设计图/整体风格中提炼 3-5 个真实配色（含色号）。designPlan 中每个方案的 prompt 用英文撰写，必须包含：对产品主体的精确描述（保持完全一致，不得改变）+ 从参考设计图提取的风格要素（色彩、排版、构图、背景、装饰）+ 用户补充要求（如有）。`
      : `你是一个专业的电商图片设计分析师。根据用户提供的产品图片和描述，分析产品特点并生成设计计划。
请以JSON格式返回分析结果，格式如下：
{
  "title": "项目标题",
  "description": "项目描述",
  "keywords": ["关键词1", "关键词2"],
  "suggestedStyles": ["风格1", "风格2"],
  "productProfile": "产品主体外观特征描述（中文）：基于图片仔细观察，详细描述产品的整体形状、结构、颜色、材质、表面纹理、标志、包装等外观特征，尽可能具体到可以被文本生图模型理解并精确还原的程度，用于后续所有生成图片保持产品主体完全一致",
  "productProfileEn": "产品主体外观特征描述（英文，用英语详细描述产品的整体形状、结构、颜色、材质、表面纹理、标志、包装等，让英文生图模型能精确还原产品主体，要求比 productProfile 更精确、更具体）",
  "colorPalette": [{"name":"主色调","hex":"#4a4a4a"},{"name":"辅助色","hex":"#2c3e6b"},{"name":"背景色","hex":"#f5f0e8"}],
  "fonts": [{"role":"主标题","font":"字体名称+字重","size":"48px"}],
  "visualLanguage": {"elements":"装饰元素描述","iconStyle":"图标风格","corners":"圆角风格","shadow":"阴影描述"},
  "designPlan": [
    {
      "id": "plan-1",
      "title": "设计标题",
      "description": "设计描述",
      "prompt": "详细的英文图片生成提示词",
      "style": "风格",
      "aspectRatio": "1:1"
    }
  ]
}

注意：productProfile 与 productProfileEn 必须完全基于图片中观察到的真实外观，不要编造看不到的特征。colorPalette 需从整体设计风格中提炼 3-5 个真实配色（含色号）。designPlan 中每个方案的 prompt 都要包含对产品主体外观的精确描述，确保生成时产品本体不变。`

    const userText = isReplicate
      ? `第一张图片是参考设计图（分析其风格：色彩、排版、构图、背景、装饰元素），其余图片是产品素材图（分析产品主体外观）。\n产品描述：${description || '无'}\n${extra ? `用户补充要求：${extra}` : ''}\n\n请生成电商详情图复刻设计方案，至少包含4个不同的设计方案。`
      : `产品描述：${description || '无'}${extra ? `\n用户补充要求：${extra}` : ''}\n\n请分析这些产品图片并生成电商图片设计计划，至少包含4个不同的设计方案。`

    const response = await this.client.chat.completions.create({
      model: this.getTextModel(),
      messages: [
        {
          role: 'system',
          content: systemContent
        },
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text' as const,
              text: userText
            }
          ]
        }
      ],
      max_tokens: 8000,
      response_format: { type: 'json_object' }
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI returned empty response')
    }

    return parseAnalysisContent(content)
  }

  async generateImage(prompt: string, options?: GenerateImageOptions): Promise<GeneratedImage> {
    const requestedSize = this.mapSize(options?.size || '1024x1024')
    // Map quality labels to API values: 'low' / 'medium' / 'high' / 'auto'
    const qualityMap: Record<string, string> = {
      'standard': 'low',
      'hd': 'medium',
      '2k': 'high',
      '4k': 'high'
    }
    const quality = qualityMap[options?.quality || ''] || 'medium'

    // 风格参考图在前，产品主体图在后
    const refs = [
      ...(options?.styleImages || []),
      ...(options?.referenceImages || [])
    ].filter(r => r && r.startsWith('data:image/'))
    const multimodalPrompt = [
      ...refs.map(url => ({
        type: 'image_url' as const,
        image_url: { url, detail: 'high' as const }
      })),
      { type: 'text' as const, text: prompt }
    ]

    let lastError = ''
    // Agnes 专用格式：参考图在 extra_body.image，response_format 必须在 extra_body 内
    const isAgnes = this.config.vendor === 'agnes' || /agnes-image/i.test(this.getImageModel())
    // Ofox：参考图字段必须是 input_images（image/images 等会被静默忽略）；output_format 而非 response_format
    const isOfox = !!this.geminiNativeBaseUrl
    const isQwenImage = /qwen-image|qwen.*image/i.test(this.getImageModel())
    const isGptImage = /gpt-image/i.test(this.getImageModel())
    // mode: 'array' = gpt-image-1 风格（prompt 数组）；'image' = Google/Ofox 风格（prompt 字符串 + image 参考图参数）
    //       'agnes' = Agnes 风格（prompt 字符串 + extra_body.image 参考图 + extra_body.response_format）
    //       'ofox' = Ofox 风格（prompt 字符串 + input_images 参考图 + output_format）；'text' = 纯文本
    // useQuality / useResponseFormat：部分中转（如 litellm/agnes）不支持 quality / response_format 参数，需逐级去掉重试
    const attempt = async (
      size: string,
      mode: 'array' | 'image' | 'text' | 'agnes' | 'ofox',
      useQuality: boolean,
      useResponseFormat = true
    ): Promise<GeneratedImage | null> => {
      try {
        const body: Record<string, unknown> = {
          model: this.getImageModel()
        }
        if (mode === 'agnes') {
          // Agnes：size 用档位 + ratio，response_format 放 extra_body 内
          body.size = '1K'
          body.ratio = this.inferRatio(size)
          body.prompt = prompt
          body.extra_body = {
            ...(refs.length > 0 ? { image: refs } : {}),
            ...(useResponseFormat ? { response_format: 'url' } : {})
          }
        } else if (mode === 'ofox') {
          // Ofox：参考图用 input_images，输出用 output_format（b64_json 响应）
          body.prompt = prompt
          body.size = size
          if (useQuality) body.quality = quality
          body.output_format = 'png'
          if (refs.length > 0) body.input_images = refs
        } else {
          body.size = size
          if (useQuality) body.quality = quality
          if (useResponseFormat) body.response_format = 'url'
          if (mode === 'array') {
            body.prompt = multimodalPrompt
          } else if (mode === 'image') {
            body.prompt = prompt
            body.image = refs
          } else {
            body.prompt = prompt
          }
        }
        const response = await this.client.images.generate(body as any)
        const image = response.data[0]
        if (!image) return null
        const url = image.url || (image.b64_json
          ? `data:image/png;base64,${image.b64_json}`
          : '')
        return {
          url,
          revisedPrompt: image.revised_prompt
        }
      } catch (error) {
        lastError = extractError(error)
        return null
      }
    }

    // Gemini 原生协议优先（Ofox）：图像编辑/参考图生图仅在原生协议下可用。
    // 直接把风格参考图与产品主体图作为 inlineData 输入，确保主体不被改变。
    if (refs.length > 0 && this.geminiNativeBaseUrl) {
      const gem = await this.generateWithGeminiNative(prompt, refs)
      if (gem) {
        logger.info('Gemini native image generation succeeded with reference images (subject preserved)')
        return gem
      }
      logger.warn('Gemini native multimodal failed, falling back to OpenAI-compatible attempts')
    }

    // 多模态：把风格参考图/产品主体图作为图像输入，保持主体一致。
    // 不同中转支持不同格式：gpt-image-1 的 prompt 数组 / Google 兼容的 image 参数 / Agnes 的 extra_body.image / Ofox 的 input_images。
    // 逐级降级：尺寸 → 去除 quality → 去除 response_format → 纯文本
    if (refs.length > 0) {
      // 1) Agnes 专用格式（extra_body.image），其他中转走通用链
      if (isAgnes) {
        logger.warn('Agnes image-to-image detected, using extra_body.image format')
        const a0 = await attempt(requestedSize, 'agnes', false)
        if (a0) return a0
        logger.warn(`Agnes extra_body.image failed, retrying without response_format: ${lastError}`)
        const a0b = await attempt('1024x1024', 'agnes', false, false)
        if (a0b) return a0b
        logger.warn(`Agnes multimodal failed, falling back to generic attempts: ${lastError}`)
      }
      // 2) Ofox 专用（Gemini 图像模型已走原生协议）：Qwen 用 input_images，gpt-image 用 edits 端点
      if (isOfox) {
        if (isQwenImage) {
          logger.warn('Ofox qwen-image detected, using input_images reference format')
          const of1 = await attempt(requestedSize, 'ofox', true)
          if (of1) return of1
          logger.warn(`Ofox input_images failed, retrying without quality: ${lastError}`)
          const of2 = await attempt('1024x1024', 'ofox', false)
          if (of2) return of2
        }
        if (isGptImage) {
          logger.warn('Ofox gpt-image detected, using /images/edits endpoint')
          const ed = await this.editWithOpenAIFile(prompt, refs)
          if (ed) return ed
          logger.warn(`Ofox gpt-image edits failed, falling back: ${lastError}`)
        }
      }
      // 3) prompt 数组 + 用户尺寸（gpt-image-1 风格）
      const a = await attempt(requestedSize, 'array', true)
      if (a) return a
      // 4) prompt 数组 + 方形尺寸
      if (requestedSize !== '1024x1024') {
        logger.warn(`Array-prompt multimodal failed with size ${requestedSize}, retrying with 1024x1024: ${lastError}`)
        const b = await attempt('1024x1024', 'array', true)
        if (b) return b
      }
      // 5) image 参数格式（Google/Ofox 兼容：prompt 为字符串，参考图走 image 参数）
      logger.warn(`Array-prompt multimodal rejected, retrying with image param format: ${lastError}`)
      const c = await attempt(requestedSize, 'image', true)
      if (c) return c
      // 6) image 参数 + 方形尺寸
      if (requestedSize !== '1024x1024') {
        logger.warn(`Image-param multimodal failed with size ${requestedSize}, retrying with 1024x1024: ${lastError}`)
        const d = await attempt('1024x1024', 'image', true)
        if (d) return d
      }
      // 7) image 参数 + 去除 quality
      logger.warn(`Image-param multimodal failed, retrying without quality param: ${lastError}`)
      const e = await attempt('1024x1024', 'image', false)
      if (e) return e
      // 8) image 参数 + 去除 quality + 去除 response_format（部分中转不支持该参数）
      logger.warn(`Image-param multimodal failed, retrying without quality & response_format params: ${lastError}`)
      const e2 = await attempt('1024x1024', 'image', false, false)
      if (e2) return e2
      logger.warn(`Multimodal image generation not supported, falling back to text-only prompt: ${lastError}`)
    }
    const textMode = isAgnes ? 'agnes' : isOfox ? 'ofox' : 'text'
    // 9) 纯文本 + 用户尺寸
    const f = await attempt(requestedSize, textMode, true)
    if (f) return f
    // 10) 尺寸降级：部分模型（如 gemini image）仅支持方形尺寸
    if (requestedSize !== '1024x1024') {
      logger.warn(`Image generation failed with size ${requestedSize}, retrying with 1024x1024: ${lastError}`)
      const g = await attempt('1024x1024', textMode, true)
      if (g) return g
    }
    // 11) 纯文本 + 方形 + 无 quality
    const h = await attempt('1024x1024', textMode, false)
    if (h) return h
    // 12) 纯文本 + 方形 + 无 quality + 无 response_format 兜底
    logger.warn(`Text-only generation failed, retrying without quality & response_format params: ${lastError}`)
    const h2 = await attempt('1024x1024', textMode, false, false)
    if (h2) return h2
    throw new Error(`图片生成失败: ${lastError || '未知错误'}`)
  }

  /** 根据尺寸推断宽高比（用于 Agnes 档位式 size 的 ratio 参数） */
  private inferRatio(size: string): string {
    const m = size.match(/^(\d+)x(\d+)$/)
    if (!m) return '1:1'
    const w = parseInt(m[1], 10)
    const h = parseInt(m[2], 10)
    const r = w / h
    if (r > 1.6) return '16:9'
    if (r > 1.3) return '3:2'
    if (r > 1.1) return '4:3'
    if (r < 0.62) return '9:16'
    if (r < 0.75) return '3:4'
    if (r < 0.9) return '2:3'
    return '1:1'
  }

  /** Ofox gpt-image 系列图生图：/v1/images/edits（multipart 上传文件，仅支持 OpenAI 图像模型） */
  private async editWithOpenAIFile(prompt: string, refs: string[]): Promise<GeneratedImage | null> {
    // 取最后一张参考图（产品主体图）作为编辑对象
    const target = [...refs].reverse().find(r => r.startsWith('data:image/'))
    if (!target) return null
    const m = target.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/)
    if (!m) return null
    try {
      const { toFile } = await import('openai')
      const buf = Buffer.from(m[2], 'base64')
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
      const resp = await this.client.images.edit({
        model: this.getImageModel(),
        image: await toFile(buf, `ref.${ext}`),
        prompt,
        size: 'auto',
        quality: 'low' as any
      })
      const image = resp.data[0]
      if (!image) return null
      const url = image.url || (image.b64_json
        ? `data:image/png;base64,${image.b64_json}`
        : '')
      return url ? { url } : null
    } catch (error) {
      logger.warn(`Ofox gpt-image edits exception: ${extractError(error)}`)
      return null
    }
  }

  /** 通过 Gemini 原生协议（Ofox）生成/编辑图片：参考图以 inlineData 输入，保持产品主体一致 */
  private async generateWithGeminiNative(prompt: string, refs: string[]): Promise<GeneratedImage | null> {
    const base = this.geminiNativeBaseUrl
    if (!base) return null
    try {
      const parts: unknown[] = [{ text: prompt }]
      for (const r of refs) {
        const m = r.match(/^data:([^;]+);base64,(.+)$/)
        if (!m) continue
        parts.push({ inlineData: { mimeType: m[1], data: m[2] } })
      }
      if (parts.length <= 1) return null
      const response = await fetch(`${base}/models/${encodeURIComponent(this.getImageModel())}:generateContent`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.config.api_key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contents: [{ parts }] })
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        const err = json?.error?.message || json?.error || `HTTP ${response.status}`
        logger.warn(`Gemini native error: ${err}`)
        return null
      }
      const candidates = json?.candidates || []
      const outParts = candidates[0]?.content?.parts || []
      const imagePart = outParts.find((p: any) => p.inlineData && p.inlineData.data)
      if (!imagePart) {
        logger.warn('Gemini native error: no image returned from endpoint')
        return null
      }
      return {
        url: `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`
      }
    } catch (error) {
      logger.warn(`Gemini native exception: ${extractError(error)}`)
      return null
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.getTextModel(),
      messages: messages.map(m => {
        // system messages always use string content
        if (m.role === 'system') {
          return { role: m.role, content: typeof m.content === 'string' ? m.content : '' }
        }
        // user/assistant may have multimodal content
        if (Array.isArray(m.content)) {
          return {
            role: m.role,
            content: m.content.map(part => {
              if (part.type === 'image_url' && part.image_url) {
                return {
                  type: 'image_url' as const,
                  image_url: {
                    url: part.image_url.url,
                    detail: (part.image_url.detail || 'high') as 'high' | 'low' | 'auto'
                  }
                }
              }
              return { type: 'text' as const, text: part.text || '' }
            })
          }
        }
        return { role: m.role, content: m.content as string }
      }),
      max_tokens: 4000
    })

    return response.choices[0]?.message?.content || ''
  }

  async testConnection(): Promise<{ success: boolean; latency: number }> {
    const start = Date.now()
    try {
      await this.client.models.list()
      return { success: true, latency: Date.now() - start }
    } catch (error: any) {
      logger.error(`Connection test failed (${this.config.vendor}): ${extractError(error)}`)
      return { success: false, latency: Date.now() - start }
    }
  }

  async fetchModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list()
      const filter = MODEL_FILTERS[this.config.vendor] || MODEL_FILTERS.custom
      const models = response.data
        .map(m => m.id)
        .filter(filter)
        .sort()
      return models
    } catch (error) {
      logger.error(`Failed to fetch models (${this.config.vendor}): ${extractError(error)}`)
      return FALLBACK_MODELS[this.config.vendor] || []
    }
  }

  private mapSize(size: string): '1024x1024' | '1792x1024' | '1024x1792' {
    // Extract ratio in case value includes pixel suffix (e.g. "1:1_1200x1200")
    const ratio = size.includes('_') ? size.split('_')[0] : size
    // Portrait sizes → 1024x1792
    if (ratio === '3:4' || ratio === '2:3' || ratio === '4:5' || ratio === '9:16' || size.includes('1024x1792')) return '1024x1792'
    // Landscape sizes → 1792x1024
    if (ratio === '4:3' || ratio === '3:2' || ratio === '5:4' || ratio === '16:9' || ratio === '21:10' || ratio === '21:9' || size.includes('1792x1024')) return '1792x1024'
    return '1024x1024'
  }
}
