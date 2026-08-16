/**
 * AI 调用错误分类与提示
 */

/** 错误是否属于「模型未开通」类(平台控制台未激活/未开通该模型,如火山方舟的 404 activate 提示) */
function isModelNotActivatedError(msg: string): boolean {
  if (!msg) return false
  return /has not activated|not activated the model|activate the model service|please activate|请开通|未开通该模型|模型.*未开通|开通模型/i.test(msg)
}

/** 错误是否属于「模型服务不可用」类(无权限/模型不存在/被禁用等) */
function isModelUnavailableError(msg: string): boolean {
  if (!msg) return false
  return /404|not found|does not exist|no permission|permission denied|forbidden|403|not available|disabled|not enabled|unauthorized|401|无权限|未授权|不存在|已禁用|未启用|model.*not support|does not support|不支持/i.test(msg)
}

/** 错误是否属于「模型能力不足」类(不支持识图/不支持生图/内容格式错误等) */
function isModelCapabilityError(msg: string): boolean {
  if (!msg) return false
  return /(not|unable|cannot|failed).*(image|vision|multimodal|image_url|图片|图像|识图)|(image|vision|multimodal).*(not|unable|cannot|unsupported)|400|invalid.*(image|content)|图片输入|图片内容/i.test(msg)
}

/** 从"模型未开通"类错误中提取模型名(如 doubao-seed-2-1-turbo-260628) */
function extractModelName(msg: string): string | null {
  const m = msg.match(/model\s+([\w.\-/]+)/i)
  return m ? m[1] : null
}

/** 判断是否火山方舟类错误(出现 ark/volces/volcengine 等特征) */
function isVolcengineError(msg: string): boolean {
  return /ark|volces|volcengine/i.test(msg)
}

/**
 * 根据 AI 调用错误生成友好的弹窗消息:
 * - 模型未开通(如火山方舟 404 activate):给出中文开通指引
 * - 模型无权限/不存在:给出针对性提示
 * - 模型能力不足:提示更换文案模型/生图模型
 * - 其他错误:原样展示 + 通用提示
 */
export function buildAiErrorMessage(rawMsg: string, fallback: string, modelType: 'text' | 'image'): string {
  const msg = rawMsg || fallback

  // 1) 模型未开通:直接给中文开通指引(火山方舟等平台需在控制台逐个开通模型)
  if (isModelNotActivatedError(msg)) {
    const modelName = extractModelName(msg)
    const modelPart = modelName ? `「${modelName}」` : '该模型'
    const platformGuide = isVolcengineError(msg)
      ? '1. 打开火山方舟控制台 →「开通管理」页面\n2. 找到该模型并点击「开通」（需同意计费条款）\n3. 开通生效后重新尝试'
      : '请前往该模型平台的「控制台/模型开通」页面开通该模型服务后重试'
    return `模型${modelPart}尚未开通，无法调用。\n\n${platformGuide}`
  }

  // 2) 模型服务不可用(无权限/不存在/被禁用)
  if (isModelUnavailableError(msg)) {
    return `${msg}\n\n该模型当前不可用（可能未开通、无权限或已被平台下线）。可在「设置 → 模型管理」中更换其他模型后重试。`
  }

  // 3) 模型能力不足
  if (isModelCapabilityError(msg)) {
    return `${msg}\n\n如果模型${modelType === 'text' ? '不支持图片识别（识图）' : '不支持图片生成'}，请更换「${modelType === 'text' ? '文案' : '生图'}模型」后重试。`
  }

  // 4) 其他
  return `${msg}\n\n请检查网络与模型配置后重试；如错误持续，可在「设置 → 模型管理」中重新测试连接。`
}
