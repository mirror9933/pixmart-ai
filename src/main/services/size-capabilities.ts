/**
 * 模型尺寸能力表(后台维护)
 *
 * 数据来源:各模型官方文档与社区验证(2025-2026):
 * - Gemini 图像(imagen/nano-banana):官方仅支持 6 种比例
 * - DALL·E 3:仅支持 3 种像素
 * - gpt-image-1:仅支持 3 种像素 + auto
 * - Qwen-Image:固定像素档位
 * - 混元:固定像素档位
 * - Agnes:档位 + 比例(常见比例)
 *
 * 未知模型(不在表中):按"放行"处理,由失败弹窗与输出校验兜底。
 */

interface SizeCapability {
  /** 匹配的模型名正则 */
  pattern: RegExp
  label: string
  /** 支持的比例(比例格式模型的 size 参数) */
  ratios?: string[]
  /** 支持的像素尺寸 */
  pixels?: string[]
}

/** 按匹配顺序取第一个命中(模型名越具体的规则放前面) */
export const SIZE_CAPABILITIES: SizeCapability[] = [
  {
    pattern: /gemini.*image|imagen|nano[- ]?banana/i,
    label: 'Gemini 图像模型',
    ratios: ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9']
  },
  {
    pattern: /gpt-image-2/i,
    label: 'GPT Image 2',
    pixels: ['1024x1024', '1536x1024', '1024x1536']
  },
  {
    pattern: /^dall-e-3$/i,
    label: 'DALL·E 3',
    pixels: ['1024x1024', '1792x1024', '1024x1792']
  },
  {
    pattern: /gpt-image/i,
    label: 'GPT Image',
    pixels: ['1024x1024', '1536x1024', '1024x1536', 'auto']
  },
  {
    pattern: /qwen.*image|qwen-image/i,
    label: 'Qwen-Image',
    pixels: ['1024x1024', '1280x720', '720x1280', '832x1216', '1216x832', '1024x1536', '1536x1024']
  },
  {
    pattern: /hunyuan/i,
    label: '混元图像',
    pixels: ['1024x1024', '1280x720', '720x1280', '1024x1536', '1536x1024']
  },
  {
    pattern: /agnes.*image|agnes-image/i,
    label: 'Agnes 图像',
    ratios: ['1:1', '3:4', '4:3', '3:2', '2:3', '9:16', '16:9', '21:9']
  }
]

export interface SizeCheckResult {
  /** 是否命中能力表(未知模型为 false,放行) */
  known: boolean
  /** 是否支持该尺寸 */
  supported: boolean
  /** 模型能力说明(不支持时展示给用户) */
  message?: string
  /** 模型支持的尺寸/比例列表 */
  suggestions?: string[]
  /** 建议的保底尺寸(模型最接近的像素或比例) */
  fallback?: string
}

export function getSizeCapability(model: string): SizeCapability | null {
  return SIZE_CAPABILITIES.find(c => c.pattern.test(model)) || null
}

/** 由比例推断最近档位(与 openai.ts 的 ratioFromWH 保持一致) */
function inferRatioFromWH(w: number, h: number): string {
  const r = w / h
  if (r > 1.6) return '16:9'
  if (r > 1.3) return '3:2'
  if (r > 1.1) return '4:3'
  if (r < 0.62) return '9:16'
  if (r < 0.75) return '3:4'
  if (r < 0.9) return '2:3'
  return '1:1'
}

/** 在比例列表中找与给定比例最接近的比例 */
function closestRatio(ratios: string[], ratio: string): string {
  const m = ratio.match(/^(\d+):(\d+)$/)
  const target = m ? parseInt(m[1], 10) / parseInt(m[2], 10) : 1
  let best = ratios[0] || '1:1'
  let bestDiff = Infinity
  for (const r of ratios) {
    const rm = r.match(/^(\d+):(\d+)$/)
    if (!rm) continue
    const rr = parseInt(rm[1], 10) / parseInt(rm[2], 10)
    const diff = Math.abs(rr - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = r
    }
  }
  return best
}

/** 在像素列表中找与给定比例最接近的像素 */
function closestPixel(pixels: string[], ratio: string): string | null {
  const m = ratio.match(/^(\d+):(\d+)$/)
  if (!m) return null
  const target = parseInt(m[1], 10) / parseInt(m[2], 10)
  let best: string | null = null
  let bestDiff = Infinity
  for (const p of pixels) {
    const pm = p.match(/^(\d+)x(\d+)$/)
    if (!pm) continue
    const pr = parseInt(pm[1], 10) / parseInt(pm[2], 10)
    const diff = Math.abs(pr - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = p
    }
  }
  return best
}

/** 按方向取代表像素(用于像素模型的"方向近似"判定:如 DALL·E 3 接受所有横/竖/方比例并近似输出) */
function representativePixel(ratio: string): string | null {
  const m = ratio.match(/^(\d+):(\d+)$/)
  if (!m) return null
  const w = parseInt(m[1], 10)
  const h = parseInt(m[2], 10)
  if (w === h) return '1024x1024'
  return w > h ? '1792x1024' : '1024x1792'
}

/**
 * 校验某模型是否支持某尺寸。
 * - 未知模型:known=false,放行(由失败弹窗与输出校验兜底)
 * - 比例模型:直接查比例列表
 * - 像素模型:用户比例按方向映射代表像素;代表像素在支持列表中视为"近似支持"(与历史行为一致),
 *   不在列表中则明确不支持,并给出模型支持列表与最接近的保底像素
 */
export function checkSizeSupported(model: string, size: string): SizeCheckResult {
  const ratio = size.includes('_') ? size.split('_')[0] : size
  const cap = getSizeCapability(model)
  if (!cap) return { known: false, supported: true }

  if (cap.ratios) {
    // 保底重试传像素(如 1792x1024)时换算为比例再查
    const pixelMatch = ratio.match(/^(\d+)x(\d+)$/)
    const normalized = pixelMatch
      ? inferRatioFromWH(parseInt(pixelMatch[1], 10), parseInt(pixelMatch[2], 10))
      : ratio
    if (cap.ratios.includes(normalized)) {
      return { known: true, supported: true }
    }
    return {
      known: true,
      supported: false,
      message: `模型 ${cap.label} 不支持 ${ratio} 尺寸`,
      suggestions: cap.ratios,
      fallback: closestRatio(cap.ratios, ratio)
    }
  }

  if (cap.pixels) {
    if (cap.pixels.includes(ratio)) {
      return { known: true, supported: true }
    }
    // 用户比例 → 方向代表像素,在支持列表中视为近似支持(与历史静默近似一致)
    const rep = representativePixel(ratio)
    if (rep && cap.pixels.includes(rep)) {
      return { known: true, supported: true }
    }
    const closest = closestPixel(cap.pixels, ratio)
    return {
      known: true,
      supported: false,
      message: `模型 ${cap.label} 不支持 ${ratio} 尺寸`,
      suggestions: cap.pixels.filter(p => p !== 'auto'),
      fallback: closest || undefined
    }
  }

  return { known: true, supported: true }
}
