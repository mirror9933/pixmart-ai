import Anthropic from '@anthropic-ai/sdk'
import type {
  AIProvider,
  ModelConfig,
  ProductAnalysis,
  GeneratedImage,
  GenerateImageOptions,
  AnalyzeOptions,
  ChatMessage,
  ChatContentPart
} from './ai-provider'
import { logger } from '../utils/logger'

function extractError(error: any): string {
  const status = error?.status || error?.code || ''
  const msg = error?.message || error?.error?.message || error?.statusText || ''
  const cause = error?.cause?.message || error?.cause?.code || ''
  return msg || cause || (status ? `HTTP ${status}` : '') || 'Unknown error'
}

export class AnthropicProvider implements AIProvider {
  private client: Anthropic
  private config: ModelConfig

  constructor(config: ModelConfig) {
    this.config = config
    this.client = new Anthropic({
      apiKey: config.api_key,
      baseURL: config.base_url || undefined,
      // 自定义请求头 + 请求超时
      defaultHeaders: (config.headers && Object.keys(config.headers).length > 0) ? config.headers : undefined,
      timeout: config.timeout && config.timeout > 0 ? config.timeout * 1000 : undefined
    })
  }

  private getTextModel(): string {
    const models = this.config.models || []
    // 优先使用用户手动标注:文本对话/图片理解模型均可用于分析
    const tagged = models.find(m => {
      const cap = this.config.model_meta?.[m]?.capability
      return cap === 'text' || cap === 'vision'
    })
    if (tagged) return tagged
    const textModel = models.find(m => /claude|sonnet|haiku|opus/i.test(m))
      || models[0]
    if (textModel) return textModel
    return 'claude-sonnet-4-20250514'
  }

