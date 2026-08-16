import OpenAI from 'openai'
import { nativeImage } from 'electron'
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
import { getSeedreamProfile, seedreamTierPixel } from './size-capabilities'

const MODEL_FILTERS: Record<string, (id: string) => boolean> = {
  openai: (id) => /gpt-|dall-e-|o[13]|o[13]-/.test(id),
  google: (id) => /gemini/.test(id),
  openrouter: () => true,
  agnes: (id) => id.includes('agnes'),
  ofox: () => true,
  aihubmix: () => true,
  siliconflow: () => true,
  volcengine: (id) => /doubao|seed|glm|deepseek|kimi|moonshot/i.test(id),
  bailian: (id) => /qwen|wanx|wan|deepseek|kimi|glm|minimax|z-image|zimage|kling|vidu/i.test(id),
  mimo: (id) => /mimo/i.test(id),
  kimi: (id) => /kimi|moonshot/i.test(id),
  minimax: (id) => /minimax|image-01|music|speech/i.test(id),
  custom: () => true,
}

const FALLBACK_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'dall-e-3'],
  google: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  openrouter: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.5-flash'],
  agnes: ['agnes-2.0-flash', 'agnes-image-2.1-flash', 'agnes-image-2.0-flash'],
  ofox: ['google/gemini-3.1-pro-preview', 'google/gemini-3.1-flash-lite-image', 'openai/gpt-5.5'],
  // AIHubMix 聚合网关:模型名直接复用各厂商原始 id(见官方图片生成文档),auto = 智能路由
  aihubmix: ['auto', 'gpt-4o-mini', 'gpt-image-1.5', 'gpt-image-1-mini', 'dall-e-3', 'qwen-image', 'wan2.7-image'],
  // SiliconFlow:模型名为「厂商/模型」格式(官方文档示例)
  siliconflow: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen-Image', 'Kwai-Kolors/Kolors'],
  // 火山方舟:模型 ID 形如 doubao-seedream-5-0-pro-260628(官方文档模型列表)
  volcengine: ['doubao-seed-2-1-pro-260628', 'doubao-seed-1-6-251015', 'doubao-seedream-5-0-pro-260628', 'doubao-seedream-4-5-251128'],
  // 阿里云百炼:千问/万相系列(官方文档模型列表)
  bailian: ['qwen-plus', 'qwen-max', 'qwen-vl-max', 'qwen-image-3.0-pro', 'qwen-image-2.0', 'wan2.7-image-pro'],
  // 小米 MiMo:官方文档模型列表(mimo-v2.5 支持图片理解,mimo-v2.5-pro 纯文本)
  mimo: ['mimo-v2.5', 'mimo-v2.5-pro'],
  // Kimi(月之暗面):官方模型列表(kimi-k3 视觉理解 1M 上下文)
  kimi: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6'],
  // MiniMax(稀宇科技):官方模型列表(API 总览文档;MiniMax-M3 多模态 1M 上下文,image-01 生图)
  minimax: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed', 'MiniMax-M2', 'image-01', 'image-01-live'],
  custom: [],
}

function extractError(error: any): string {
  const status = error?.status || error?.code || ''
  const msg = error?.message || error?.error?.message || error?.statusText || ''
  const cause = error?.cause?.message || error?.cause?.code || ''
  const type = error?.type || error?.constructor?.name || ''
  return msg || cause || (status ? `HTTP ${status}` : '') || (type ? `[${type}]` : '') || 'Unknown error'
}

/** 判断错误是否与图片尺寸(不支持)相关 */
function isSizeRelatedError(msg: string): boolean {
  return /(invalid|unsupported|not (supported|allowed|available)|must be one of|only support|does not support)/i.test(msg)
    && /(size|dimension|resolution|ratio)/i.test(msg)
}

