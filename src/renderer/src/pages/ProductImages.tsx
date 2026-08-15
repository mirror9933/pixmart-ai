import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { ImagePlus, Sparkles, Wand2, Plus, Zap, Eye, X, RefreshCw } from 'lucide-react'
import StepIndicator from '@/components/shared/StepIndicator'
import AiWriteModal from '@/components/shared/AiWriteModal'
import ErrorModal from '@/components/shared/ErrorModal'
import ModuleSelector from '@/components/shared/ModuleSelector'
import type { CustomModuleData } from '@/components/shared/CustomModuleModal'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Textarea from '@/components/ui/Textarea'
import UploadArea, { type UploadedFile } from '@/components/ui/UploadArea'
import { useModelOptions } from '@/hooks/useModelOptions'
import { MAIN_MODULE_TYPES } from '@/constants/mainModules'
import { DETAIL_MODULE_TYPES } from '@/constants/detailModules'
import { MAIN_DETAIL_SIZE_OPTIONS, PLATFORM_OPTIONS } from '@/constants/sizeOptions'

const tabs = ['主图', '详情图', '广告图'] as const
type Tab = (typeof tabs)[number]

const adTypes = ['电商广告', '社交媒体', '活动海报'] as const

// Platform-specific image sizes (based on 2026 e-commerce size standards)
// Format: { value, label, type: 'main'|'detail'|'ad' }
interface SizeOption { value: string; label: string; type: 'main' | 'detail' | 'ad' }

const adSizeOptions: SizeOption[] = [
  { value: '1:1', label: '1:1 正方形', type: 'ad' },
  { value: '2:3', label: '2:3 竖版', type: 'ad' },
  { value: '3:2', label: '3:2 横版', type: 'ad' },
  { value: '3:4', label: '3:4 竖版', type: 'ad' },
  { value: '4:3', label: '4:3 横版', type: 'ad' },
  { value: '4:5', label: '4:5 竖版', type: 'ad' },
  { value: '5:4', label: '5:4 横版', type: 'ad' },
  { value: '9:16', label: '9:16 手机竖屏', type: 'ad' },
  { value: '16:9', label: '16:9 宽屏', type: 'ad' },
  { value: '21:9', label: '21:9 超宽屏', type: 'ad' },
]

function getSizeOptions(_platform: string, activeTab: string): { value: string; label: string }[] {
  if (activeTab === '广告图') return adSizeOptions.map(({ value, label }) => ({ value, label }))
  // 主图/详情图:统一尺寸选项,不按平台分类
  return MAIN_DETAIL_SIZE_OPTIONS
}

/** 表单初始值(重置用) */
const emptyMainForm = {
  platform: '', description: '', language: '',
  textModel: '', imageModel: '',
  size: '', quality: '', quantity: ''
}
const emptyDetailForm = {
  platform: '', requirement: '', language: '',
  textModel: '', imageModel: '',
  size: '', quality: '', quantity: ''
}
const emptyAdForm = {
  platform: '', description: '', language: '',
  textModel: '', imageModel: '',
  size: '', quality: '', quantity: ''
}

