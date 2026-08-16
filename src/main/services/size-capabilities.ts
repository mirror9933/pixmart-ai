/**
 * 模型尺寸能力表(后台维护)
 *
 * 数据来源:各模型官方文档与社区验证(2025-2026):
 * - Gemini 图像(imagen/nano-banana):官方支持 10 种比例(早期 beta 仅 6 种,后续扩展 2:3/3:2/4:5/5:4)
 * - DALL·E 3:仅支持 3 种像素
 * - gpt-image-1:仅支持 3 种像素 + auto
 * - Qwen-Image:固定像素档位
 * - 混元:固定像素档位
 * - Agnes:档位 + 比例(常见比例)
 * - 火山方舟 Seedream 系列:档位(1K/1.5K/2K/3K/4K)+ 像素范围,详见 seedream 规则表
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
    ratios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']
  },
  {
    // SiliconFlow 图像模型:按比例放行,后端映射为推荐像素(image_size)
    pattern: /^Qwen\/Qwen-Image|^Kwai-Kolors|^deepseek-ai\/.*image|^stabilityai\/|^black-forest-labs\//i,
    label: 'SiliconFlow 图像',
    ratios: ['1:1', '3:4', '4:3', '3:2', '2:3', '9:16', '16:9', '21:9']
  },
  {
    // 火山方舟 Seedream:走专用档位/像素范围校验(见 checkSeedreamSize)
    pattern: /doubao-seedream/i,
    label: '火山方舟 Seedream'
  },
  {
    // 阿里云百炼 qwen-image 系列:总像素 512*512 ~ 2048*2048,宽高比 1:8 ~ 8:1(官方文档)
    pattern: /^qwen-image|qwen-image-\d|qwen-image\.|^z-image|^zimage|^kling\/|^vidu\//i,
    label: '百炼 qwen-image',
    pixels: ['512x512', '768x768', '1024x1024', '1152x864', '864x1152', '1280x720', '720x1280', '1216x832', '832x1216', '1344x768', '768x1344', '1536x1024', '1024x1536', '1664x928', '928x1664', '2048x2048', '2048x1152', '1152x2048', '2048x1536', '1536x2048']
  },
  {
    // 阿里云百炼 万相 wan 系列:按比例放行,后端映射像素(wan2.6 总像素 1280~1440,其余 512~1440)
    pattern: /^wan|wanx/i,
    label: '百炼 万相 wan',
    ratios: ['1:1', '3:4', '4:3', '3:2', '2:3', '9:16', '16:9', '21:9']
  },
  {
    // MiniMax image-01:官方固定 8 种 aspect_ratio(官方文档)
    pattern: /^image-01/i,
    label: 'MiniMax image-01',
    ratios: ['1:1', '3:4', '4:3', '3:2', '2:3', '9:16', '16:9', '21:9']
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

/* ==================== 火山方舟 Seedream 档位规则 ====================
 * 官方文档(82379/1541523、1824121):
 * - Seedream 5.0 pro:  档位 1K/1.5K/2K;总像素 [1280x720(921600), 2048x2048x1.1025(4624220)]
 * - Seedream 5.0 lite: 档位 2K/3K/4K;总像素 [2560x1440(3686400), 4096x4096(16777216)]
 * - Seedream 4.5:      档位 2K/4K;  总像素 [2560x1440(3686400), 4096x4096(16777216)]
 * - Seedream 4.0:      档位 1K/2K/4K;总像素 [1280x720(921600), 4096x4096(16777216)]
 * 各档位/比例映射像素见官方表格;5.0 pro 的 1.5K 与 1K 同价且效果更优。
 * 注意:5.0 pro 与 lite/4.5/4.0 在 2K 档 16:9 的像素不同(2816x1584 vs 2848x1600),
 *      4.0 的 1K 档 16:9 为 1312x736(其余模型 1424x800)。
 */

