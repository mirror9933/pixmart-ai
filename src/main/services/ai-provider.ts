import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'

/** 模型能力标注：auto=自动识别 text=文本对话 image=图片生成 vision=图片理解 */
export type ModelCapability = 'auto' | 'text' | 'image' | 'vision'

/** 单个模型的高级元数据（以模型 id 为 key 保存在配置的 modelMeta 中） */
export interface ModelMeta {
  alias?: string
  capability?: ModelCapability
  contextWindow?: number
  maxOutput?: number
  note?: string
}

export interface ModelConfig {
  id: string
  vendor: string
  vendor_label: string
  api_key: string
  base_url: string
  /** 自定义厂商的接入协议：openai / anthropic / gemini */
  protocol?: string
  /** 组织 ID（OpenAI 兼容端点） */
  org_id?: string
  /** 自定义请求头（JSON 对象） */
  headers?: Record<string, string>
  /** 请求超时（秒），0 = SDK 默认 */
  timeout?: number
  /** 模型级元数据：modelId -> ModelMeta */
  model_meta?: Record<string, ModelMeta>
  status: string
  latency: number
  tested_at: string | null
  models: string[]
}

export interface ProductAnalysis {
  title: string
  description: string
  keywords: string[]
  suggestedStyles: string[]
  designPlan: DesignPlanItem[]
  /** 产品主体外观特征描述（形状/颜色/材质/细节等），用于生成时保持主体一致性 */
  productProfile?: string
  /** 产品主体外观特征描述（英文，供生图模型精确还原主体） */
  productProfileEn?: string
  /** 色彩方案（主色调/辅助色/点缀色等），用于规划页色彩系统展示 */
  colorPalette?: Array<{ name: string; hex: string }>
  /** 推荐字体系统 */
  fonts?: Array<{ role: string; font: string; size: string }>
  /** 视觉语言规范 */
  visualLanguage?: { elements: string; iconStyle: string; corners: string; shadow: string }
}

export interface DesignPlanItem {
  id: string
  title: string
  description: string
  prompt: string
  style: string
  aspectRatio: string
}

export interface GeneratedImage {
  url: string
  revisedPrompt?: string
}

export interface ChatContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string; detail?: string }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

export interface ModelInfo {
  id: string
  name: string
  description?: string
  contextWindow?: number
  maxOutput?: number
}

export interface TestConnectionResult {
  success: boolean
  latency: number
  /** 失败时的具体错误信息(HTTP 状态/原因),供前端展示排查 */
  error?: string
}

export interface AIProvider {
  analyzeProduct(images: string[], description: string, options?: AnalyzeOptions): Promise<ProductAnalysis>
  generateImage(prompt: string, options?: GenerateImageOptions): Promise<GeneratedImage>
  chat(messages: ChatMessage[]): Promise<string>
  testConnection(): Promise<TestConnectionResult>
  fetchModels(): Promise<ModelInfo[]>
}

export interface GenerateImageOptions {
  size?: string
  quality?: string
  style?: string
  n?: number
  /** 用户上传的产品参考图（data URL），用于保持产品主体一致性 */
  referenceImages?: string[]
  /** 风格参考图（data URL），如复刻场景的参考设计图 */
  styleImages?: string[]
  /** 是否允许把参考图裁剪到目标比例(编辑模式模型输出跟随参考图时;默认 true,false 时保留原图) */
  cropRefs?: boolean
}

export interface AnalyzeOptions {
  /** 分析场景：'general' 默认电商分析 | 'replicate' 风格复刻 */
  mode?: 'general' | 'replicate'
  /** 用户补充要求 */
  extra?: string
}

export function createProvider(config: ModelConfig): AIProvider {
  // 自定义厂商：按所选协议路由
  if (config.vendor === 'custom') {
    const protocol = config.protocol || 'openai'
    if (protocol === 'anthropic') {
      return new AnthropicProvider(config)
    }
    // openai / gemini 均走 OpenAI 兼容协议（Gemini 官方提供 OpenAI 兼容端点）
    return new OpenAIProvider(config)
  }

  switch (config.vendor) {
    case 'anthropic':
      return new AnthropicProvider(config)
    case 'openai':
    case 'google':
    case 'openrouter':
    case 'agnes':
    case 'ofox':
    case 'aihubmix':
    case 'siliconflow':
    case 'volcengine':
    case 'bailian':
    case 'mimo':
    case 'kimi':
    case 'minimax':
    case 'custom':
      return new OpenAIProvider(config)
    default:
      throw new Error(`Unsupported AI vendor: ${config.vendor}`)
  }
}