/** 容错解析分析结果 JSON：兼容 markdown 代码围栏与前后多余文本/截断 */
function parseAnalysisContent(content: string): ProductAnalysis {
  let text = content.trim()
  // 剥离思考内容标签(MiniMax/DeepSeek 等思考模型可能返回 <think>...</think> 包裹,思考内容含花括号会干扰 JSON 提取)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, ' ').trim()
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
  /** MiniMax 图片生成最近一次错误(供上层透传) */
  private minimaxLastError = ''


  constructor(config: ModelConfig) {
    this.config = config
    this.client = new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url || undefined,
      // 自定义请求头 + 组织 ID + 请求超时
      defaultHeaders: (config.headers && Object.keys(config.headers).length > 0) ? config.headers : undefined,
      organization: config.org_id || undefined,
      timeout: config.timeout && config.timeout > 0 ? config.timeout * 1000 : undefined
    })
  }

  /** 模型能力标注:auto 时返回 null(走自动识别),否则返回标注值 */
  private metaCapability(model: string): 'text' | 'image' | 'vision' | null {
    const meta = this.config.model_meta?.[model]
    if (!meta || !meta.capability || meta.capability === 'auto') return null
    return meta.capability
  }

  /** Pick the first text-capable model from the configured list */
  private getTextModel(): string {
    const models = this.config.models || []
    // 优先使用用户手动标注:文本对话/图片理解模型均可用于分析
    const tagged = models.find(m => {
      const cap = this.metaCapability(m)
      return cap === 'text' || cap === 'vision'
    })
    if (tagged) {
      logger.info(`Using text model (tagged): ${tagged}`)
      return tagged
    }
    // Prefer models matching gpt/o/claude/gemini/agnes/deepseek/qwen/doubao/mimo/minimax etc patterns
    const textModel = models.find(m => /gpt|o[0-9]|claude|gemini|agnes.*flash|deepseek|qwen|glm|kimi|minimax|doubao|doubao-seed|yi-|mistral|llama|phi|mimo/i.test(m))
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
    // 优先使用用户手动标注为图片生成的模型
    const tagged = models.find(m => this.metaCapability(m) === 'image')
    if (tagged) {
      logger.info(`Using image model (tagged): ${tagged}`)
      return tagged
    }
    const imageModel = models.find(m => /dall-e|imagen|image|flux|kolors|seedream|stable|sora|^wan|wanx|z-image|zimage|kling|vidu/i.test(m))
      || models[0]
    if (imageModel) {
      logger.info(`Using image model: ${imageModel} (from config)`)
      return imageModel
    }
    const fallback = this.config.vendor === 'agnes' ? 'agnes-image-2.1-flash' : 'dall-e-3'
    logger.info(`Using fallback image model: ${fallback}`)
    return fallback
  }

  /** Ofox Gemini 原生协议端点（图像编辑/参考图生图仅在 Gemini 原生协议下可用） */
  private get geminiNativeBaseUrl(): string | null {
    if (!this.config.base_url || !this.config.base_url.toLowerCase().includes('ofox')) return null
    return 'https://api.ofox.io/gemini/v1beta'
  }

  async analyzeProduct(images: string[], description: string, options?: AnalyzeOptions): Promise<ProductAnalysis> {
    const imageContent = images.map(img => ({
      type: 'image_url' as const,
      image_url: { url: img, detail: 'high' as const }
    }))

    const isReplicate = options?.mode === 'replicate'
    const extra = options?.extra?.trim()

    // 复刻场景：第一张是参考设计图（风格），其余是产品素材图（主体）
    // 广告图场景:按广告类型追加专业设计规范(基于高转化广告视觉设计原则)
    const adSection = extra?.includes('广告类型')
      ? `

广告图设计规范（重要，遵循高转化广告视觉设计原则）：
【通用视觉设计】
- 视觉焦点：每张广告图只有一个主视觉焦点，第一眼 3 秒内传达核心信息；产品主体清晰突出，背景简洁不抢戏。
- 文字层级：主标题 > 副标题 > 利益点 > CTA 字号逐级递减、对比明显；画面信息不超过 3 个层级。
- 配色：全图 2-3 种主色 + 1 个高对比强调色（用于价格/CTA 等关键元素，利用独特效应让它们最醒目）；促销用红黄橙系，高端用黑金/低饱和系，年轻时尚用明亮渐变系。
- 促销元素：价格标签、折扣角标（如"5折"）、限时标识（倒计时/闪电）等元素醒目但不遮挡产品。
- CTA 视觉：行动号召文字（如"立即抢购"）用高对比色、位置显眼（中央偏下或右下角），引导视线聚焦。
- 安全区：四周保留安全边距，文字不贴边、不遮挡产品主体，避免被平台裁切。
- 构图：三分法/居中/对角线构图，用动势或视线引导流向 CTA。
【按广告类型】
- 电商广告：突出促销利益点（价格、优惠、限时），制造购买冲动；主标题醒目有力（如"限时特惠""买一送一"），价格与折扣元素放大呈现。
- 社交媒体：画面吸睛、利于点赞转发，标题短促有话题感，构图简洁明快，风格时尚年轻。
- 活动海报：节日/大促氛围浓烈（色彩、装饰、光效），主视觉标题大而醒目，信息层级分明（活动主题 > 核心利益点 > 辅助说明）。
【方案与文字】
- 所有广告方案：designPlan 每项必须包含 —— prompt（英文，含产品主体精确描述 + 场景氛围 + 画面中的文字内容与排版位置）、title（主标题文案，必须使用用户指定的目标语言）、description（副文案/辅助说明，必须使用用户指定的目标语言）、style、aspectRatio。
- 画面文字要求：主标题 2-6 个单词、副文案 1 行短句，必须使用用户指定的目标语言书写且拼写正确；中文等非英文标题务必保证文字完整、无乱码；生图模型直接绘制文字，文字越简短越清晰，避免长句与生僻词。
- 产品主体必须与 productProfile/productProfileEn 描述完全一致，不得改变外观。`
      : ''

    const systemContent = (isReplicate
      ? `你是一个专业的电商风格复刻设计师。用户提供【第一张】参考设计图（爆款详情页/海报，需要分析其风格）和【其余】产品素材图（需要分析产品主体）。
任务：在不改变产品主体外观（形状、颜色、材质、结构细节、标志等）的前提下，将参考设计图的风格（色彩、排版、构图、背景、装饰元素、字体风格）应用到产品上，生成电商详情图设计方案。
请以JSON格式返回分析结果，格式如下：
{
  "title": "项目标题",
  "description": "项目描述",
  "keywords": ["关键词1", "关键词2"],
  "suggestedStyles": ["风格1", "风格2"],
  "productProfile": "产品主体外观特征描述（中文）：仅基于产品素材图（除第一张参考图外）仔细观察，详细描述产品的整体形状、结构、颜色、材质、表面纹理、标志、包装等外观特征，尽可能具体到可以被文本生图模型理解并精确还原的程度，用于后续所有生成图片保持产品主体完全一致；重点描述材质类型与表面处理（哑光/亮面/磨砂/金属/皮革/织物等）、纹理细节与体积感，让生图模型还原真实材质质感而非平面贴图",
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
  "productProfile": "产品主体外观特征描述（中文）：基于图片仔细观察，详细描述产品的整体形状、结构、颜色、材质、表面纹理、标志、包装等外观特征，尽可能具体到可以被文本生图模型理解并精确还原的程度，用于后续所有生成图片保持产品主体完全一致；重点描述材质类型与表面处理（哑光/亮面/磨砂/金属/皮革/织物等）、纹理细节与体积感，让生图模型还原真实材质质感而非平面贴图",
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

注意：productProfile 与 productProfileEn 必须完全基于图片中观察到的真实外观，不要编造看不到的特征。colorPalette 需从整体设计风格中提炼 3-5 个真实配色（含色号）。designPlan 中每个方案的 prompt 都要包含对产品主体外观的精确描述，确保生成时产品本体不变。`) + adSection

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
      response_format: { type: 'json_object' },
      // MiniMax-M3 默认开启 thinking,会向 content 注入 <think> 标签破坏 JSON 解析。
      // 双保险:显式关闭 thinking + reasoning_split 把思考内容拆到独立字段(content 保持纯净 JSON)
      ...(this.config.vendor === 'minimax' ? { extra_body: { thinking: { type: 'disabled' }, reasoning_split: true } } : {})
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('OpenAI returned empty response')
    }

    try {
      return parseAnalysisContent(content)
    } catch (e) {
      // 记录响应片段便于排查(如 MiniMax thinking 标签未剥离/JSON 格式问题)
      logger.warn(`AI analysis JSON parse failed (${this.config.vendor}): ${(e as Error)?.message || e}; content head: ${content.slice(0, 300)}`)
      throw e
    }
  }

  async generateImage(prompt: string, options?: GenerateImageOptions): Promise<GeneratedImage> {
    const requestedSize = this.normalizeSize(options?.size || '1:1')
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
    // 阿里云百炼：图片生成走 DashScope 原生接口（OpenAI 兼容端点无 /images/generations）
    const isBailian = this.config.vendor === 'bailian'
    if (isBailian) {
      const result = await this.generateWithDashScopeNative(prompt, refs, options)
      if (result) return result
      throw new Error(`图片生成失败: ${lastError || 'DashScope 接口调用失败'}`)
    }
    // MiniMax：图片生成走 /v1/image_generation 专属端点（非 OpenAI images 接口）
    const isMinimaxImage = this.config.vendor === 'minimax' && /image-01/i.test(this.getImageModel())
    if (isMinimaxImage) {
      const result = await this.generateWithMinimaxNative(prompt, refs, options)
      if (result) return result
      // 原生方法已记录具体错误(如余额不足/鉴权失败/敏感内容),这里透传
      throw new Error(`图片生成失败: ${this.minimaxLastError || 'MiniMax 接口调用失败'}`)
    }
    // SiliconFlow 硅基流动：图片生成参数用 image_size（像素值），返回 images 数组而非 data；图生图用 image 字段
    const isSiliconflow = this.config.vendor === 'siliconflow'
    // 火山方舟：OpenAI 兼容 /api/v3/images/generations；Seedream size 需像素值，默认加水印需关闭
    const isVolcengine = this.config.vendor === 'volcengine'
    // Qwen-Image-Edit 系列是图片编辑模型：必须传参考图，不支持纯文生图
    const isSiliconflowEdit = isSiliconflow && /qwen.*image-edit/i.test(this.getImageModel())
    if (isSiliconflowEdit && refs.length === 0) {
      throw new Error(`当前生图模型 ${this.getImageModel()} 是图片编辑模型（Qwen-Image-Edit），必须上传参考图才能生成，请在项目中添加产品参考图后重试`)
    }
    // Agnes 专用格式：参考图在 extra_body.image，response_format 必须在 extra_body 内
    const isAgnes = this.config.vendor === 'agnes' || /agnes-image/i.test(this.getImageModel())
    // Ofox：参考图字段必须是 input_images（image/images 等会被静默忽略）；output_format 而非 response_format
    const isOfox = !!this.geminiNativeBaseUrl
    // AIHubMix 聚合网关（OpenAI 兼容）：gpt-image 系列图生图走 /v1/images/edits（官方文档推荐）
    const isAihubmix = this.config.vendor === 'aihubmix'
    const isQwenImage = /qwen-image|qwen.*image/i.test(this.getImageModel())
    const isGptImage = /gpt-image/i.test(this.getImageModel())
    // mode: 'array' = gpt-image-1 风格（prompt 数组）；'image' = Google/Ofox 风格（prompt 字符串 + image 参考图参数）
    //       'agnes' = Agnes 风格（prompt 字符串 + extra_body.image 参考图 + extra_body.response_format）
    //       'ofox' = Ofox 风格（prompt 字符串 + input_images 参考图 + output_format）；'text' = 纯文本
    //       'siliconflow' = SiliconFlow 风格（prompt + image_size 像素 + image 参考图）
    // useQuality / useResponseFormat：部分中转（如 litellm/agnes）不支持 quality / response_format 参数，需逐级去掉重试
    const attempt = async (
      size: string,
      mode: 'array' | 'image' | 'text' | 'agnes' | 'ofox' | 'siliconflow' | 'volcengine',
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
        } else if (mode === 'siliconflow') {
          // SiliconFlow：普通生图模型用 image_size（像素值，比例映射为官方推荐像素）；
          // Qwen-Image-Edit 系列是图片编辑模型：不支持 image_size，必须传参考图（image/image2/image3 多图融合）+ cfg
          // image 字段为单个 base64/URL 字符串（官方文档），参考图顺序：产品主体图优先
          const sfModel = this.getImageModel()
          const isSfEdit = /qwen.*image-edit/i.test(sfModel)
          body.prompt = prompt
          if (!isSfEdit) {
            body.image_size = this.siliconflowImageSize(size)
          }
          if (refs.length > 0) {
            // 产品主体图在参考图数组末尾（styleImages 在前，referenceImages 在后），编辑场景优先用主体图
            const ordered = [...refs].reverse()
            if (isSfEdit) {
              body.image = ordered[0]
              // image2/image3 多图融合仅 Qwen-Image-Edit-2509 支持（官方文档）
              if (/Qwen-Image-Edit-2509/i.test(sfModel)) {
                if (ordered[1]) body.image2 = ordered[1]
                if (ordered[2]) body.image3 = ordered[2]
              }
              // 官方示例 cfg=4（生成包含文本的图片时 cfg 必须 > 1）
              body.cfg = 4
            } else {
              body.image = ordered[0]
            }
          }
        } else if (mode === 'volcengine') {
          // 火山方舟 Seedream：按模型版本+清晰度选择档位映射官方参考像素（像素下限因版本而异），
          // 关闭默认水印；单图场景显式关闭组图；参考图支持 URL/base64 数组（多图生图，最多 14 张）
          body.prompt = prompt
          // quality 传原始值(standard/hd/2k/4k),由 volcengineImageSize 决定档位
          body.size = this.volcengineImageSize(size, options?.quality)
          body.watermark = false
          body.response_format = 'url'
          // 单图输出:显式关闭组图(避免模型按提示词自动生成多张);5.0 pro 不支持组图参数,跳过
          if (!/doubao-seedream-5-0-pro/i.test(this.getImageModel())) {
            body.sequential_image_generation = 'disabled'
          }
          // 输出格式:5.0 系列支持 png/jpeg,4.5/4.0 仅 jpeg(不传)
          if (/doubao-seedream-5-0/i.test(this.getImageModel())) {
            body.output_format = 'png'
          }
          if (refs.length > 0) body.image = refs
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
        // SiliconFlow 返回 { images: [{ url }] }，标准 OpenAI 返回 { data: [...] }
        const list = isSiliconflow ? (response as any).images : response.data
        const image = Array.isArray(list) ? list[0] : undefined
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
      const gem = await this.generateWithGeminiNative(prompt, refs, requestedSize, options?.cropRefs !== false)
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
        const a0b = await attempt(requestedSize, 'agnes', false, false)
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
          const of2 = await attempt(requestedSize, 'ofox', false)
          if (of2) return of2
        }
        if (isGptImage) {
          logger.warn('Ofox gpt-image detected, using /images/edits endpoint')
          const ed = await this.editWithOpenAIFile(prompt, refs, requestedSize, options?.cropRefs !== false)
          if (ed) return ed
          logger.warn(`Ofox gpt-image edits failed, falling back: ${lastError}`)
        }
      }
      // 2.5) AIHubMix：gpt-image 系列官方文档推荐 /v1/images/edits（multipart）
      if (isAihubmix && isGptImage) {
        logger.warn('AIHubMix gpt-image detected, using /images/edits endpoint')
        const ed = await this.editWithOpenAIFile(prompt, refs, requestedSize, options?.cropRefs !== false)
        if (ed) return ed
        logger.warn(`AIHubMix gpt-image edits failed, falling back: ${lastError}`)
      }
      // 2.6) SiliconFlow：官方图生图走同一 /v1/images/generations（image 字段传参考图）
      if (isSiliconflow) {
        const s1 = await attempt(requestedSize, 'siliconflow', true)
        if (s1) return s1
        logger.warn(`SiliconFlow image-to-image failed, retrying: ${lastError}`)
        const s2 = await attempt(requestedSize, 'siliconflow', false, false)
        if (s2) return s2
        logger.warn(`SiliconFlow multimodal failed, falling back to generic attempts: ${lastError}`)
      }
      // 2.7) 火山方舟：多图生图走同一 /api/v3/images/generations（image 数组传参考图，官方文档支持 2-14 张）
      if (isVolcengine) {
        const v1 = await attempt(requestedSize, 'volcengine', true)
        if (v1) return v1
        logger.warn(`Volcengine image-to-image failed, retrying: ${lastError}`)
        const v2 = await attempt(requestedSize, 'volcengine', false, false)
        if (v2) return v2
        logger.warn(`Volcengine multimodal failed, falling back to generic attempts: ${lastError}`)
      }
      // 3) prompt 数组 + 用户尺寸（gpt-image-1 风格）
      const a = await attempt(requestedSize, 'array', true)
      if (a) return a
      // 4) prompt 数组 + 方形尺寸（尺寸错误时不静默降级，交由前端弹窗提示用户选择保底尺寸）
      if (requestedSize !== '1024x1024' && !isSizeRelatedError(lastError)) {
        logger.warn(`Array-prompt multimodal failed with size ${requestedSize}, retrying with 1024x1024: ${lastError}`)
        const b = await attempt('1024x1024', 'array', true)
        if (b) return b
      }
      // 5) image 参数格式（Google/Ofox 兼容：prompt 为字符串，参考图走 image 参数）
      logger.warn(`Array-prompt multimodal rejected, retrying with image param format: ${lastError}`)
      const c = await attempt(requestedSize, 'image', true)
      if (c) return c
      // 6) image 参数 + 方形尺寸（尺寸错误时不静默降级）
      if (requestedSize !== '1024x1024' && !isSizeRelatedError(lastError)) {
        logger.warn(`Image-param multimodal failed with size ${requestedSize}, retrying with 1024x1024: ${lastError}`)
        const d = await attempt('1024x1024', 'image', true)
        if (d) return d
      }
      // 7) image 参数 + 去除 quality（尺寸错误时保持原尺寸尝试，不再切换方形）
      if (!isSizeRelatedError(lastError)) {
        logger.warn(`Image-param multimodal failed, retrying without quality param: ${lastError}`)
        const e = await attempt('1024x1024', 'image', false)
        if (e) return e
      }
      // 8) image 参数 + 去除 quality + 去除 response_format（部分中转不支持该参数）
      if (!isSizeRelatedError(lastError)) {
        logger.warn(`Image-param multimodal failed, retrying without quality & response_format params: ${lastError}`)
        const e2 = await attempt('1024x1024', 'image', false, false)
        if (e2) return e2
      }
      logger.warn(`Multimodal image generation not supported, falling back to text-only prompt: ${lastError}`)
    }
    const textMode = isAgnes ? 'agnes' : isOfox ? 'ofox' : isSiliconflow ? 'siliconflow' : isVolcengine ? 'volcengine' : 'text'
    // 9) 纯文本 + 用户尺寸
    const f = await attempt(requestedSize, textMode, true)
    if (f) return f
    // 10) 尺寸降级：部分模型（如 gemini image）仅支持方形尺寸（尺寸错误时不静默降级）
    if (requestedSize !== '1024x1024' && !isSizeRelatedError(lastError)) {
      logger.warn(`Image generation failed with size ${requestedSize}, retrying with 1024x1024: ${lastError}`)
      const g = await attempt('1024x1024', textMode, true)
      if (g) return g
    }
    // 11) 纯文本 + 方形 + 无 quality（尺寸错误时跳过）
    if (!isSizeRelatedError(lastError)) {
      const h = await attempt('1024x1024', textMode, false)
      if (h) return h
    }
    // 12) 纯文本 + 方形 + 无 quality + 无 response_format 兜底（尺寸错误时跳过）
    if (!isSizeRelatedError(lastError)) {
      logger.warn(`Text-only generation failed, retrying without quality & response_format params: ${lastError}`)
      const h2 = await attempt('1024x1024', textMode, false, false)
      if (h2) return h2
    }
    // 尺寸不被模型支持:带标记抛出,前端据此弹窗让用户选择是否按保底尺寸生成
    const sizeUnsupported = isSizeRelatedError(lastError)
    throw new Error(`${sizeUnsupported ? 'SIZE_NOT_SUPPORTED|' : ''}图片生成失败: ${lastError || '未知错误'}`)
  }

  /** 根据尺寸推断宽高比（用于 Agnes 档位式 size 的 ratio 参数），支持 "W:H" 比例与 "WxH" 像素两种格式 */
  private inferRatio(size: string): string {
    const ratioMatch = size.match(/^(\d+):(\d+)$/)
    if (ratioMatch) {
      return this.ratioFromWH(parseInt(ratioMatch[1], 10), parseInt(ratioMatch[2], 10))
    }
    const m = size.match(/^(\d+)x(\d+)$/)
    if (!m) return '1:1'
    return this.ratioFromWH(parseInt(m[1], 10), parseInt(m[2], 10))
  }

  /**
   * SiliconFlow 图片尺寸:官方要求 image_size 为像素值(如 1024x1024)。
   * 用户选择的比例(如 16:9)映射为 Qwen-Image 官方推荐像素;已是像素则原样传递。
   */
  private siliconflowImageSize(size: string): string {
    const ratio = size.includes('_') ? size.split('_')[0] : size
    if (/^\d+x\d+$/.test(ratio)) return ratio
    // Qwen-Image 官方推荐像素(按比例映射)
    const map: Record<string, string> = {
      '1:1': '1328x1328',
      '16:9': '1664x928',
      '9:16': '928x1664',
      '4:3': '1472x1140',
      '3:4': '1140x1472',
      '3:2': '1584x1056',
      '2:3': '1056x1584',
      '21:9': '1664x928'
    }
    return map[ratio] || '1328x1328'
  }

  /**
   * 火山方舟 Seedream 图片尺寸:官方要求 size 为像素值或档位(1K/1.5K/2K/3K/4K,视版本而定)。
   * - 比例输入:按模型版本 + 用户清晰度(quality: standard/hd/2k/4k)选择档位,映射为官方参考像素;
   *   5.0 pro 的 1.5K 与 1K 同价且效果更优,故作为其标准档;
   *   5.0 lite/4.5 像素下限为 3686400(约 2K 档),低于此的输入一律提升到 2K 档。
   * - 像素输入:校验总像素范围,低于下限/高于上限时提升或降低到该比例最近档位像素。
   */
  private volcengineImageSize(size: string, quality?: string): string {
    const model = this.getImageModel()
    const profile = getSeedreamProfile(model)
    if (!profile) return '2048x2048'

    const ratio = size.includes('_') ? size.split('_')[0] : size

    // 像素输入:总像素合法则原样传递;不合法则按比例映射到最近档位
    const pixelMatch = ratio.match(/^(\d+)x(\d+)$/)
    if (pixelMatch) {
      const w = parseInt(pixelMatch[1], 10)
      const h = parseInt(pixelMatch[2], 10)
      const total = w * h
      if (total >= profile.minPixels && total <= profile.maxPixels) return ratio
      const ratioHint = this.inferRatio(ratio)
      const mapped = seedreamTierPixel(profile, profile.tiers[0], ratioHint)
      logger.warn(`Seedream pixel ${ratio} out of range [${profile.minPixels}, ${profile.maxPixels}], mapped to ${mapped}`)
      return mapped || '2048x2048'
    }

    // 比例输入:按清晰度选档位(quality 为原始值 standard/hd/2k/4k,缺省按 standard)
    const q = (quality || '').toLowerCase()
    let tier: string
    if (/4k/.test(q)) {
      tier = profile.tiers.includes('4K') ? '4K' : profile.tiers[profile.tiers.length - 1]
    } else if (/2k/.test(q)) {
      tier = profile.tiers.includes('2K') ? '2K' : profile.tiers[profile.tiers.length - 1]
    } else if (/^hd/.test(q)) {
      // 高清:pro→2K、lite→3K、4.5→2K、4.0→2K(取第二档,但跳过 pro 的 1K)
      tier = profile.tiers.length > 1 ? profile.tiers[1] : profile.tiers[0]
    } else {
      // standard/low:最低档(pro 的档位表 1.5K 在前,与 1K 同价更优)
      tier = profile.tiers[0]
    }
    const mapped = seedreamTierPixel(profile, tier, ratio)
    if (mapped) return mapped
    return '2048x2048'
  }

  /**
   * 阿里云百炼图片生成（DashScope 原生接口）:
   * qwen-image-3.0 / wan2.6 / z-image 系列走 POST /api/v1/services/aigc/multimodal-generation/generation（同步），
   * 请求结构为 input.messages[].content[{image|text}]，响应 output.choices[0].message.content[0].image。
   * 从 OpenAI 兼容 base_url（https://dashscope.aliyuncs.com/compatible-mode/v1）推导主域名。
   * 参考官方文档:size 参数格式为「宽*高」（星号分隔），如 "1024*1024"。
   */
  private async generateWithDashScopeNative(prompt: string, refs: string[], options?: GenerateImageOptions): Promise<GeneratedImage | null> {
    const baseUrl = this.config.base_url || 'https://dashscope.aliyuncs.com'
    // 兼容 base_url 推导主域名:去掉 /compatible-mode/v1 或 /api/v1 后缀
    const host = baseUrl.replace(/\/compatible-mode\/v1\/?$/, '').replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '')
    const endpoint = `${host}/api/v1/services/aigc/multimodal-generation/generation`

    const content: Array<Record<string, unknown>> = []
    // 参考图在前（产品主体保持），文本提示词在后
    for (const r of refs) {
      content.push({ image: r })
    }
    content.push({ text: prompt })

    const body: Record<string, unknown> = {
      model: this.getImageModel(),
      input: {
        messages: [
          {
            role: 'user',
            content
          }
        ]
      },
      parameters: {
        // size 格式为「宽*高」(星号),qwen-image/wan 均按像素传递
        ...(options?.size ? { size: this.bailianImageSize(options.size, options?.quality) } : {}),
        // 提示词智能改写(官方默认 true,建议开启)
        prompt_extend: true,
        // 水印默认 false(不加)
        watermark: false
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        const err = json?.message || json?.code || `HTTP ${response.status}`
        logger.warn(`DashScope image generation error: ${err}`)
        return null
      }
      const image = json?.output?.choices?.[0]?.message?.content?.find((p: any) => p && p.image)?.image
      if (!image) {
        logger.warn('DashScope image generation: no image in response')
        return null
      }
      return { url: image as string }
    } catch (error) {
      logger.warn(`DashScope image generation exception: ${extractError(error)}`)
      return null
    }
  }

  /**
   * 百炼图片尺寸(官方文档:size 格式为「宽*高」,星号分隔):
   * - qwen-image 系列:总像素 512*512 ~ 2048*2048,宽高比 1:8 ~ 8:1,按清晰度选 1K/2K 基准,长边不超 2048
   * - wan2.6 系列:总像素 [1280*1280, 1440*1440],宽高比 [1:4, 4:1],用 1280/1440 基准
   * - 其他 wan 系列:宽高均 [512, 1440],用 1024/1440 基准
   */
  private bailianImageSize(size: string, quality?: string): string {
    const ratio = size.includes('_') ? size.split('_')[0] : size
    const model = this.getImageModel()
    const q = (quality || '').toLowerCase()
    const isWan26 = /^wan2\.6/i.test(model)
    const isWan = /^wan/i.test(model)

    // 像素输入:校验范围后原样传递(注意转「宽*高」星号格式)
    const pixelMatch = ratio.match(/^(\d+)[x*](\d+)$/)
    if (pixelMatch) {
      const w = parseInt(pixelMatch[1], 10)
      const h = parseInt(pixelMatch[2], 10)
      if (isWan) {
        const minV = isWan26 ? 1280 : 512
        const maxV = isWan26 ? 1440 : 1440
        if (w >= minV && w <= maxV && h >= minV && h <= maxV) return `${w}*${h}`
      } else if (w >= 512 && w <= 2048 && h >= 512 && h <= 2048) {
        return `${w}*${h}`
      }
      // 超范围:回退按比例映射
    }

    // 比例输入:按模型类型与清晰度选基准
    let base: number
    if (isWan26) {
      // wan2.6:官方示例 size=1280*1280,宽高比 [1:4, 4:1],以 1280 为长边基准
      base = 1280
    } else if (isWan) {
      base = /4k|2k/.test(q) ? 1440 : 1024
    } else {
      // qwen-image:1K/2K 基准(长边为基准值,确保总像素 ≤ 2048*2048)
      base = /4k|2k/.test(q) ? 2048 : 1024
    }
    // 长边 = base,短边按比例折算,保证不超上限
    const map: Record<string, string> = {
      '1:1': `${base}*${base}`,
      '4:3': `${base}*${Math.round(base * 0.75)}`,
      '3:4': `${Math.round(base * 0.75)}*${base}`,
      '16:9': `${base}*${Math.round(base * 0.5625)}`,
      '9:16': `${Math.round(base * 0.5625)}*${base}`,
      '3:2': `${base}*${Math.round(base * 0.6667)}`,
      '2:3': `${Math.round(base * 0.6667)}*${base}`,
      '21:9': `${base}*${Math.round(base * 0.4286)}`
    }
    return map[ratio] || `${base}*${base}`
  }

  /**
   * MiniMax 图片生成（专属端点）:
   * POST /v1/image_generation，参数 aspect_ratio（8 种固定比例）或 width/height 像素（512~2048，8 的倍数）；
   * 响应 data.image_urls / data.image_base64。
   * 注意:官方 subject_reference 仅支持 character(人像)参考,不适用于电商产品主体,
   * 因此产品主体一致性依赖 prompt 中的 Product visual profile 文本描述。
   * 官方文档:https://platform.minimaxi.com/docs/guides/image-generation
   */
  private async generateWithMinimaxNative(prompt: string, refs: string[], options?: GenerateImageOptions): Promise<GeneratedImage | null> {
    const baseUrl = this.config.base_url || 'https://api.minimaxi.com/v1'
    const host = baseUrl.replace(/\/+$/, '')
    const endpoint = `${host}/image_generation`

    // MiniMax image-01 限制 prompt 最长 1500 字符(官方文档,超长返回 status_code=2013)。
    // 电商 prompt = 主体一致性前缀(开头,含 Product visual profile 产品描述)+ 模块指令(尾部)。
    // 超长时优先保留 Product visual profile 产品描述完整(主体一致性核心),再保头部约束与尾部指令。
    const MAX_PROMPT_LEN = 1500
    let finalPrompt = prompt
    if (prompt.length > MAX_PROMPT_LEN) {
      finalPrompt = this.truncatePromptPreservingProfile(prompt, MAX_PROMPT_LEN)
      logger.warn(`MiniMax prompt truncated: ${prompt.length} -> ${finalPrompt.length} chars (limit ${MAX_PROMPT_LEN})`)
    }

    const body: Record<string, unknown> = {
      model: this.getImageModel(),
      prompt: finalPrompt,
      aspect_ratio: this.minimaxAspectRatio(options?.size || '1:1'),
      response_format: 'url',
      // 不加水印(默认 false)
      aigc_watermark: false
    }
    // 不传 subject_reference:MiniMax 官方仅支持 character(人像)参考,电商产品传图会导致主体被模型改写
    void refs

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.api_key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      const json = await response.json().catch(() => null)
      // MiniMax 业务错误在 HTTP 200 的 base_resp.status_code 中(1004 鉴权失败/1008 余额不足/1026 敏感内容/2013 参数异常等)
      const statusCode = json?.base_resp?.status_code
      const statusMsg = json?.base_resp?.status_msg
      if (!response.ok || (statusCode !== undefined && statusCode !== 0)) {
        const err = statusMsg || json?.message || `HTTP ${response.status}`
        this.minimaxLastError = err
        logger.warn(`MiniMax image generation error: ${err} (status_code=${statusCode})`)
        return null
      }
      // 响应支持 url 与 base64 两种格式
      const urls = json?.data?.image_urls
      const b64s = json?.data?.image_base64
      if (Array.isArray(urls) && urls.length > 0) {
        return { url: urls[0] as string }
      }
      if (Array.isArray(b64s) && b64s.length > 0) {
        return { url: `data:image/jpeg;base64,${b64s[0]}` }
      }
      this.minimaxLastError = `响应中无图片数据 (status_code=${statusCode} msg=${statusMsg || 'none'})`
      logger.warn(`MiniMax image generation: no image in response (status_code=${statusCode} msg=${statusMsg || 'none'})`)
      return null
    } catch (error) {
      this.minimaxLastError = extractError(error)
      logger.warn(`MiniMax image generation exception: ${extractError(error)}`)
      return null
    }
  }

  /**
   * 智能截断 prompt 到 maxLen,优先保留「Product visual profile:」产品描述(主体一致性核心)。
   * 策略:定位 Product visual profile 段落(到 "User supplementary" 或 prompt 末尾),
   * 若段落本身不超限则完整保留;超限则截断描述内部(保留开头特征描述)。
   * 剩余空间分配给头部主体约束(60%)与尾部模块指令(40%)。
   */
  private truncatePromptPreservingProfile(prompt: string, maxLen: number): string {
    const marker = 'Product visual profile:'
    const idx = prompt.indexOf(marker)
    if (idx === -1) {
      // 无产品描述:保留开头 55% + 结尾 45%
      const headLen = Math.floor(maxLen * 0.55)
      return prompt.slice(0, headLen) + prompt.slice(prompt.length - (maxLen - headLen))
    }
    // 段落终点:下一个 "User supplementary requirements:" 行,否则到 prompt 末尾
    const suppIdx = prompt.indexOf('\nUser supplementary', idx)
    const profileEnd = suppIdx !== -1 ? suppIdx : prompt.length
    const profilePart = prompt.slice(idx, profileEnd)
    const headPart = prompt.slice(0, idx)
    const tailPart = prompt.slice(profileEnd)

    const profileLen = profilePart.length
    if (profileLen > maxLen) {
      // 产品描述本身超长:保留描述开头(整体特征在前)
      logger.warn(`MiniMax product profile too long: ${profileLen} chars, slicing to ${maxLen}`)
      return profilePart.slice(0, maxLen)
    }
    // 描述完整保留,头/尾按剩余空间分配
    const remain = maxLen - profileLen
    const headKeep = Math.min(headPart.length, Math.floor(remain * 0.6))
    const tailKeep = remain - headKeep
    let result = headPart.slice(0, headKeep) + profilePart
    result += tailPart.length > tailKeep ? tailPart.slice(0, tailKeep) : tailPart
    return result.slice(0, maxLen)
  }

  /** MiniMax 尺寸:官方固定 8 种比例(aspect_ratio),像素输入按比例折算 */
  private minimaxAspectRatio(size: string): string {
    const ratio = size.includes('_') ? size.split('_')[0] : size
    const supported = ['1:1', '16:9', '4:3', '3:2', '2:3', '3:4', '9:16', '21:9']
    if (supported.includes(ratio)) return ratio
    const m = ratio.match(/^(\d+)x(\d+)$/)
    if (m) {
      return this.inferRatio(ratio)
    }
    return '1:1'
  }

  private ratioFromWH(w: number, h: number): string {
    const r = w / h
    if (r > 1.6) return '16:9'
    if (r > 1.3) return '3:2'
    if (r > 1.1) return '4:3'
    if (r < 0.62) return '9:16'
    if (r < 0.75) return '3:4'
    if (r < 0.9) return '2:3'
    return '1:1'
  }

  /** Ofox/AIHubMix gpt-image 系列图生图：/v1/images/edits（multipart 上传文件）。
   *  注意:官方文档确认编辑模式输出尺寸跟随输入图(size 参数无效,须传 auto),
   *  因此先把编辑对象图居中裁剪到目标比例,确保输出比例符合用户选择。 */
  private async editWithOpenAIFile(prompt: string, refs: string[], size?: string, crop = true): Promise<GeneratedImage | null> {
    // 取最后一张参考图（产品主体图）作为编辑对象
    let target = [...refs].reverse().find(r => r.startsWith('data:image/'))
    if (!target) return null
    // 编辑模式输出跟随输入图:先按目标比例裁剪,保证输出比例正确(用户选择"不裁剪"时跳过)
    if (size && crop) {
      const cropped = this.cropToRatio(target, size)
      if (cropped) target = cropped
    }
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

  /**
   * 把参考图居中裁剪到目标比例。
   * 背景:Gemini 图像模型编辑模式(带参考图)下,官方文档确认输出尺寸默认跟随输入图;
   * 中转端点的 aspectRatio 在编辑模式下常被忽略。裁剪后输入比例即输出比例,确保生成尺寸与选择一致。
   */
  private cropToRatio(dataUrl: string, ratio: string): string | null {
    try {
      const img = nativeImage.createFromDataURL(dataUrl)
      if (img.isEmpty()) return null
      const size = img.getSize()
      if (!size.width || !size.height) return null
      const rm = ratio.match(/^(\d+):(\d+)$/)
      if (!rm) return null
      const target = parseInt(rm[1], 10) / parseInt(rm[2], 10)
      const cur = size.width / size.height
      let w = size.width
      let h = size.height
      if (cur > target) {
        w = Math.round(h * target)
      } else if (cur < target) {
        h = Math.round(w / target)
      }
      if (w <= 0 || h <= 0 || w > size.width || h > size.height) return null
      const x = Math.round((size.width - w) / 2)
      const y = Math.round((size.height - h) / 2)
      let out = img.crop({ x, y, width: w, height: h })
      // 裁剪后分辨率可能偏低:放大到较长边 1024,提升清晰度
      const longSide = Math.max(w, h)
      if (longSide < 1024) {
        const scale = 1024 / longSide
        out = out.resize({
          width: Math.max(1, Math.round(w * scale)),
          height: Math.max(1, Math.round(h * scale))
        })
      }
      return out.toDataURL()
    } catch {
      return null
    }
  }

  /** 通过 Gemini 原生协议（Ofox）生成/编辑图片：参考图以 inlineData 输入，保持产品主体一致 */
  private async generateWithGeminiNative(prompt: string, refs: string[], size?: string, crop = true): Promise<GeneratedImage | null> {
    const base = this.geminiNativeBaseUrl
    if (!base) return null
    try {
      // 目标比例(编辑模式输出跟随参考图:裁剪参考图用 + generationConfig 传参用)
      const ratio = size ? (size.includes('_') ? size.split('_')[0] : size) : '1:1'
      const parts: unknown[] = [{ text: prompt }]
      for (const r of refs) {
        const m = r.match(/^data:([^;]+);base64,(.+)$/)
        if (!m) continue
        // 编辑模式输出尺寸跟随参考图:先把参考图居中裁剪到目标比例,确保输出比例符合用户选择(用户选择"不裁剪"时跳过)
        const cropped = crop ? this.cropToRatio(r, ratio) : null
        if (cropped) {
          const cm = cropped.match(/^data:([^;]+);base64,(.+)$/)
          if (cm) {
            parts.push({ inlineData: { mimeType: cm[1], data: cm[2] } })
            continue
          }
        }
        parts.push({ inlineData: { mimeType: m[1], data: m[2] } })
      }
      if (parts.length <= 1) return null
      const body: Record<string, unknown> = { contents: [{ parts }] }
      if (size) {
        // 用户选择的尺寸(比例如 9:16)通过 generationConfig.imageConfig.aspectRatio 传给模型
        body.generationConfig = { imageConfig: { aspectRatio: ratio } }
      }
      const response = await fetch(`${base}/models/${encodeURIComponent(this.getImageModel())}:generateContent`, {
        method: 'POST',
        headers: {
          'x-goog-api-key': this.config.api_key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
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
      // 不做自动裁剪:强制居中裁剪会切掉画面边缘内容,由前端弹窗让用户决定处理方式
      return {
        url: `data:${imagePart.inlineData.mimeType || 'image/png'};base64,${imagePart.inlineData.data}`
      }
    } catch (error) {
      logger.warn(`Gemini native exception: ${extractError(error)}`)
      return null
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const textModel = this.getTextModel()
    const maxOutput = this.config.model_meta?.[textModel]?.maxOutput
    const response = await this.client.chat.completions.create({
      model: textModel,
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
      max_tokens: maxOutput && maxOutput > 0 ? maxOutput : 4000,
      // MiniMax-M3 默认开启 thinking,会向 content 注入 <think> 标签;关闭并拆分思考内容保持回复纯净
      ...(this.config.vendor === 'minimax' ? { extra_body: { thinking: { type: 'disabled' }, reasoning_split: true } } : {})
    })

    return response.choices[0]?.message?.content || ''
  }

  async testConnection(): Promise<{ success: boolean; latency: number; error?: string }> {
    const start = Date.now()
    try {
      await this.client.models.list()
      return { success: true, latency: Date.now() - start }
    } catch (error: any) {
      const msg = extractError(error)
      logger.error(`Connection test failed (${this.config.vendor}): ${msg}`)
      return { success: false, latency: Date.now() - start, error: msg }
    }
  }

  async fetchModels(): Promise<Array<{ id: string; name: string; description?: string; contextWindow?: number; maxOutput?: number }>> {
    try {
      const response = await this.client.models.list()
      const filter = MODEL_FILTERS[this.config.vendor] || MODEL_FILTERS.custom
      const models = response.data
        .filter(m => filter(m.id))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(m => ({
          id: m.id,
          name: m.id,
          // 部分端点（如 OpenRouter/中转站）会返回 context_window 等扩展字段
          contextWindow: (m as any).context_window ? Number((m as any).context_window) : undefined
        }))
      // MiniMax 的 /v1/models 仅返回语言模型,图片生成模型(image-01 系列)需手动补充
      if (this.config.vendor === 'minimax') {
        for (const extra of ['image-01', 'image-01-live']) {
          if (!models.some(m => m.id === extra)) {
            models.push({ id: extra, name: extra })
          }
        }
        models.sort((a, b) => a.id.localeCompare(b.id))
      }
      return models
    } catch (error) {
      logger.error(`Failed to fetch models (${this.config.vendor}): ${extractError(error)}`)
      return (FALLBACK_MODELS[this.config.vendor] || []).map(id => ({ id, name: id }))
    }
  }

  /** Gemini 图像模型官方支持的宽高比集合(2025 起扩展为 10 种,含 2:3/3:2/4:5/5:4) */
  private static readonly GEMINI_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']

  /**
   * 尺寸归一化:
   * - Gemini 图像模型(imagen/gemini-*-image):仅支持官方比例集合,不支持的尺寸直接抛出
   *   SIZE_NOT_SUPPORTED(前端弹窗让用户选择保底尺寸),避免模型静默生成错误比例;
   *   保底重试传来的像素(如 1792x1024)自动归一到最接近的支持比例。
   * - 其他模型:原样传递,由重试链与前端弹窗处理。
   */
  private normalizeSize(size: string): string {
    const ratio = size.includes('_') ? size.split('_')[0] : size
    if (/gemini.*image|imagen/i.test(this.getImageModel())) {
      // 保底像素(如 1792x1024)归一到支持的比例
      if (/^\d+x\d+$/.test(ratio)) {
        const inferred = this.inferRatio(ratio)
        return OpenAIProvider.GEMINI_ASPECT_RATIOS.includes(inferred) ? inferred : '1:1'
      }
      if (OpenAIProvider.GEMINI_ASPECT_RATIOS.includes(ratio)) return ratio
      throw new Error(`SIZE_NOT_SUPPORTED|当前模型不支持 ${ratio} 尺寸比例（支持：${OpenAIProvider.GEMINI_ASPECT_RATIOS.join('、')}）`)
    }
    return ratio
  }
}