/** Seedream 版本档位像素表:tier -> ratio -> "WxH" */
const SEEDREAM_TIERS: Record<string, Record<string, Record<string, string>>> = {
  pro: {
    '1K': {
      '1:1': '1024x1024', '4:3': '1152x864', '3:4': '864x1152',
      '16:9': '1424x800', '9:16': '800x1424',
      '3:2': '1248x832', '2:3': '832x1248', '21:9': '1568x672'
    },
    '1.5K': {
      '1:1': '1536x1536', '4:3': '1792x1344', '3:4': '1344x1792',
      '16:9': '2048x1152', '9:16': '1152x2048',
      '3:2': '1872x1248', '2:3': '1248x1872', '21:9': '2352x1008'
    },
    '2K': {
      '1:1': '2048x2048', '4:3': '2368x1776', '3:4': '1776x2368',
      '16:9': '2816x1584', '9:16': '1584x2816',
      '3:2': '2496x1664', '2:3': '1664x2496', '21:9': '3136x1344'
    }
  },
  lite: {
    '2K': {
      '1:1': '2048x2048', '4:3': '2304x1728', '3:4': '1728x2304',
      '16:9': '2848x1600', '9:16': '1600x2848',
      '3:2': '2496x1664', '2:3': '1664x2496', '21:9': '3136x1344'
    },
    '3K': {
      '1:1': '3072x3072', '4:3': '3456x2592', '3:4': '2592x3456',
      '16:9': '4096x2304', '9:16': '2304x4096',
      '3:2': '3744x2496', '2:3': '2496x3744', '21:9': '4704x2016'
    },
    '4K': {
      '1:1': '4096x4096', '4:3': '4704x3520', '3:4': '3520x4704',
      '16:9': '5504x3040', '9:16': '3040x5504',
      '3:2': '4992x3328', '2:3': '3328x4992', '21:9': '6240x2656'
    }
  }
}
// 4.5 档位像素与 lite 的 2K/4K 一致;4.0 的 1K/2K/4K 中 2K/4K 与 lite 一致,1K 的 16:9/9:16 不同
const SEEDREAM_45_TIERS: Record<string, Record<string, string>> = {
  '2K': SEEDREAM_TIERS.lite['2K'],
  '4K': SEEDREAM_TIERS.lite['4K']
}
const SEEDREAM_40_TIERS: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024', '4:3': '1152x864', '3:4': '864x1152',
    '16:9': '1312x736', '9:16': '736x1312',
    '3:2': '1248x832', '2:3': '832x1248', '21:9': '1568x672'
  },
  '2K': SEEDREAM_TIERS.lite['2K'],
  '4K': SEEDREAM_TIERS.lite['4K']
}

export interface SeedreamProfile {
  /** 模型版本标识(展示用) */
  label: string
  /** 可用档位(按推荐顺序:5.0 pro 的 1.5K 与 1K 同价更优,故 1.5K 在前) */
  tiers: string[]
  /** 像素下限(总像素 = 宽x高) */
  minPixels: number
  /** 像素上限 */
  maxPixels: number
  /** tier -> ratio -> "WxH" */
  pixels: Record<string, Record<string, string>>
}

/** 识别 Seedream 模型版本并返回档位规则(未知返回 null) */
export function getSeedreamProfile(model: string): SeedreamProfile | null {
  if (/doubao-seedream-5-0-pro/i.test(model)) {
    return { label: 'Seedream 5.0 pro', tiers: ['1.5K', '1K', '2K'], minPixels: 921600, maxPixels: 4624220, pixels: SEEDREAM_TIERS.pro }
  }
  if (/doubao-seedream-5-0(-lite)?-260128/i.test(model)) {
    return { label: 'Seedream 5.0 lite', tiers: ['2K', '3K', '4K'], minPixels: 3686400, maxPixels: 16777216, pixels: SEEDREAM_TIERS.lite }
  }
  if (/doubao-seedream-4-5/i.test(model)) {
    return { label: 'Seedream 4.5', tiers: ['2K', '4K'], minPixels: 3686400, maxPixels: 16777216, pixels: SEEDREAM_45_TIERS }
  }
  if (/doubao-seedream-4-0/i.test(model)) {
    return { label: 'Seedream 4.0', tiers: ['1K', '2K', '4K'], minPixels: 921600, maxPixels: 16777216, pixels: SEEDREAM_40_TIERS }
  }
  return null
}

/** 取 Seedream 某档位下最接近给定比例的像素 */
export function seedreamTierPixel(profile: SeedreamProfile, tier: string, ratio: string): string | null {
  const table = profile.pixels[tier]
  if (!table) return null
  const ratioKeys = Object.keys(table)
  const exact = table[ratio]
  if (exact) return exact
  return table[closestRatio(ratioKeys, ratio)] || null
}

