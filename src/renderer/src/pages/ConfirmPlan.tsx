import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Check, ChevronDown, ChevronUp, ArrowLeft, Sparkles, Palette, Type,
  Layers, Eye, Image as ImageIcon, Loader2, Download, FolderDown, X, AlertCircle
} from 'lucide-react'
import StepIndicator from '@/components/shared/StepIndicator'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Modal from '@/components/ui/Modal'
import ErrorModal from '@/components/shared/ErrorModal'
import { MAIN_MODULE_TYPES } from '@/constants/mainModules'
import { buildAiErrorMessage } from '@/utils/aiError'

const designSections_default = [
  {
    title: '视觉风格',
    icon: Eye,
    content: {
      keywords: '国风、古朴、质感、高端',
      mood: '沉稳大气、古典韵味',
      lighting: '侧光 45°、柔和漫反射',
      texture: '宣纸纹理、微颗粒感'
    }
  },
  {
    title: '色彩系统',
    icon: Palette,
    content: {
      colors: [
        { name: '秦风古灰', hex: '#4a4a4a' },
        { name: '铠甲深蓝', hex: '#2c3e6b' },
        { name: '宣纸米白', hex: '#f5f0e8' },
        { name: '朱砂红', hex: '#c94444' },
        { name: '鎏金', hex: '#d4a853' }
      ]
    }
  },
  {
    title: '字体系统',
    icon: Type,
    content: {
      fonts: [
        { role: '主标题', font: '思源宋体 Bold', size: '48px' },
        { role: '副标题', font: '思源黑体 Medium', size: '24px' },
        { role: '卖点标注', font: '思源黑体 Regular', size: '14px' }
      ]
    }
  },
  {
    title: '视觉语言',
    icon: Layers,
    content: {
      elements: '水墨晕染、云纹装饰、金线勾勒',
      iconStyle: '线性图标、1.5px 描边',
      corners: '圆角 8px、微倒角',
      shadow: '柔和阴影、层次分明'
    }
  }
]

const imagePlans_default = [
  {
    num: 1,
    title: '主图 - 产品正面展示',
    desc: '45° 角侧拍，展示产品全貌，背景为宣纸纹理 + 水墨晕染效果'
  },
  {
    num: 2,
    title: '主图 - 细节特写',
    desc: '微距视角展示材质纹理，突出铠甲深蓝与鎏金工艺细节'
  }
]