  async analyzeProduct(images: string[], description: string, options?: AnalyzeOptions): Promise<ProductAnalysis> {
    const imageBlocks = images.map(img => ({
      type: 'image' as const,
      source: {
        type: 'url' as const,
        url: img
      }
    }))

    const isReplicate = options?.mode === 'replicate'
    const extra = options?.extra?.trim()

    const taskDesc = isReplicate
      ? `第一张图片是参考设计图（分析其风格：色彩、排版、构图、背景、装饰元素），其余图片是产品素材图（分析产品主体外观）。
任务：在不改变产品主体外观（形状、颜色、材质、结构细节、标志等）的前提下，将参考设计图的风格（色彩、排版、构图、背景、装饰元素、字体风格）应用到产品上，生成电商详情图设计方案。`
      : `你是一个专业的电商图片设计分析师。根据以下产品图片和描述，分析产品特点并生成设计计划。`

    const response = await this.client.messages.create({
      model: this.getTextModel(),
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text' as const,
              text: `${taskDesc}

产品描述：${description || '无'}${extra ? `\n用户补充要求：${extra}` : ''}

请以JSON格式返回分析结果，格式如下：
{
  "title": "项目标题",
  "description": "项目描述",
  "keywords": ["关键词1", "关键词2"],
  "suggestedStyles": ["风格1", "风格2"],
  "productProfile": "产品主体外观特征描述（中文）：基于产品素材图仔细观察，详细描述产品的整体形状、结构、颜色、材质、表面纹理、标志、包装等外观特征，用于后续所有生成图片保持产品主体完全一致",
  "productProfileEn": "产品主体外观特征描述（英文，用英语详细描述产品的整体形状、结构、颜色、材质、表面纹理、标志、包装等，让英文生图模型能精确还原产品主体，要求比 productProfile 更精确、更具体）",
  "colorPalette": [{"name":"主色调","hex":"#4a4a4a"},{"name":"辅助色","hex":"#2c3e6b"},{"name":"背景色","hex":"#f5f0e8"}],
  "fonts": [{"role":"主标题","font":"字体名称+字重","size":"48px"}],
  "visualLanguage": {"elements":"装饰元素描述","iconStyle":"图标风格","corners":"圆角风格","shadow":"阴影描述"},
  "designPlan": [
    {
      "id": "plan-1",
      "title": "设计标题",
      "description": "设计描述",
      "prompt": "详细的英文图片生成提示词，用于其他AI图片生成服务",
      "style": "风格",
      "aspectRatio": "1:1"
    }
  ]
}

请至少包含4个不同的设计方案，每个方案的prompt要用英文撰写，详细描述画面内容、构图、光影、色彩等。注意：productProfile 必须完全基于图片中观察到的真实外观，不要编造看不到的特征。colorPalette 需从整体设计风格中提炼 3-5 个真实配色（含色号）。designPlan 中每个方案的 prompt 都要包含对产品主体外观的精确描述，确保生成时产品本体不变${isReplicate ? '，并融入从参考设计图提取的风格要素' : ''}。`
            }
          ]
        }
      ]
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic')
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Anthropic response')
    }

    try {
      return JSON.parse(jsonMatch[0]) as ProductAnalysis
    } catch {
      throw new Error('Failed to parse AI response as JSON')
    }
  }

  async generateImage(prompt: string, _options?: GenerateImageOptions): Promise<GeneratedImage> {
    const response = await this.client.messages.create({
      model: this.getTextModel(),
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `请为以下图片生成需求撰写一段超级详细、专业的图片生成提示词（英文），可以直接用于 DALL-E 或 Midjourney 等AI绘图工具。

需求：${prompt}

要求：
1. 包含详细的画面描述、构图、光影、色彩
2. 包含摄影/绘画风格描述
3. 包含技术参数建议
4. 输出纯文本提示词，不要额外解释

直接输出提示词内容：`
        }
      ]
    })

    const enhancedPrompt = response.content[0].type === 'text'
      ? response.content[0].text
      : prompt

    return {
      url: '',
      revisedPrompt: enhancedPrompt
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find(m => m.role === 'system')
    const textModel = this.getTextModel()
    const maxOutput = this.config.model_meta?.[textModel]?.maxOutput
    const chatMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => {
        if (Array.isArray(m.content)) {
          // Convert multimodal content parts to Anthropic format
          const blocks: Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'url'; url: string } }> = []
          for (const part of (m as { content: ChatContentPart[] }).content) {
            if (part.type === 'image_url' && part.image_url) {
              blocks.push({
                type: 'image',
                source: { type: 'url', url: part.image_url.url }
              })
            } else if (part.type === 'text' && part.text) {
              blocks.push({ type: 'text', text: part.text })
            }
          }
          return { role: m.role as 'user' | 'assistant', content: blocks }
        }
        return { role: m.role as 'user' | 'assistant', content: m.content as string }
      })

    const response = await this.client.messages.create({
      model: textModel,
      max_tokens: maxOutput && maxOutput > 0 ? maxOutput : 4000,
      system: systemMsg?.content as string | undefined,
      messages: chatMessages as any
    })

    const content = response.content[0]
    return content.type === 'text' ? content.text : ''
  }

  async testConnection(): Promise<{ success: boolean; latency: number; error?: string }> {
    const start = Date.now()
    try {
      await this.client.models.list()
      return { success: true, latency: Date.now() - start }
    } catch (error: any) {
      const msg = extractError(error)
      logger.error(`Anthropic connection test failed: ${msg}`)
      return { success: false, latency: Date.now() - start, error: msg }
    }
  }

  async fetchModels(): Promise<Array<{ id: string; name: string; description?: string; contextWindow?: number; maxOutput?: number }>> {
    try {
      const response = await this.client.models.list()
      const models = response.data
        .filter(m => m.id.includes('claude'))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(m => ({
          id: m.id,
          name: m.id
        }))
      return models
    } catch (error: any) {
      logger.error(`Failed to fetch Anthropic models: ${extractError(error)}`)
      return [
        'claude-sonnet-4-20250514',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229'
      ].map(id => ({ id, name: id }))
    }
  }
}