/** Seedream 校验:比例→任意档位像素(放行,由后端按清晰度映射);像素→总像素范围校验 */
export function checkSeedreamSize(model: string, size: string): SizeCheckResult {
  const profile = getSeedreamProfile(model)
  if (!profile) return { known: false, supported: true }

  const ratio = size.includes('_') ? size.split('_')[0] : size
  const pixelMatch = ratio.match(/^(\d+)x(\d+)$/)

  // 比例输入:档位表内常见比例都支持(后端会按清晰度映射档位像素)
  if (!pixelMatch) {
    const knownRatio = Object.values(profile.pixels).some(t => t[ratio])
    if (knownRatio) {
      return { known: true, supported: true, suggestions: ['1:1', '3:4', '4:3', '3:2', '2:3', '9:16', '16:9', '21:9'] }
    }
    // 不常见比例(如 1:1 之外):按方向给最低档位保底
    const fallback = seedreamTierPixel(profile, profile.tiers[0], ratio) || '2048x2048'
    return {
      known: true,
      supported: false,
      message: `模型 ${profile.label} 不支持 ${ratio} 尺寸比例`,
      suggestions: ['1:1', '3:4', '4:3', '3:2', '2:3', '9:16', '16:9', '21:9'],
      fallback
    }
  }

  // 像素输入:总像素须在 [minPixels, maxPixels],宽高比 [1/16, 16]
  const w = parseInt(pixelMatch[1], 10)
  const h = parseInt(pixelMatch[2], 10)
  const total = w * h
  const aspect = w / h
  const ratioOk = aspect >= 1 / 16 && aspect <= 16
  if (total >= profile.minPixels && total <= profile.maxPixels && ratioOk) {
    return { known: true, supported: true, suggestions: [`${profile.tiers[0]} 档（推荐）`, ...profile.tiers.slice(1)] }
  }

  // 不在范围内:给最接近的合法档位像素(按比例方向)
  const ratioHint = inferRatioFromWH(w, h)
  const fallback = seedreamTierPixel(profile, profile.tiers[0], ratioHint)
  const reason = total < profile.minPixels
    ? `总像素 ${total.toLocaleString()} 低于模型 ${profile.label} 的最低要求 ${profile.minPixels.toLocaleString()}（约 ${profile.tiers[0]} 档）`
    : total > profile.maxPixels
      ? `总像素 ${total.toLocaleString()} 超出模型 ${profile.label} 的上限 ${profile.maxPixels.toLocaleString()}`
      : `宽高比 ${ratio} 超出模型支持范围`
  return {
    known: true,
    supported: false,
    message: `模型 ${profile.label} 不支持 ${ratio} 尺寸：${reason}`,
    suggestions: [`${profile.tiers[0]} 档（推荐）`, ...profile.tiers.slice(1)],
    fallback: fallback || undefined
  }
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

  // Seedream 系列:走专用档位/像素范围校验
  const seedreamCheck = checkSeedreamSize(model, ratio)
  if (seedreamCheck.known) return seedreamCheck

  const cap = getSizeCapability(model)
  if (!cap) return { known: false, supported: true }

  if (cap.ratios) {
    // 保底重试传像素(如 1792x1024)时换算为比例再查
    const pixelMatch = ratio.match(/^(\d+)x(\d+)$/)
    const normalized = pixelMatch
      ? inferRatioFromWH(parseInt(pixelMatch[1], 10), parseInt(pixelMatch[2], 10))
      : ratio
    if (cap.ratios.includes(normalized)) {
      return { known: true, supported: true, suggestions: cap.ratios }
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
    const pixelSuggestions = cap.pixels.filter(p => p !== 'auto')
    if (cap.pixels.includes(ratio)) {
      return { known: true, supported: true, suggestions: pixelSuggestions }
    }
    // 用户比例 → 方向代表像素,在支持列表中视为近似支持(与历史静默近似一致)
    const rep = representativePixel(ratio)
    if (rep && cap.pixels.includes(rep)) {
      return { known: true, supported: true, suggestions: pixelSuggestions }
    }
    const closest = closestPixel(cap.pixels, ratio)
    return {
      known: true,
      supported: false,
      message: `模型 ${cap.label} 不支持 ${ratio} 尺寸`,
      suggestions: pixelSuggestions,
      fallback: closest || undefined
    }
  }

  return { known: true, supported: true }
}
