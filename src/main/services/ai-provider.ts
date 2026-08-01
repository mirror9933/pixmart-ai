import { OpenAIProvider } from './openai'
import { AnthropicProvider } from './anthropic'

export interface ModelConfig {
  id: string
  vendor: string
  vendor_label: string
  api_key: string
  base_url: string
  /** 自定义厂商的接入协议：openai / anthropic / gemini */
  protocol?: string
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

export interface AIProvider {
  analyzeProduct(images: string[], description: string, options?: AnalyzeOptions): Promise<ProductAnalysis>
  generateImage(prompt: string, options?: GenerateImageOptions): Promise<GeneratedImage>
  chat(messages: ChatMessage[]): Promise<string>
  testConnection(): Promise<{ success: boolean; latency: number }>
  fetchModels(): Promise<string[]>
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
    case 'custom':
      return new OpenAIProvider(config)
    default:
      throw new Error(`Unsupported AI vendor: ${config.vendor}`)
  }
}
