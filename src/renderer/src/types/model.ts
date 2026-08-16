export type VendorType = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'agnes' | 'ofox' | 'aihubmix' | 'siliconflow' | 'volcengine' | 'bailian' | 'mimo' | 'kimi' | 'minimax' | 'custom'

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
  // AIHubMix 聚合网关（官方文档:https://docs.aihubmix.com）:
  // OpenAI 兼容端点 https://aihubmix.com/v1（备用 https://api.inferera.com/v1），
  // 图片生成/编辑走 /v1/images/generations + /v1/images/edits，支持 model=auto 智能路由
  aihubmix: {
    label: 'AIHubMix',
    defaultBaseUrl: 'https://aihubmix.com/v1',
    group: 'aggregator',
  },
  // SiliconFlow 硅基流动（官方文档:https://api-docs.siliconflow.cn）:
  // OpenAI 兼容端点 https://api.siliconflow.cn/v1，模型名为「厂商/模型」格式，
  // 图片生成走 /v1/images/generations（参数用 image_size 像素值）
  siliconflow: {
    label: 'SiliconFlow',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    group: 'aggregator',
  },
  // 火山方舟 Volcano Ark（官方文档:https://docs.volcengine.com/docs/82379）:
  // 数据面 API OpenAI 兼容端点 https://ark.cn-beijing.volces.com/api/v3，
  // Bearer API Key 鉴权，模型 ID 形如 doubao-seedream-5-0-pro-260628，
  // 图片生成走 /api/v3/images/generations（Seedream 系列）
  volcengine: {
    label: '火山方舟',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    group: 'official',
  },
  // 阿里云百炼 Bailian / DashScope（官方文档:https://help.aliyun.com/zh/model-studio）:
  // 文本/多模态理解走 OpenAI 兼容端点 https://dashscope.aliyuncs.com/compatible-mode/v1；
  // 图片生成(qwen-image/wan 系列)走 DashScope 原生接口 /api/v1/services/aigc/multimodal-generation/generation
  bailian: {
    label: '阿里云百炼',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    group: 'official',
  },
  // 小米 MiMo（官方文档:https://mimo.mi.com/docs）:
  // OpenAI 兼容端点 https://api.xiaomimimo.com/v1（Token Plan 订阅用 https://token-plan-cn.xiaomimimo.com/v1），
  // 支持 OpenAI + Anthropic 双协议；mimo-v2.5 支持图片/音频/视频理解（image_url），mimo-v2.5-pro 为纯文本
  mimo: {
    label: '小米 MiMo',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
    group: 'official',
  },
  // Kimi（月之暗面，官方文档:https://platform.kimi.com/docs）:
  // OpenAI 兼容端点 https://api.moonshot.cn/v1，Bearer 鉴权；
  // kimi-k3/k2.6/k2.7-code 支持视觉理解（image_url，base64/URL），kimi-k3 上下文 1M
  kimi: {
    label: 'Kimi',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    group: 'official',
  },
  // MiniMax（稀宇科技，官方文档:https://platform.minimaxi.com/docs）:
  // OpenAI 兼容端点 https://api.minimaxi.com/v1（Anthropic 兼容 https://api.minimaxi.com/anthropic）；
  // MiniMax-M3 原生多模态 1M 上下文（image_url）；图片生成 image-01 走 /v1/image_generation（aspect_ratio）
  minimax: {
    label: 'MiniMax',
    defaultBaseUrl: 'https://api.minimaxi.com/v1',
    group: 'official',
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

/** 模型能力标注：auto=自动识别 text=文本对话 image=图片生成 vision=图片理解 */
export type ModelCapability = 'auto' | 'text' | 'image' | 'vision'

/** 单个模型的高级元数据（以模型 id 为 key 保存在配置的 modelMeta 中） */
export interface ModelMeta {
  /** 模型显示别名（用于下拉框等 UI 展示） */
  alias?: string
  /** 能力标注：优先于自动正则识别 */
  capability?: ModelCapability
  /** 上下文窗口（tokens） */
  contextWindow?: number
  /** 最大输出 tokens */
  maxOutput?: number
  /** 备注 */
  note?: string
}

export const CAPABILITY_LABELS: Record<ModelCapability, string> = {
  auto: '自动识别',
  text: '文本对话',
  image: '图片生成',
  vision: '图片理解'
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
  /** 组织 ID（OpenAI 兼容端点常用，如中转站/企业账号） */
  orgId?: string
  /** 自定义请求头（JSON 对象，随每次请求附带，如 X-Api-Key 等） */
  headers?: Record<string, string>
  /** 请求超时（秒），0/缺省 = 使用 SDK 默认值 */
  timeout?: number
  /** 模型级元数据：modelId -> ModelMeta */
  modelMeta?: Record<string, ModelMeta>
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
