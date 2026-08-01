export type VendorType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'agnes' | 'ofox' | 'custom'

/** 厂商分组：official = 官方（自家协议 API），aggregator = 聚合中转 */
export type VendorGroup = 'official' | 'aggregator'

/** 自定义厂商可选协议 */
export type CustomProtocol = 'openai' | 'anthropic' | 'gemini'

export interface ProtocolInfo {
  label: string
  defaultBaseUrl: string
  hint: string
}

/** 三协议配置说明（默认接入地址） */
export const PROTOCOL_INFO: Record<CustomProtocol, ProtocolInfo> = {
  openai: {
    label: 'OpenAI 兼容协议',
    defaultBaseUrl: 'https://api.openai.com/v1',
    hint: '任意 OpenAI 兼容端点（OpenAI 官方 / 各类中转均可）'
  },
  anthropic: {
    label: 'Anthropic 原生协议',
    defaultBaseUrl: 'https://api.anthropic.com',
    hint: '使用 Anthropic 原生 Messages API；注意：该协议不支持图片生成'
  },
  gemini: {
    label: 'Gemini 兼容协议',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    hint: 'Google 官方 OpenAI 兼容端点或支持 gemini 模型的 OpenAI 兼容中转'
  }
}

export interface VendorInfo {
  label: string
  defaultBaseUrl: string
  group: VendorGroup
}

export const VENDOR_INFO: Record<VendorType, VendorInfo> = {
  // 官方厂商：直接使用各家官方 API 接入
  openai: {
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    group: 'official',
  },
  anthropic: {
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    group: 'official',
  },
  google: {
    label: 'Google AI',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    group: 'official',
  },
  // 聚合厂商：通过中转站统一接入多模型
  openrouter: {
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    group: 'aggregator',
  },
  agnes: {
    label: 'Agnes AI',
    defaultBaseUrl: 'https://api.agnes-ai.cn/v1',
    group: 'official',
  },
  ofox: {
    label: 'Ofox',
    defaultBaseUrl: 'https://api.ofox.io/v1',
    group: 'aggregator',
  },
  custom: {
    label: '自定义',
    defaultBaseUrl: '',
    group: 'aggregator',
  },
}

export interface ModelConfig {
  id: string
  name: string
  vendor: VendorType
  /** 仅自定义厂商使用：接入协议（openai/anthropic/gemini） */
  protocol?: CustomProtocol
  apiKey: string
  baseUrl: string
  models: string[]
  defaultModel: string
  isActive: boolean
  status?: string
  latency?: number
  createdAt: string
  updatedAt: string
}

export interface ModelInfo {
  id: string
  name: string
  description?: string
  contextWindow?: number
  maxOutput?: number
}