/** 加载图片获取实际像素尺寸 */
function getImageSize(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** 前端居中裁剪图片到目标比例(会裁掉画面边缘内容) */
function cropImageToRatio(dataUrl: string, requested: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const m = requested.match(/^(\d+):(\d+)$/) || requested.match(/^(\d+)x(\d+)$/)
      const target = m ? parseInt(m[1], 10) / parseInt(m[2], 10) : 1
      const cur = img.naturalWidth / img.naturalHeight
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (cur > target) w = Math.round(h * target)
      else h = Math.round(w / target)
      const x = Math.round((img.naturalWidth - w) / 2)
      const y = Math.round((img.naturalHeight - h) / 2)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) { resolve(dataUrl); return }
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h)
      resolve(c.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

/** 比较请求尺寸(比例 w:h 或像素 WxH)与实际图片比例是否一致(容差 15%) */
function ratioMatches(requested: string, actualW: number, actualH: number): boolean {
  const m = requested.match(/^(\d+):(\d+)$/)
  const mp = requested.match(/^(\d+)x(\d+)$/)
  const expected = m
    ? parseInt(m[1], 10) / parseInt(m[2], 10)
    : mp
      ? parseInt(mp[1], 10) / parseInt(mp[2], 10)
      : 0
  if (!expected) return true
  const actual = actualW / actualH
  return Math.abs(actual - expected) / expected <= 0.15
}

/** 按目标数量展开规划:数量多于方案数时循环复用方案,少于时截取 */
function expandPlansToQuantity(
  plans: Array<{ num: number; id: string; title: string; desc: string; prompt: string }>,
  quantity: number
): Array<{ num: number; id: string; title: string; desc: string; prompt: string }> {
  if (!quantity || quantity <= 0 || plans.length === 0) return plans
  const result: Array<{ num: number; id: string; title: string; desc: string; prompt: string }> = []
  for (let i = 0; i < quantity; i++) {
    const p = plans[i % plans.length]
    const round = Math.floor(i / plans.length)
    result.push({
      ...p,
      num: result.length + 1,
      id: `${p.id || p.num}-${i + 1}`,
      title: quantity > plans.length ? `${p.title} ${round + 1}` : p.title
    })
  }
  return result
}

/** 按用户在需求输入阶段选择的模块展开图片规划:每个模块按其数量生成多张 */
function buildMainImagePlans(
  modules: Record<string, number> | null | undefined,
  moduleTypes: Array<{ key: string; title: string; desc: string; prompt: string }> = MAIN_MODULE_TYPES
) {
  // 兼容旧入口(无模块选择):默认每类 1 张
  if (!modules || Object.keys(modules).length === 0) {
    return moduleTypes.map((plan, i) => ({
      num: i + 1,
      id: `main-plan-${i + 1}`,
      title: plan.title,
      desc: plan.desc,
      prompt: plan.prompt
    }))
  }
  const plans: Array<{ num: number; id: string; title: string; desc: string; prompt: string }> = []
  for (const type of moduleTypes) {
    const count = modules[type.key] || 0
    for (let i = 1; i <= count; i++) {
      plans.push({
        num: plans.length + 1,
        id: `${type.key}-${i}`,
        title: count > 1 ? `${type.title} ${i}` : type.title,
        desc: type.desc,
        prompt: type.prompt
      })
    }
  }
  return plans
}

export default function ConfirmPlan() {
  const navigate = useNavigate()
  const location = useLocation()
  const analysisResult = location.state?.result
  const projectIdFromState = location.state?.projectId || ''
  const selectedImageModel = location.state?.imageModel || ''
  const selectedSize = location.state?.size || '1:1'
  const targetPlatform = location.state?.platform || 'tmall'
  const targetQuality = location.state?.quality || 'standard'
  const targetQuantity = location.state?.quantity || 1
  const targetLanguage = location.state?.language || 'zh'
  const activeTabFromState = location.state?.activeTab || '主图'
  // 产品主体一致性：参考图与产品主体特征描述（来自分析结果）
  const referenceImages = location.state?.referenceImages || []
  const styleImages = location.state?.styleImages || []
  const productProfile = location.state?.productProfile || ''
  const productProfileEn = location.state?.productProfileEn || ''
  const extraPrompt = location.state?.extraPrompt || ''
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]))
  const [generating, setGenerating] = useState(false)
  const [quality, setQuality] = useState(targetQuality)
  const [platform, setPlatform] = useState(targetPlatform)
  const [selectedPlans, setSelectedPlans] = useState<Set<number>>(new Set())

  const [generatedImages, setGeneratedImages] = useState<any[]>([])
  const [generateDone, setGenerateDone] = useState(false)
  const taskIdsRef = useRef<string[]>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState('')

  // Listen for task status updates
  useEffect(() => {
    const unsub = window.api.ai.onTaskUpdate((task: any) => {
      if (!taskIdsRef.current.includes(task.id)) return
      // 任务失败(如模型不支持生图/尺寸):弹窗提示一次
      if (task.status === 'failed' && !failedShownRef.current) {
        failedShownRef.current = true
        const errMsg = task.error || ''
        if (errMsg.startsWith('SIZE_NOT_SUPPORTED')) {
          // 模型不支持当前尺寸:弹窗让用户选择是否按保底尺寸生成,并展示模型支持的尺寸
          const supportMatch = errMsg.match(/支持：(.+)$/)
          const suggestions = supportMatch ? supportMatch[1].split(/[、,，]/).filter(Boolean) : undefined
          setSizeFallback({ requested: pixelSize, fallback: fallbackSizeFor(pixelSize), suggestions })
        } else {
          setErrorModal({
            title: '图片生成失败',
            message: buildAiErrorMessage(errMsg, '任务失败', 'image')
          })
        }
      }
      if (task.status === 'completed' || task.status === 'failed') {
        setGeneratedImages(prev => {
          if (prev.some(t => t.id === task.id)) return prev
          const next = [...prev, task]
          // Check if all done
          if (taskIdsRef.current.every(id =>
            id === task.id ? true : next.some(t => t.id === id)
          )) {
            setGenerating(false)
            setGenerateDone(true)
          }
          return next
        })
        // 生成后校验实际输出尺寸是否与请求一致(捕获模型静默忽略尺寸的情况)
        checkTaskSize(task)
      }
    })
    return unsub
  }, [])
  const designSections = analysisResult ? [
    {
      title: '视觉风格',
      icon: Eye,
      content: {
        keywords: analysisResult.keywords?.join('、') || '',
        mood: analysisResult.suggestedStyles?.join('、') || '',
        lighting: '',
        texture: ''
      }
    },
    {
      title: '色彩系统',
      icon: Palette,
      content: {
        colors: analysisResult.colorPalette?.length
          ? analysisResult.colorPalette
          : [
              { name: '主色调', hex: '#4a4a4a' },
              { name: '辅助色', hex: '#2c3e6b' },
              { name: '背景色', hex: '#f5f0e8' },
            ]
      }
    },
    {
      title: '字体系统',
      icon: Type,
      content: {
        fonts: analysisResult.fonts?.length
          ? analysisResult.fonts
          : [
              { role: '主标题', font: '系统推荐', size: '48px' },
              { role: '副标题', font: '系统推荐', size: '24px' },
              { role: '卖点标注', font: '系统推荐', size: '14px' }
            ]
      }
    },
    {
      title: '视觉语言',
      icon: Layers,
      content: analysisResult.visualLanguage
        ? analysisResult.visualLanguage
        : {
            elements: '系统推荐',
            iconStyle: '线性图标',
            corners: '圆角',
            shadow: '柔和阴影'
          }
    }
  ] : designSections_default

  // 主图/详情图流程:按需求输入阶段选择的模块(内置含用户提示词覆盖 + 自定义 × 各自数量)展开规划;
  // 其余流程(广告图/风格复刻)仍使用 AI 分析出的设计规划
  const isModuleTab = activeTabFromState === '主图' || activeTabFromState === '详情图'
  const mainModules = (location.state?.mainModules as Record<string, number> | null | undefined) || null
  const moduleTypesFromState = (location.state?.moduleTypes as Array<{ key: string; title: string; desc: string; prompt: string }> | undefined)
  const moduleTypes = moduleTypesFromState && moduleTypesFromState.length > 0 ? moduleTypesFromState : MAIN_MODULE_TYPES
  // 广告图/风格复刻:按用户在需求输入阶段选择的生成数量展开规划(循环复用 AI 方案)
  const isQuantityTab = activeTabFromState === '广告图' || activeTabFromState === '单图复刻'
  const basePlans = analysisResult?.designPlan?.length
    ? analysisResult.designPlan.map((plan: any, i: number) => ({
        num: i + 1,
        id: plan.id || `plan-${i + 1}`,
        title: plan.title || `方案 ${i + 1}`,
        desc: plan.description || plan.prompt || '',
        prompt: plan.prompt || '',
        style: plan.style || ''
      }))
    : imagePlans_default
  const imagePlans = isModuleTab
    ? buildMainImagePlans(mainModules, moduleTypes)
    : isQuantityTab
      ? expandPlansToQuantity(basePlans, targetQuantity)
      : basePlans

  // 错误弹窗(模型未选 / 生成失败 / 模型不支持生图等)
  const [errorModal, setErrorModal] = useState<{ title?: string; message: string } | null>(null)
  const failedShownRef = useRef(false)
  // 本次生成请求的尺寸(用于生成后校验实际输出)
  const lastRequestedSizeRef = useRef<string>('')
  // 尺寸不符弹窗(模型静默忽略尺寸时提示)与防重复标记
  const [sizeMismatchModal, setSizeMismatchModal] = useState<{ requested: string; actualW: number; actualH: number; suggestions?: string[]; taskId?: string } | null>(null)
  const sizeNotifiedRef = useRef(false)

  /** 生成完成后校验实际输出尺寸是否与请求一致(不依赖模型报错,能捕获模型静默忽略尺寸的情况) */
  const checkTaskSize = async (task: any) => {
    if (task.status !== 'completed' || !task.result?.url) return
    const requested = lastRequestedSizeRef.current
    if (!requested) return
    const size = await getImageSize(task.result.url)
    if (!size) return
    if (ratioMatches(requested, size.w, size.h)) return
    // 实际尺寸与请求不符:标注该任务,并弹窗提示一次
    setGeneratedImages(prev => prev.map(t =>
      t.id === task.id ? { ...t, sizeMismatch: { requested, actualW: size.w, actualH: size.h } } : t
    ))
    if (!sizeNotifiedRef.current) {
      sizeNotifiedRef.current = true
      // 查询该模型支持的尺寸列表,弹窗中一并展示
      let suggestions: string[] | undefined
      try {
        const check = await window.api.ai.checkSize({ model: selectedImageModel, size: requested })
        suggestions = check.suggestions
      } catch {}
      setSizeMismatchModal({ requested, actualW: size.w, actualH: size.h, suggestions, taskId: task.id })
    }
  }

  const generateWithSize = async (size: string) => {
    if (generating || !projectIdFromState) return
    // 模型必选校验:图片生成需要生图模型
    if (!selectedImageModel) {
      setErrorModal({
        title: '请先选择模型',
        message: '请先在「生图模型」中选择一个支持图片生成的模型（返回上一步设置），再开始生成。'
      })
      return
    }
    // 生成前按模型尺寸能力表校验:明确不支持时直接弹窗,不再浪费一次 API 调用
    try {
      const check = await window.api.ai.checkSize({ model: selectedImageModel, size })
      if (check.known && !check.supported) {
        setSizeFallback({
          requested: size,
          fallback: check.fallback || fallbackSizeFor(size),
          suggestions: check.suggestions
        })
        return
      }
    } catch {}
    const toGenerate = selectedPlans.size > 0
      ? imagePlans.filter((_: any, i: number) => selectedPlans.has(i))
      : imagePlans
    if (!toGenerate?.length) return
    lastRequestedSizeRef.current = size
    sizeNotifiedRef.current = false
    failedShownRef.current = false
    setGenerating(true)
    setGenerateDone(false)
    setGeneratedImages([])
    try {
      const prompts = toGenerate.map((plan: any) => ({
        id: plan.id || '',
        prompt: plan.prompt || plan.title || '',
        style: plan.style || '',
        size
      }))
      const response = await window.api.ai.generateImages({
        projectId: projectIdFromState,
        prompts,
        quality,
        model: selectedImageModel,
        referenceImages,
        styleImages,
        productProfile,
        productProfileEn,
        extraPrompt
      })
      taskIdsRef.current = response.taskIds || []
      // generating stays true until task updates set generateDone
    } catch (err: any) {
      setGenerating(false)
      setErrorModal({
        title: '提交生成失败',
        message: buildAiErrorMessage(err?.message || '未知错误', '提交生成失败', 'image')
      })
    }
  }

  const handleGenerate = () => { generateWithSize(pixelSize) }

  // 尺寸不支持弹窗:模型不支持用户所选尺寸时,让用户选择是否按保底尺寸生成
  const [sizeFallback, setSizeFallback] = useState<{ requested: string; fallback: string; suggestions?: string[] } | null>(null)

  const handleFallbackGenerate = () => {
    if (!sizeFallback) return
    const fb = sizeFallback.fallback
    setSizeFallback(null)
    generateWithSize(fb)
  }

  // 尺寸不符(模型静默忽略尺寸):按保底尺寸重新生成
  const handleMismatchFallback = () => {
    if (!sizeMismatchModal) return
    const fb = fallbackSizeFor(sizeMismatchModal.requested)
    setSizeMismatchModal(null)
    generateWithSize(fb)
  }

  // 尺寸不符:同比例重新生成一次
  const handleMismatchRetry = () => {
    if (!sizeMismatchModal) return
    const r = sizeMismatchModal.requested
    setSizeMismatchModal(null)
    generateWithSize(r)
  }

  // 尺寸不符:前端居中裁剪当前结果图到目标比例(会裁掉画面边缘内容)
  const handleMismatchCrop = async () => {
    if (!sizeMismatchModal) return
    const { taskId, requested } = sizeMismatchModal
    const task = generatedImages.find(t => t.id === taskId)
    setSizeMismatchModal(null)
    if (!task || !task.result?.url) return
    const cropped = await cropImageToRatio(task.result.url, requested)
    setGeneratedImages(prev => prev.map(t =>
      t.id === taskId && t.result ? { ...t, result: { ...t.result, url: cropped } } : t
    ))
  }

  // Initialize all plans selected on first render
  if (selectedPlans.size === 0 && imagePlans.length > 0) {
    setSelectedPlans(new Set(imagePlans.map((_: any, i: number) => i)))
  }

  const downloadImage = async (dataUrl: string) => {
    try {
      // Save to configured exports path via IPC
      const res = await window.api.files.saveToExports(dataUrl)
      if (res?.path) {
        window.api.files.openPath(res.path)
      }
    } catch {
      // Fallback: browser download
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `generated-${Date.now()}.png`
      link.click()
    }
  }

  const saveToProject = async (dataUrl: string) => {
    try {
      await window.api.files.saveImageFromDataUrl(projectIdFromState, dataUrl)
      savedUrlsRef.current.add(dataUrl)
      setSaveMsg('已保存到项目记录')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch {
      downloadImage(dataUrl)
    }
  }

  // 一键保存到项目:保存所有生成成功的图片(跳过已保存的),并标记防重复
  const [savingAll, setSavingAll] = useState(false)
  const savedUrlsRef = useRef<Set<string>>(new Set())

  const saveAllToProject = async () => {
    if (savingAll) return
    const urls = generatedImages
      .filter((t: any) => t.result?.url && !savedUrlsRef.current.has(t.result.url))
      .map((t: any) => t.result.url)
    if (urls.length === 0) {
      setSaveMsg('图片已全部保存')
      setTimeout(() => setSaveMsg(''), 2000)
      return
    }
    setSavingAll(true)
    let saved = 0
    try {
      for (const url of urls) {
        try {
          await window.api.files.saveImageFromDataUrl(projectIdFromState, url)
          savedUrlsRef.current.add(url)
          saved++
        } catch {}
      }
      setSaveMsg(`已保存 ${saved} 张图片到项目记录`)
    } finally {
      setSavingAll(false)
    }
    setTimeout(() => setSaveMsg(''), 2000)
  }

  // 用户选择的尺寸(比例)原样传给后端,不做静默转换;
  // 模型不支持该尺寸时,后端返回 SIZE_NOT_SUPPORTED 标记,由前端弹窗让用户选择是否按保底尺寸生成
  const ratio = selectedSize.includes('_') ? selectedSize.split('_')[0] : selectedSize
  const pixelSize = ratio

  // 保底尺寸:按比例方向取模型通用像素(横版 1792x1024 / 竖版 1024x1792 / 方形 1024x1024)
  const fallbackSizeFor = (r: string): string => {
    const m = r.match(/^(\d+):(\d+)$/)
    if (!m) return '1024x1024'
    const w = parseInt(m[1], 10)
    const h = parseInt(m[2], 10)
    if (w === h) return '1024x1024'
    return w > h ? '1792x1024' : '1024x1792'
  }

  const imageCount = imagePlans.length

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="anim-fade-in" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: 'var(--fg)',
          margin: '0 0 6px 0',
          fontFamily: 'var(--font-display)'
        }}>
          {analysisResult?.title || 'AI 全品类商品图'}
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--fg-muted)', margin: 0 }}>
          {analysisResult ? analysisResult.description?.slice(0, 80) + '...' : 'AI 已完成设计规划，请确认后开始生成'}
        </p>
      </div>

      {/* Save success toast */}
      {saveMsg && (
        <div style={{
          position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 150, padding: '8px 16px', borderRadius: 'var(--radius-sm)',
          background: '#dcfce7', color: '#166534', fontSize: '12px', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: '6px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
        }}>
          <Check size={13} />
          {saveMsg}
        </div>
      )}

      <div style={{ marginBottom: '24px' }}>
        <StepIndicator currentStep={generateDone ? 5 : generating ? 4 : 3} />
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        <div style={{
          flex: '0 0 40%',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
            padding: '10px',
            background: 'var(--bg-muted)',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--brand-glow)',
              border: '2px solid var(--brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}>
              <ImageIcon size={20} style={{ color: 'var(--brand)' }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', margin: '0 0 2px 0' }}>
                产品图已上传
              </p>
              <p style={{ fontSize: '11px', color: 'var(--fg-muted)', margin: 0 }}>
                1 张图片已就绪
              </p>
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>目标平台</label>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-muted)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              color: 'var(--fg)',
              fontWeight: 500
            }}>
              {platform === 'tmall' ? '天猫' : platform === 'taobao' ? '淘宝' : platform === 'jd' ? '京东' : platform === 'pinduoduo' ? '拼多多' : platform === 'douyin' ? '抖音' : platform === 'xiaohongshu' ? '小红书' : platform === 'kuaishou' ? '快手' : platform}
            </div>
          </div>

          {activeTabFromState === '详情图' && (
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>诉求</label>
              <div style={{
                padding: '8px 12px',
                background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                color: 'var(--fg)',
                fontWeight: 500, maxHeight: '60px', overflow: 'auto'
              }}>
                {analysisResult?.description || '-'}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>输出质量</label>
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-muted)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              color: 'var(--fg)',
              fontWeight: 500
            }}>
              {quality === 'standard' ? '标准' : quality === 'hd' ? '高清' : quality === '2k' ? '2K 超清' : quality === '4k' ? '4K 超清' : quality}
            </div>
          </div>

          <div style={{ marginBottom: '14px', display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>目标语言</label>
              <div style={{
                padding: '8px 12px', background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-md)', fontSize: '13px',
                color: 'var(--fg)', fontWeight: 500
              }}>
                {targetLanguage === 'zh' ? '中文' : targetLanguage === 'en' ? 'English' : targetLanguage === 'ja' ? '日本語' : targetLanguage === 'ko' ? '한국어' : targetLanguage}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>需求类型</label>
              <div style={{
                padding: '8px 12px', background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-md)', fontSize: '13px',
                color: 'var(--fg)', fontWeight: 500
              }}>
                {activeTabFromState}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '14px', display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>图片尺寸</label>
              <div style={{
                padding: '8px 12px', background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-md)', fontSize: '13px',
                color: 'var(--fg)', fontWeight: 500
              }}>
                {location.state?.sizeLabel || selectedSize.replace(/_/g, ' ')}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>生成数量</label>
              <div style={{
                padding: '8px 12px', background: 'var(--bg-muted)',
                borderRadius: 'var(--radius-md)', fontSize: '13px',
                color: 'var(--fg)', fontWeight: 500
              }}>
                {targetQuantity} 张
              </div>
            </div>
          </div>

          <Button variant="primary" onClick={handleGenerate} disabled={generating} style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <Sparkles size={16} />
            {generating ? '生成中...' : `确认生成 ${selectedPlans.size || imagePlans.length} 张图片`}
          </Button>

          <button
            onClick={() => navigate('/', { state: { restore: true } })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: 'var(--fg-muted)',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '4px 0'
            }}
          >
            <ArrowLeft size={14} />
            返回上一步
          </button>
        </div>

        {/* Right: Design Preview / Generating / Results */}
        <div style={{ flex: '0 0 60%', minWidth: 0 }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '20px'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px'
            }}>
              <Sparkles size={18} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--fg)' }}>
                {generating || generateDone ? '生成结果' : '设计规划预览'}
              </span>
            </div>

            {(generating || generateDone) ? (
              <>
                {generating && (
                  <div style={{
                    textAlign: 'center', padding: '60px 20px 40px',
                    border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-muted)', marginBottom: '16px',
                    position: 'relative', overflow: 'hidden', minHeight: '200px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <style>{`
                      .speeder-loader { position: relative; width: 140px; height: 60px; margin: 0 auto 16px; }
                      .speeder-loader .loader { position: absolute; top: 50%; left: 50%; margin-left: -50px; animation: speederDeco 0.4s linear infinite; }
                      .speeder-loader .loader > span { height: 5px; width: 35px; background: var(--brand); position: absolute; top: -19px; left: 60px; border-radius: 2px 10px 1px 0; }
                      .speeder-loader .base span { position: absolute; width: 0; height: 0; border-top: 6px solid transparent; border-right: 100px solid var(--brand); border-bottom: 6px solid transparent; }
                      .speeder-loader .base span::before { content: ""; height: 22px; width: 22px; border-radius: 50%; background: var(--brand); position: absolute; right: -110px; top: -16px; }
                      .speeder-loader .base span::after { content: ""; position: absolute; width: 0; height: 0; border-top: 0 solid transparent; border-right: 55px solid var(--brand); border-bottom: 16px solid transparent; top: -16px; right: -98px; }
                      .speeder-loader .face { position: absolute; height: 12px; width: 20px; background: var(--brand); border-radius: 20px 20px 0 0; transform: rotate(-40deg); right: -125px; top: -15px; }
                      .speeder-loader .face::after { content: ""; height: 12px; width: 12px; background: var(--brand); right: 4px; top: 7px; position: absolute; transform: rotate(40deg); transform-origin: 50% 50%; border-radius: 0 0 0 2px; }
                      .speeder-loader .loader > span > span { width: 30px; height: 1px; background: var(--brand); position: absolute; animation: fazer1Deco 0.2s linear infinite; }
                      .speeder-loader .loader > span > span:nth-child(2) { top: 3px; animation: fazer2Deco 0.4s linear infinite; }
                      .speeder-loader .loader > span > span:nth-child(3) { top: 1px; animation: fazer3Deco 0.4s linear infinite; animation-delay: -1s; }
                      .speeder-loader .loader > span > span:nth-child(4) { top: 4px; animation: fazer4Deco 1s linear infinite; animation-delay: -1s; }
                      .speeder-loader .longfazers { position: absolute; width: 100%; height: 100%; top: 0; left: 0; }
                      .speeder-loader .longfazers span { position: absolute; height: 2px; width: 20%; background: var(--brand); opacity: 0.4; }
                      .speeder-loader .longfazers span:nth-child(1) { top: 20%; animation: lfDeco 0.6s linear infinite; animation-delay: -5s; }
                      .speeder-loader .longfazers span:nth-child(2) { top: 40%; animation: lf2Deco 0.8s linear infinite; animation-delay: -1s; }
                      .speeder-loader .longfazers span:nth-child(3) { top: 60%; animation: lf3Deco 0.6s linear infinite; }
                      .speeder-loader .longfazers span:nth-child(4) { top: 80%; animation: lf4Deco 0.5s linear infinite; animation-delay: -3s; }
                      @keyframes speederDeco { 0%{transform:translate(2px,1px) rotate(0deg)} 10%{transform:translate(-1px,-3px) rotate(-1deg)} 20%{transform:translate(-2px,0px) rotate(1deg)} 30%{transform:translate(1px,2px) rotate(0deg)} 40%{transform:translate(1px,-1px) rotate(1deg)} 50%{transform:translate(-1px,3px) rotate(-1deg)} 60%{transform:translate(-1px,1px) rotate(0deg)} 70%{transform:translate(3px,1px) rotate(-1deg)} 80%{transform:translate(-2px,-1px) rotate(1deg)} 90%{transform:translate(2px,1px) rotate(0deg)} 100%{transform:translate(1px,-2px) rotate(-1deg)} }
                      @keyframes fazer1Deco { 0%{left:0} 100%{left:-80px;opacity:0} }
                      @keyframes fazer2Deco { 0%{left:0} 100%{left:-100px;opacity:0} }
                      @keyframes fazer3Deco { 0%{left:0} 100%{left:-50px;opacity:0} }
                      @keyframes fazer4Deco { 0%{left:0} 100%{left:-150px;opacity:0} }
                      @keyframes lfDeco { 0%{left:200%} 100%{left:-200%;opacity:0} }
                      @keyframes lf2Deco { 0%{left:200%} 100%{left:-200%;opacity:0} }
                      @keyframes lf3Deco { 0%{left:200%} 100%{left:-100%;opacity:0} }
                      @keyframes lf4Deco { 0%{left:200%} 100%{left:-100%;opacity:0} }
                    `}</style>
                    <div className="speeder-loader">
                      <div className="loader">
                        <span><span /><span /><span /><span /></span>
                        <div className="base">
                          <span />
                          <div className="face" />
                        </div>
                      </div>
                      <div className="longfazers">
                        <span /><span /><span /><span />
                      </div>
                    </div>
                    <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg)', margin: '0 0 8px 0' }}>
                      正在生成图片...
                    </p>
                    <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: '0 0 16px 0' }}>
                      {taskIdsRef.current.length > 0
                        ? `已完成 ${generatedImages.length} / ${taskIdsRef.current.length} 张`
                        : '正在准备生成...'}
                    </p>
                    <div style={{
                      maxWidth: '300px', width: '100%', height: '4px',
                      background: 'var(--border)', borderRadius: '2px', overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%', background: 'var(--brand)',
                        width: `${taskIdsRef.current.length > 0 ? (generatedImages.length / taskIdsRef.current.length) * 100 : 0}%`,
                        transition: 'width 0.3s ease', borderRadius: '2px'
                      }} />
                    </div>
                  </div>
                )}

                {generateDone && (
                  <>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '12px'
                    }}>
                      <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                        共 {generatedImages.length} 张生成完成
                      </p>
                      <Button variant="primary" size="sm" onClick={saveAllToProject} disabled={savingAll} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <FolderDown size={13} />
                        {savingAll ? '保存中...' : '一键保存到项目'}
                      </Button>
                    </div>
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                      gap: '10px', marginBottom: '16px'
                    }}>
                      {generatedImages.map((task: any) => (
                      <div key={task.id} style={{
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        overflow: 'hidden', background: 'var(--bg-muted)'
                      }}>
                        <div style={{
                          aspectRatio: '1', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', background: 'var(--bg-surface)',
                          position: 'relative', overflow: 'hidden'
                        }}>
                          {task.result?.url ? (
                            <>
                              <img src={task.result.url} alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <button
                                onClick={() => setPreviewImage(task.result.url)}
                                title="预览"
                                style={{
                                  position: 'absolute', top: '4px', left: '4px',
                                  width: '24px', height: '24px', borderRadius: '4px',
                                  background: 'rgba(0,0,0,0.5)', border: 'none',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  cursor: 'pointer', opacity: 0.8
                                }}
                              >
                                <Eye size={12} style={{ color: '#fff' }} />
                              </button>
                            </>
                          ) : (
                            <ImageIcon size={24} style={{ color: 'var(--fg-muted)', opacity: 0.3 }} />
                          )}
                        </div>
                        <div style={{
                          padding: '4px', display: 'flex', gap: '4px',
                          borderTop: '1px solid var(--border-subtle)'
                        }}>
                          {task.result?.url && (
                            <>
                              <button
                                onClick={() => downloadImage(task.result.url)}
                                title="下载"
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  gap: '3px', padding: '5px 2px', fontSize: '11px', fontWeight: 500,
                                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                                  background: 'var(--bg-muted)', color: 'var(--fg-secondary)'
                                }}
                              >
                                <Download size={11} /> 下载
                              </button>
                              <button
                                onClick={() => saveToProject(task.result.url)}
                                title="保存到项目"
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  gap: '3px', padding: '5px 2px', fontSize: '11px', fontWeight: 500,
                                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                                  background: 'var(--brand-glow)', color: 'var(--brand)'
                                }}
                              >
                                <FolderDown size={11} /> 保存
                              </button>
                            </>
                          )}
                        </div>
                        {task.sizeMismatch && (
                          <div style={{
                            padding: '3px 6px', fontSize: '10px', color: '#b45309',
                            background: 'rgba(180,83,9,0.1)', textAlign: 'center',
                            borderTop: '1px solid var(--border-subtle)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                          }}>
                            实际 {task.sizeMismatch.actualW}×{task.sizeMismatch.actualH}（请求 {task.sizeMismatch.requested}）
                          </div>
                        )}
                        {task.status === 'failed' && (
                          <div style={{
                            fontSize: '11px', color: 'var(--danger)', textAlign: 'center',
                            padding: '5px 4px', borderTop: '1px solid var(--border-subtle)'
                          }}>
                            生成失败
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Design Sections */}
                <div style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  marginBottom: '16px'
                }}>
                  <div
                    onClick={() => toggleSection(0)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      background: expandedSections.has(0) ? 'var(--brand-glow)' : 'transparent',
                      borderBottom: expandedSections.has(0) ? '1px solid var(--border-subtle)' : 'none'
                    }}
                  >
                    <span style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: expandedSections.has(0) ? 'var(--brand)' : 'var(--fg)'
                    }}>
                      整体设计规范
                    </span>
                    {expandedSections.has(0) ? (
                      <ChevronUp size={16} style={{ color: 'var(--fg-muted)' }} />
                    ) : (
                      <ChevronDown size={16} style={{ color: 'var(--fg-muted)' }} />
                    )}
                  </div>

                  {expandedSections.has(0) && (
                    <div style={{ padding: '16px' }}>
                      {designSections.map((section, i) => {
                        const Icon = section.icon
                        return (
                          <div key={i} style={{ marginBottom: i < designSections.length - 1 ? '16px' : 0 }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginBottom: '10px'
                            }}>
                              <span style={{
                                width: '22px',
                                height: '22px',
                                borderRadius: 'var(--radius-full)',
                                background: 'var(--brand)',
                                color: '#fff',
                                fontSize: '11px',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                {i + 1}
                              </span>
                              <Icon size={14} style={{ color: 'var(--brand)' }} />
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>
                                {section.title}
                              </span>
                            </div>

                            {section.title === '色彩系统' && 'colors' in section.content && (
                              <div style={{
                                display: 'flex',
                                gap: '10px',
                                paddingLeft: '30px'
                              }}>
                                {section.content.colors.map((color) => (
                                  <div key={color.hex} style={{ textAlign: 'center' }}>
                                    <div style={{
                                      width: '40px',
                                      height: '40px',
                                      borderRadius: 'var(--radius-md)',
                                      background: color.hex,
                                      border: '2px solid var(--border)',
                                      margin: '0 auto 4px'
                                    }} />
                                    <span style={{ fontSize: '10px', color: 'var(--fg-muted)', display: 'block' }}>
                                      {color.name}
                                    </span>
                                    <span style={{ fontSize: '10px', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                                      {color.hex}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {section.title === '字体系统' && 'fonts' in section.content && (
                              <div style={{ paddingLeft: '30px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {section.content.fonts.map((f) => (
                                  <div key={f.role} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    fontSize: '12px'
                                  }}>
                                    <span style={{
                                      color: 'var(--fg-muted)',
                                      minWidth: '60px'
                                    }}>{f.role}</span>
                                    <span style={{ color: 'var(--fg)', fontWeight: 500 }}>{f.font}</span>
                                    <span style={{ color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
                                      {f.size}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {section.title === '视觉风格' && 'keywords' in section.content && (
                              <div style={{ paddingLeft: '30px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {([
                                  ['关键词', section.content.keywords],
                                  ['情绪', section.content.mood],
                                  ['光照', section.content.lighting],
                                  ['质感', section.content.texture]
                                ] as const).map(([label, value]) => (
                                  <div key={label} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    fontSize: '12px'
                                  }}>
                                    <span style={{ color: 'var(--fg-muted)', minWidth: '60px' }}>{label}</span>
                                    <span style={{ color: 'var(--fg)' }}>{value}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {section.title === '视觉语言' && 'elements' in section.content && (
                              <div style={{ paddingLeft: '30px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {([
                                  ['装饰元素', section.content.elements],
                                  ['图标风格', section.content.iconStyle],
                                  ['圆角', section.content.corners],
                                  ['阴影', section.content.shadow]
                                ] as const).map(([label, value]) => (
                                  <div key={label} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    fontSize: '12px'
                                  }}>
                                    <span style={{ color: 'var(--fg-muted)', minWidth: '60px' }}>{label}</span>
                                    <span style={{ color: 'var(--fg)' }}>{value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Image Plans Section */}
                <div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px'
                  }}>
                    <ImageIcon size={16} style={{ color: 'var(--brand)' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
                      图片规划 ({imagePlans.length} 张)
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {imagePlans.map((plan, idx) => {
                      const isSelected = selectedPlans.has(idx)
                      return (
                      <div
                          key={plan.num}
                          onClick={() => setSelectedPlans(prev => {
                            const next = new Set(prev)
                            if (next.has(idx)) next.delete(idx)
                            else next.add(idx)
                            return next
                          })}
                          style={{
                            display: 'flex',
                            gap: '14px',
                            padding: '14px',
                            background: isSelected ? 'var(--brand-glow)' : 'var(--bg-muted)',
                            borderRadius: 'var(--radius-md)',
                            border: isSelected ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            opacity: isSelected ? 1 : 0.55,
                            transition: 'all 0.15s ease'
                          }}
                        >
                        <div style={{
                          width: '64px',
                          height: '64px',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--brand-glow)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <ImageIcon size={24} style={{ color: 'var(--brand)' }} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: 'var(--radius-full)',
                              background: 'var(--brand)',
                              color: '#fff',
                              fontSize: '10px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {plan.num}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>
                              {plan.title}
                            </span>
                          </div>
                          <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: 0, lineHeight: '1.5' }}>
                            {plan.desc}
                          </p>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 尺寸不符弹窗:模型静默忽略尺寸时提示,让用户选择是否按保底尺寸重试 */}
      {sizeMismatchModal && (
        <Modal
          open
          onClose={() => setSizeMismatchModal(null)}
          title="生成尺寸与所选不一致"
          footer={
            <>
              <Button variant="ghost" onClick={() => setSizeMismatchModal(null)}>保留当前结果</Button>
              <Button variant="secondary" onClick={handleMismatchRetry}>重新生成</Button>
              <Button variant="primary" onClick={handleMismatchCrop}>居中裁剪到 {sizeMismatchModal.requested}</Button>
            </>
          }
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlertCircle size={20} style={{ color: '#b45309', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--fg)', lineHeight: '1.7' }}>
                模型未按所选尺寸生成：请求 <strong>{sizeMismatchModal.requested}</strong>，实际输出 <strong>{sizeMismatchModal.actualW}×{sizeMismatchModal.actualH}</strong>。
              </p>
              {sizeMismatchModal.suggestions && sizeMismatchModal.suggestions.length > 0 && (
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--fg-muted)', lineHeight: '1.7' }}>
                  该模型支持：{sizeMismatchModal.suggestions.join('、')}
                </p>
              )}
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--fg-muted)', lineHeight: '1.7' }}>
                · 重新生成：再试一次，该模型对比例的响应不稳定，可能仍不符；
                <br />· 居中裁剪：将当前结果裁剪为 {sizeMismatchModal.requested}，会裁掉画面边缘内容；
                <br />· 保留当前结果：原样使用（比例与所选不符）。
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* 尺寸不支持弹窗:让用户选择是否按保底尺寸生成 */}
      {sizeFallback && (
        <Modal
          open
          onClose={() => setSizeFallback(null)}
          title="尺寸不支持"
          footer={
            <>
              <Button variant="secondary" onClick={() => setSizeFallback(null)}>取消</Button>
              <Button variant="primary" onClick={handleFallbackGenerate}>按保底尺寸生成</Button>
            </>
          }
        >
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlertCircle size={20} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--fg)', lineHeight: '1.7' }}>
                当前生图模型不支持 <strong>{sizeFallback.requested}</strong> 尺寸，无法按该尺寸生成图片。
              </p>
              {sizeFallback.suggestions && sizeFallback.suggestions.length > 0 && (
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--fg-muted)', lineHeight: '1.7' }}>
                  该模型支持：{sizeFallback.suggestions.join('、')}
                </p>
              )}
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--fg)', lineHeight: '1.7' }}>
                是否按保底尺寸 <strong>{sizeFallback.fallback}</strong> 生成？
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* 错误弹窗 */}
      {errorModal && (
        <ErrorModal
          open
          title={errorModal.title}
          message={errorModal.message}
          onClose={() => setErrorModal(null)}
        />
      )}

      {/* Preview Modal */}
      {previewImage && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.85)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out'
        }} onClick={() => setPreviewImage(null)}>
          <button
            onClick={() => setPreviewImage(null)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', zIndex: 1
            }}
          >
            <X size={18} style={{ color: '#fff' }} />
          </button>
          <img src={previewImage} alt="预览"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--fg-secondary)',
  marginBottom: '6px'
}