export default function ProductImages() {
  const navigate = useNavigate()
  const location = useLocation()
  const { textModels: textModelOptions, imageModels: imageModelOptions } = useModelOptions()
  const [activeTab, setActiveTab] = useState<Tab>('主图')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [aiModalTarget, setAiModalTarget] = useState<'main' | 'detail' | 'ad'>('main')
  const [adType, setAdType] = useState<string>('电商广告')
  const [productImages, setProductImages] = useState<UploadedFile[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  // 主图模块选择:key -> 生成数量(选中即存在;默认全部各 1 张)
  const [mainModules, setMainModules] = useState<Record<string, number>>(
    Object.fromEntries(MAIN_MODULE_TYPES.map(m => [m.key, 1]))
  )
  // 主图完整模块列表(内置含用户覆盖 + 自定义,由 ModuleSelector 通知,用于规划页)
  const [mainModuleList, setMainModuleList] = useState<CustomModuleData[]>(MAIN_MODULE_TYPES)
  // 详情图模块选择(默认全部各 1 张)
  const [detailModules, setDetailModules] = useState<Record<string, number>>(
    Object.fromEntries(DETAIL_MODULE_TYPES.map(m => [m.key, 1]))
  )
  // 详情图完整模块列表
  const [detailModuleList, setDetailModuleList] = useState<CustomModuleData[]>(DETAIL_MODULE_TYPES)

  const [mainForm, setMainForm] = useState({
    platform: '',
    description: '',
    language: '',
    textModel: '',
    imageModel: '',
    size: '',
    quality: '',
    quantity: ''
  })

  const [detailForm, setDetailForm] = useState({
    platform: '',
    requirement: '',
    language: '',
    textModel: '',
    imageModel: '',
    size: '',
    quality: '',
    quantity: ''
  })

  const [adForm, setAdForm] = useState({
    platform: '',
    description: '',
    language: '',
    textModel: '',
    imageModel: '',
    size: '',
    quality: '',
    quantity: ''
  })

  // 挂载时恢复临时保存的表单/模块/图片(重新打开页面不丢输入);
  // 文案模型/生图模型优先用临时值,没有则用上次使用的(last_models)
  useEffect(() => {
    (async () => {
      try {
        const [state, lastModelsRaw] = await Promise.all([
          window.api.files.loadTempState('productImages'),
          window.api.settings.get('last_models')
        ])
        let lastModels: any = {}
        try { lastModels = lastModelsRaw ? JSON.parse(lastModelsRaw) : {} } catch {}

        if (state && typeof state === 'object') {
          if (typeof state.activeTab === 'string') setActiveTab(state.activeTab)
          if (state.adType) setAdType(state.adType)
          if (state.mainForm) {
            // Validate size: if the saved value is no longer valid for the platform, reset it
            const opts = getSizeOptions(state.mainForm.platform || 'taobao', state.activeTab || '主图')
            const valid = opts.some(o => o.value === state.mainForm.size)
            setMainForm({
              ...(valid ? state.mainForm : { ...state.mainForm, size: opts[0]?.value || '' }),
              textModel: state.mainForm.textModel || lastModels.main?.textModel || '',
              imageModel: state.mainForm.imageModel || lastModels.main?.imageModel || ''
            })
          } else {
            setMainForm((f) => ({ ...f, textModel: lastModels.main?.textModel || '', imageModel: lastModels.main?.imageModel || '' }))
          }
          if (state.detailForm) {
            const opts = getSizeOptions(state.detailForm.platform || 'taobao', state.activeTab || '主图')
            const valid = opts.some(o => o.value === state.detailForm.size)
            setDetailForm({
              ...(valid ? state.detailForm : { ...state.detailForm, size: opts[0]?.value || '' }),
              textModel: state.detailForm.textModel || lastModels.detail?.textModel || '',
              imageModel: state.detailForm.imageModel || lastModels.detail?.imageModel || ''
            })
          } else {
            setDetailForm((f) => ({ ...f, textModel: lastModels.detail?.textModel || '', imageModel: lastModels.detail?.imageModel || '' }))
          }
          if (state.adForm) {
            const opts = getSizeOptions(state.adForm.platform || 'taobao', state.activeTab || '主图')
            const valid = opts.some(o => o.value === state.adForm.size)
            setAdForm({
              ...(valid ? state.adForm : { ...state.adForm, size: opts[0]?.value || '' }),
              textModel: state.adForm.textModel || lastModels.ad?.textModel || '',
              imageModel: state.adForm.imageModel || lastModels.ad?.imageModel || ''
            })
          } else {
            setAdForm((f) => ({ ...f, textModel: lastModels.ad?.textModel || '', imageModel: lastModels.ad?.imageModel || '' }))
          }
          if (state.productImages?.length) setProductImages(state.productImages)
          if (state.mainModules) setMainModules(state.mainModules)
          if (state.detailModules) setDetailModules(state.detailModules)
        } else {
          // 无临时状态:默认填上次使用的模型
          setMainForm((f) => ({ ...f, textModel: lastModels.main?.textModel || '', imageModel: lastModels.main?.imageModel || '' }))
          setDetailForm((f) => ({ ...f, textModel: lastModels.detail?.textModel || '', imageModel: lastModels.detail?.imageModel || '' }))
          setAdForm((f) => ({ ...f, textModel: lastModels.ad?.textModel || '', imageModel: lastModels.ad?.imageModel || '' }))
        }
      } catch {}
    })()
  }, [])

  // 表单输入实时自动保存(500ms 防抖):重新打开页面可恢复;模型选择单独持久化到 last_models
  useEffect(() => {
    const timer = setTimeout(() => {
      const models = {
        main: { textModel: mainForm.textModel, imageModel: mainForm.imageModel },
        detail: { textModel: detailForm.textModel, imageModel: detailForm.imageModel },
        ad: { textModel: adForm.textModel, imageModel: adForm.imageModel }
      }
      window.api.settings.set('last_models', JSON.stringify(models)).catch(() => {})
      window.api.files.saveTempState('productImages', {
        activeTab,
        adType,
        mainForm,
        detailForm,
        adForm,
        mainModules,
        detailModules,
        productImages: productImages.map(img => ({
          path: img.path, name: img.name, size: img.size, dataUrl: img.dataUrl
        }))
      }).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [mainForm, detailForm, adForm, mainModules, detailModules, productImages, activeTab, adType])

  /** 刷新按钮:重置表单(清空输入),但保留文案模型/生图模型为上次使用的 */
  const handleResetForm = async () => {
    if (!window.confirm('确定要重置当前表单吗？输入的内容将清空（文案模型和生图模型会保留上次使用的）。')) return
    let lastModels: any = {}
    try {
      const raw = await window.api.settings.get('last_models')
      if (raw) lastModels = JSON.parse(raw)
    } catch {}
    setActiveTab('主图')
    setAdType('电商广告')
    setMainForm({ ...emptyMainForm, textModel: lastModels.main?.textModel || '', imageModel: lastModels.main?.imageModel || '' })
    setDetailForm({ ...emptyDetailForm, textModel: lastModels.detail?.textModel || '', imageModel: lastModels.detail?.imageModel || '' })
    setAdForm({ ...emptyAdForm, textModel: lastModels.ad?.textModel || '', imageModel: lastModels.ad?.imageModel || '' })
    setMainModules(Object.fromEntries(MAIN_MODULE_TYPES.map(m => [m.key, 1])))
    setDetailModules(Object.fromEntries(DETAIL_MODULE_TYPES.map(m => [m.key, 1])))
    setProductImages([])
    // 清空已保存的临时状态,避免下次打开恢复旧值
    try { await window.api.files.saveTempState('productImages', {}) } catch {}
  }

  // 错误弹窗(模型校验 / 分析失败 / 模型不支持识图等)
  const [errorModal, setErrorModal] = useState<{ title?: string; message: string } | null>(null)

  const handleAiWrite = (target: 'main' | 'detail' | 'ad') => {
    // 模型必选校验:AI 帮写需要文案模型
    const model = target === 'main' ? mainForm.textModel : target === 'detail' ? detailForm.textModel : adForm.textModel
    if (!model) {
      setErrorModal({ title: '请先选择模型', message: '使用 AI 帮写前，请先在「文案模型」中选择一个模型。' })
      return
    }
    setAiModalTarget(target)
    setAiModalOpen(true)
  }

  const getCurrentProductInfo = (): string => {
    if (aiModalTarget === 'main') return mainForm.description
    if (aiModalTarget === 'detail') return detailForm.requirement
    return adForm.description
  }

  const handleSelectImages = (files: UploadedFile[]) => {
    setProductImages(prev => [...prev, ...files])
  }

  const handleRemoveImage = (index: number) => {
    setProductImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleAiApply = (text: string) => {
    if (aiModalTarget === 'main') setMainForm((f) => ({ ...f, description: text }))
    else if (aiModalTarget === 'detail') setDetailForm((f) => ({ ...f, requirement: text }))
    else setAdForm((f) => ({ ...f, description: text }))
    setAiModalOpen(false)
  }

  // AI 帮写参考的目标平台:按目标 Tab 取对应表单的平台(转为中文标签)
  const currentAiPlatform = aiModalTarget === 'main' ? mainForm.platform
    : aiModalTarget === 'detail' ? detailForm.platform
    : adForm.platform
  const currentAiPlatformLabel = currentAiPlatform
    ? (PLATFORM_OPTIONS.find(p => p.value === currentAiPlatform)?.label || currentAiPlatform)
    : ''

  const handleAnalyze = async () => {
    if (isAnalyzing) return
    const isModuleTab = activeTab === '主图' || activeTab === '详情图'
    const currentModules = activeTab === '主图' ? mainModules : detailModules
    const checkForm = activeTab === '主图' ? mainForm : activeTab === '详情图' ? detailForm : adForm
    if (isModuleTab && Object.keys(currentModules).length === 0) {
      setAnalyzeError('请至少选择一个模块')
      return
    }
    // 模型必选校验:产品分析(识图)需要文案模型
    if (!checkForm.textModel) {
      setAnalyzeError('请先选择文案模型')
      setErrorModal({
        title: '请先选择模型',
        message: '产品分析需要 AI 识别产品图片。请先在「文案模型」中选择一个支持识图的模型。'
      })
      return
    }
    setAnalyzeError('')
    setIsAnalyzing(true)
    try {
      // Convert blob URLs to base64 for IPC transport
      const imageUrls = await Promise.all(
        productImages.map(img => {
          return new Promise<string>((resolve, reject) => {
            const image = new Image()
            image.onload = () => {
              const c = document.createElement('canvas')
              c.width = image.naturalWidth
              c.height = image.naturalHeight
              const ctx = c.getContext('2d')
              if (!ctx) return reject(new Error('Canvas unavailable'))
              ctx.drawImage(image, 0, 0)
              resolve(c.toDataURL('image/jpeg', 0.92))
            }
            image.onerror = () => reject(new Error('Failed to load image'))
            image.src = img.dataUrl
          })
        })
      )

      const info = getCurrentProductInfo()
      const project = await window.api.projects.create({
        title: info ? info.slice(0, 30) : '产品分析',
        description: info,
        category: '全品类商品图',
        categoryLabel: '全品类商品图',
        sourceImages: imageUrls
      })

      const result = await window.api.ai.analyzeProduct({
        projectId: project.id,
        images: imageUrls,
        description: info,
        model: checkForm.textModel
      })

      // Get current tab's form data
      const currentForm = activeTab === '主图' ? mainForm : activeTab === '详情图' ? detailForm : adForm

      // Resolve the full label of the selected size for display consistency
      const sizeLabel = getSizeOptions(currentForm.platform || 'taobao', activeTab)
        .find(o => o.value === currentForm.size)?.label || ''

      // 主图/详情图:生成数量 = 所选模块的数量之和,规划按模块展开
      const isModuleTab = activeTab === '主图' || activeTab === '详情图'
      const currentModules = activeTab === '主图' ? mainModules : detailModules
      const currentModuleList = activeTab === '主图' ? mainModuleList : detailModuleList
      const moduleTotal = Object.values(currentModules).reduce((a, b) => a + b, 0)

      navigate('/confirm-plan', {
        state: {
          result,
          projectId: project.id,
          imageModel: currentForm.imageModel,
          textModel: currentForm.textModel,
          platform: currentForm.platform,
          language: currentForm.language,
          size: currentForm.size,
          sizeLabel,
          quality: currentForm.quality,
          quantity: isModuleTab ? (moduleTotal || 1) : (parseInt(currentForm.quantity) || 1),
          activeTab,
          // 模块选择(内置 + 自定义 -> 数量),规划确认页按此展开
          mainModules: isModuleTab ? currentModules : null,
          // 完整模块定义(内置已应用用户提示词覆盖 + 自定义),供规划页使用实际提示词
          moduleTypes: isModuleTab ? currentModuleList : [],
          // 生成时保持产品主体一致性：参考图（已转 base64）+ 分析得到的产品主体特征描述
          referenceImages: imageUrls,
          productProfile: result.productProfile || '',
          productProfileEn: result.productProfileEn || ''
        }
      })
    } catch (err: any) {
      const msg = err?.message || '分析失败，请重试'
      setAnalyzeError(msg)
      setErrorModal({
        title: '产品分析失败',
        message: `${msg}\n\n如果模型不支持图片识别（识图），请更换「文案模型」后重试。`
      })
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: 'var(--fg)',
          margin: '0 0 8px 0',
          fontFamily: 'var(--font-display)'
        }}>
          一键生成主图 & 详情图组 & 广告图
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--fg-muted)', margin: 0 }}>
          AI 智能分析产品特征，自动生成多场景电商图片
        </p>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <StepIndicator currentStep={isAnalyzing ? 2 : 1} />
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        <div className="anim-fade-in" style={{
          flex: '0 0 40%',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px'
        }}>
          {/* 批量任务入口:仅主图/详情图显示(广告图不支持批量);右侧为刷新(重置表单)按钮 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            {activeTab !== '广告图' && (
              <Link
                to="/batch-tasks"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '14px',
                  fontWeight: 400,
                  color: 'var(--fg-muted)',
                  backgroundColor: 'transparent',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--brand)'
                  e.currentTarget.style.backgroundColor = 'var(--brand-glow)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--fg-muted)'
                  e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <Plus size={14} />
                批量任务
              </Link>
            )}
            <button
              onClick={handleResetForm}
              title="重置当前表单（保留上次使用的模型）"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--fg-muted)',
                backgroundColor: 'transparent',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                marginLeft: 'auto',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--brand)'
                e.currentTarget.style.borderColor = 'var(--brand)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--fg-muted)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <RefreshCw size={13} />
              刷新
            </button>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--fg-secondary)',
              marginBottom: '8px'
            }}>产品图</label>
            {productImages.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                {productImages.map((img, i) => (
                  <div key={i} style={{
                    position: 'relative',
                    width: '72px',
                    height: '72px',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                  }}>
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <button
                      onClick={() => setPreviewUrl(img.dataUrl)}
                      style={{
                        position: 'absolute',
                        top: '2px',
                        left: '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '4px',
                        background: 'rgba(0,0,0,0.55)',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0,
                        transition: 'opacity 0.15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      onClick={() => handleRemoveImage(i)}
                      style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.6)',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <UploadArea
              count={productImages.length}
              maxCount={6}
              label="上传产品图片"
              onUpload={handleSelectImages}
            />
          </div>

          <div style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '16px',
            background: 'var(--bg-muted)',
            borderRadius: 'var(--radius-md)',
            padding: '4px'
          }}>
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: activeTab === tab ? 600 : 400,
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
                  color: activeTab === tab ? 'var(--brand)' : 'var(--fg-muted)',
                  boxShadow: activeTab === tab ? 'var(--shadow-sm)' : 'none'
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === '主图' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>目标平台</label>
                <Select
                  value={mainForm.platform}
                  onChange={(v) => setMainForm((f) => ({
                    ...f,
                    platform: v,
                    size: getSizeOptions(v, activeTab)[0]?.value || f.size
                  }))}
                  options={PLATFORM_OPTIONS}
                  placeholder="选择目标平台"
                />
              </div>
              <div>
                <label style={labelStyle}>主图要求</label>
                <div style={{ position: 'relative' }}>
                  <Textarea
                    value={mainForm.description}
                    onChange={(v) => setMainForm((f) => ({ ...f, description: v }))}
                    placeholder="建议输入：产品名称、卖点、目标人群、目标电商平台、图片风格等"
                    rows={3}
                  />
                  <button
                    onClick={() => handleAiWrite('main')}
                    style={aiWriteBtnStyle}
                  >
                    <Sparkles size={12} />
                    AI帮写
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>目标语言</label>
                <Select
                  value={mainForm.language}
                  onChange={(v) => setMainForm((f) => ({ ...f, language: v }))}
                  options={[
                    { value: 'zh', label: '中文' },
                    { value: 'en', label: 'English' },
                    { value: 'ja', label: '日本語' },
                    { value: 'ko', label: '한국어' }
                  ]}
                  placeholder="选择语言"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>文案模型</label>
                  <SearchableSelect
                    value={mainForm.textModel}
                    onChange={(v) => setMainForm((f) => ({ ...f, textModel: v }))}
                    options={textModelOptions}
                    placeholder="AI 写作/识图"
                  />
                </div>
                <div>
                  <label style={labelStyle}>生图模型</label>
                  <SearchableSelect
                    value={mainForm.imageModel}
                    onChange={(v) => setMainForm((f) => ({ ...f, imageModel: v }))}
                    options={imageModelOptions}
                    placeholder="图片生成"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>图片尺寸</label>
                  <Select
                    value={mainForm.size}
                    onChange={(v) => setMainForm((f) => ({ ...f, size: v }))}
                    options={getSizeOptions(mainForm.platform || 'taobao', activeTab)}
                    placeholder="选择尺寸"
                  />
                </div>
                <div>
                  <label style={labelStyle}>输出质量</label>
                  <Select
                    value={mainForm.quality}
                    onChange={(v) => setMainForm((f) => ({ ...f, quality: v }))}
                    options={[
                      { value: 'standard', label: '标准' },
                      { value: 'hd', label: '高清' },
                      { value: '2k', label: '2K' },
                      { value: '4k', label: '4K' }
                    ]}
                    placeholder="选择质量"
                  />
                </div>
              </div>

              {/* 主图模块选择:勾选模块并设置各模块生成数量 */}
              <ModuleSelector
                baseModules={MAIN_MODULE_TYPES}
                storageKey="main_custom_modules"
                overrideKey="main_module_overrides"
                value={mainModules}
                onChange={setMainModules}
                onModuleListChange={setMainModuleList}
              />

              {analyzeError && (
                <div style={{
                  fontSize: '12px',
                  color: 'var(--danger)',
                  textAlign: 'center'
                }}>
                  {analyzeError}
                </div>
              )}
              <Button variant="primary" onClick={handleAnalyze} disabled={isAnalyzing} style={{
                width: '100%',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <Wand2 size={16} />
                {isAnalyzing ? '分析中...' : '分析产品'}
              </Button>
            </div>
          )}

          {activeTab === '详情图' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>目标平台</label>
                <Select
                  value={detailForm.platform}
                  onChange={(v) => setDetailForm((f) => ({
                    ...f,
                    platform: v,
                    size: getSizeOptions(v, activeTab)[0]?.value || f.size
                  }))}
                  options={PLATFORM_OPTIONS}
                  placeholder="选择目标平台"
                />
              </div>
              <div>
                <label style={labelStyle}>详情图要求</label>
                <div style={{ position: 'relative' }}>
                  <Textarea
                    value={detailForm.requirement}
                    onChange={(v) => setDetailForm((f) => ({ ...f, requirement: v }))}
                    placeholder="建议输入：产品名称、卖点、目标人群、目标电商平台、图片风格等"
                    rows={3}
                  />
                  <button
                    onClick={() => handleAiWrite('detail')}
                    style={aiWriteBtnStyle}
                  >
                    <Sparkles size={12} />
                    AI帮写
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>目标语言</label>
                <Select
                  value={detailForm.language}
                  onChange={(v) => setDetailForm((f) => ({ ...f, language: v }))}
                  options={[
                    { value: 'zh', label: '中文' },
                    { value: 'en', label: 'English' },
                    { value: 'ja', label: '日本語' }
                  ]}
                  placeholder="选择语言"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>文案模型</label>
                  <SearchableSelect
                    value={detailForm.textModel}
                    onChange={(v) => setDetailForm((f) => ({ ...f, textModel: v }))}
                    options={textModelOptions}
                    placeholder="AI 写作/识图"
                  />
                </div>
                <div>
                  <label style={labelStyle}>生图模型</label>
                  <SearchableSelect
                    value={detailForm.imageModel}
                    onChange={(v) => setDetailForm((f) => ({ ...f, imageModel: v }))}
                    options={imageModelOptions}
                    placeholder="图片生成"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>图片尺寸</label>
                  <Select
                    value={detailForm.size}
                    onChange={(v) => setDetailForm((f) => ({ ...f, size: v }))}
                    options={getSizeOptions(detailForm.platform || 'taobao', activeTab)}
                    placeholder="选择尺寸"
                  />
                </div>
                <div>
                  <label style={labelStyle}>输出质量</label>
                  <Select
                    value={detailForm.quality}
                    onChange={(v) => setDetailForm((f) => ({ ...f, quality: v }))}
                    options={[
                      { value: 'standard', label: '标准' },
                      { value: 'hd', label: '高清' },
                      { value: '2k', label: '2K' }
                    ]}
                    placeholder="选择质量"
                  />
                </div>
              </div>

              {/* 详情图模块选择:勾选模块并设置各模块生成数量 */}
              <ModuleSelector
                baseModules={DETAIL_MODULE_TYPES}
                storageKey="detail_custom_modules"
                overrideKey="detail_module_overrides"
                value={detailModules}
                onChange={setDetailModules}
                onModuleListChange={setDetailModuleList}
              />
              <Button variant="primary" onClick={handleAnalyze} disabled={isAnalyzing} style={{
                width: '100%',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <Wand2 size={16} />
                {isAnalyzing ? '分析中...' : '分析产品'}
              </Button>
            </div>
          )}

          {activeTab === '广告图' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>广告类型</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {adTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => setAdType(type)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '13px',
                        border: adType === type ? '1px solid var(--brand)' : '1px solid var(--border)',
                        borderRadius: 'var(--radius-full)',
                        cursor: 'pointer',
                        background: adType === type ? 'var(--brand-glow)' : 'transparent',
                        color: adType === type ? 'var(--brand)' : 'var(--fg-muted)',
                        fontWeight: adType === type ? 600 : 400,
                        transition: 'all 0.2s'
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>广告描述</label>
                <div style={{ position: 'relative' }}>
                  <Textarea
                    value={adForm.description}
                    onChange={(v) => setAdForm((f) => ({ ...f, description: v }))}
                    placeholder="建议输入：产品名称、卖点、目标人群、活动主题、价格优惠、希望突出的氛围等"
                    rows={3}
                  />
                  <button
                    onClick={() => handleAiWrite('ad')}
                    style={aiWriteBtnStyle}
                  >
                    <Sparkles size={12} />
                    AI帮写
                  </button>
                </div>
              </div>
              <div>
                <label style={labelStyle}>目标语言</label>
                <Select
                  value={adForm.language}
                  onChange={(v) => setAdForm((f) => ({ ...f, language: v }))}
                  options={[
                    { value: 'zh', label: '中文' },
                    { value: 'en', label: 'English' },
                    { value: 'ja', label: '日本語' }
                  ]}
                  placeholder="选择语言"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>文案模型</label>
                  <SearchableSelect
                    value={adForm.textModel}
                    onChange={(v) => setAdForm((f) => ({ ...f, textModel: v }))}
                    options={textModelOptions}
                    placeholder="AI 写作/识图"
                  />
                </div>
                <div>
                  <label style={labelStyle}>生图模型</label>
                  <SearchableSelect
                    value={adForm.imageModel}
                    onChange={(v) => setAdForm((f) => ({ ...f, imageModel: v }))}
                    options={imageModelOptions}
                    placeholder="图片生成"
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>图片尺寸</label>
                  <Select
                    value={adForm.size}
                    onChange={(v) => setAdForm((f) => ({ ...f, size: v }))}
                    options={getSizeOptions(adForm.platform || 'taobao', activeTab)}
                    placeholder="选择尺寸"
                  />
                </div>
                <div>
                  <label style={labelStyle}>输出质量</label>
                  <Select
                    value={adForm.quality}
                    onChange={(v) => setAdForm((f) => ({ ...f, quality: v }))}
                    options={[
                      { value: 'standard', label: '标准' },
                      { value: 'hd', label: '高清' },
                      { value: '2k', label: '2K' }
                    ]}
                    placeholder="选择质量"
                  />
                </div>
                <div>
                  <label style={labelStyle}>生成数量</label>
                  <Select
                    value={adForm.quantity}
                    onChange={(v) => setAdForm((f) => ({ ...f, quantity: v }))}
                    options={[
                      { value: '1', label: '1 张' },
                      { value: '2', label: '2 张' },
                      { value: '4', label: '4 张' },
                      { value: '6', label: '6 张' },
                      { value: '8', label: '8 张' },
                      { value: '10', label: '10 张' },
                      { value: '15', label: '15 张' },
                      { value: '20', label: '20 张' }
                    ]}
                    placeholder="选择数量"
                  />
                </div>
              </div>
              <Button variant="primary" onClick={handleAnalyze} style={{
                width: '100%',
                marginTop: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}>
                <Zap size={16} />
                生成广告图
              </Button>
            </div>
          )}
        </div>

        <div className="anim-fade-in" style={{
          flex: '1',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          minHeight: '500px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '24px'
        }}>
          {isAnalyzing ? (
            <>
              <style>{`
                .analyzing-loader { position: relative; width: 140px; height: 60px; margin: 0 auto 16px; }
                .analyzing-loader .loader { position: absolute; top: 50%; left: 50%; margin-left: -50px; animation: analyzingDeco 0.4s linear infinite; }
                .analyzing-loader .loader > span { height: 5px; width: 35px; background: var(--brand); position: absolute; top: -19px; left: 60px; border-radius: 2px 10px 1px 0; }
                .analyzing-loader .base span { position: absolute; width: 0; height: 0; border-top: 6px solid transparent; border-right: 100px solid var(--brand); border-bottom: 6px solid transparent; }
                .analyzing-loader .base span::before { content: ""; height: 22px; width: 22px; border-radius: 50%; background: var(--brand); position: absolute; right: -110px; top: -16px; }
                .analyzing-loader .base span::after { content: ""; position: absolute; width: 0; height: 0; border-top: 0 solid transparent; border-right: 55px solid var(--brand); border-bottom: 16px solid transparent; top: -16px; right: -98px; }
                .analyzing-loader .face { position: absolute; height: 12px; width: 20px; background: var(--brand); border-radius: 20px 20px 0 0; transform: rotate(-40deg); right: -125px; top: -15px; }
                .analyzing-loader .face::after { content: ""; height: 12px; width: 12px; background: var(--brand); right: 4px; top: 7px; position: absolute; transform: rotate(40deg); transform-origin: 50% 50%; border-radius: 0 0 0 2px; }
                .analyzing-loader .loader > span > span { width: 30px; height: 1px; background: var(--brand); position: absolute; animation: analyzingFazer1 0.2s linear infinite; }
                .analyzing-loader .loader > span > span:nth-child(2) { top: 3px; animation: analyzingFazer2 0.4s linear infinite; }
                .analyzing-loader .loader > span > span:nth-child(3) { top: 1px; animation: analyzingFazer3 0.4s linear infinite; animation-delay: -1s; }
                .analyzing-loader .loader > span > span:nth-child(4) { top: 4px; animation: analyzingFazer4 1s linear infinite; animation-delay: -1s; }
                .analyzing-loader .longfazers { position: absolute; width: 100%; height: 100%; top: 0; left: 0; }
                .analyzing-loader .longfazers span { position: absolute; height: 2px; width: 20%; background: var(--brand); opacity: 0.4; }
                .analyzing-loader .longfazers span:nth-child(1) { top: 20%; animation: analyzingLf 0.6s linear infinite; animation-delay: -5s; }
                .analyzing-loader .longfazers span:nth-child(2) { top: 40%; animation: analyzingLf2 0.8s linear infinite; animation-delay: -1s; }
                .analyzing-loader .longfazers span:nth-child(3) { top: 60%; animation: analyzingLf3 0.6s linear infinite; }
                .analyzing-loader .longfazers span:nth-child(4) { top: 80%; animation: analyzingLf4 0.5s linear infinite; animation-delay: -3s; }
                @keyframes analyzingDeco { 0%{transform:translate(2px,1px) rotate(0deg)} 10%{transform:translate(-1px,-3px) rotate(-1deg)} 20%{transform:translate(-2px,0px) rotate(1deg)} 30%{transform:translate(1px,2px) rotate(0deg)} 40%{transform:translate(1px,-1px) rotate(1deg)} 50%{transform:translate(-1px,3px) rotate(-1deg)} 60%{transform:translate(-1px,1px) rotate(0deg)} 70%{transform:translate(3px,1px) rotate(-1deg)} 80%{transform:translate(-2px,-1px) rotate(1deg)} 90%{transform:translate(2px,1px) rotate(0deg)} 100%{transform:translate(1px,-2px) rotate(-1deg)} }
                @keyframes analyzingFazer1 { 0%{left:0} 100%{left:-80px;opacity:0} }
                @keyframes analyzingFazer2 { 0%{left:0} 100%{left:-100px;opacity:0} }
                @keyframes analyzingFazer3 { 0%{left:0} 100%{left:-50px;opacity:0} }
                @keyframes analyzingFazer4 { 0%{left:0} 100%{left:-150px;opacity:0} }
                @keyframes analyzingLf { 0%{left:200%} 100%{left:-200%;opacity:0} }
                @keyframes analyzingLf2 { 0%{left:200%} 100%{left:-200%;opacity:0} }
                @keyframes analyzingLf3 { 0%{left:200%} 100%{left:-100%;opacity:0} }
                @keyframes analyzingLf4 { 0%{left:200%} 100%{left:-100%;opacity:0} }
              `}</style>
              <div className="analyzing-loader">
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
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg)', margin: '0 0 4px 0' }}>
                  正在分析产品...
                </p>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  AI 正在解析产品特征并生成设计方案，请稍候
                </p>
              </div>
            </>
          ) : (
            <>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: 'var(--radius-xl)',
                background: 'var(--bg-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <ImagePlus size={36} style={{ color: 'var(--fg-muted)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg-secondary)', margin: '0 0 4px 0' }}>
                  生成结果预览
                </p>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  上传产品图并填写参数后，点击分析开始生成
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <AiWriteModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onApply={handleAiApply}
        productImages={productImages.map(img => img.dataUrl)}
        productInfo={getCurrentProductInfo()}
        context={currentAiPlatformLabel ? `目标平台：${currentAiPlatformLabel}` : ''}
        // 按 AI 帮写目标取对应 Tab 的文案模型(主图/详情图/广告图各自独立)
        selectedModel={
          aiModalTarget === 'main' ? mainForm.textModel
            : aiModalTarget === 'detail' ? detailForm.textModel
            : adForm.textModel
        }
      />

      {errorModal && (
        <ErrorModal
          open
          title={errorModal.title}
          message={errorModal.message}
          onClose={() => setErrorModal(null)}
        />
      )}

      {/* Image preview overlay */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1,
            }}
          >
            <X size={20} />
          </button>
          <img
            src={previewUrl}
            alt="预览"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
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

const aiWriteBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: '8px',
  bottom: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--brand)',
  background: 'var(--brand-glow)',
  border: '1px solid var(--brand)',
  borderRadius: 'var(--radius-full)',
  cursor: 'pointer'
}
