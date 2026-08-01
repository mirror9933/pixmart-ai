import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Check, ChevronDown, ChevronUp, ArrowLeft, Sparkles, Palette, Type,
  Layers, Eye, Image as ImageIcon, Loader2, Download, FolderDown, X
} from 'lucide-react'
import StepIndicator from '@/components/shared/StepIndicator'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'

const speeds = [
  { key: 'recommended', label: '推荐', desc: '平衡质量与速度' },
  { key: 'standard', label: '标准', desc: '高质量输出' },
  { key: 'fast', label: '快速', desc: '快速出图' },
  { key: 'turbo', label: '极速', desc: '最快出图' }
] as const

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
  const [speed, setSpeed] = useState<string>('recommended')
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

  // Build image plans from real analysis
  const imagePlans = analysisResult?.designPlan?.length
    ? analysisResult.designPlan.map((plan: any, i: number) => ({
        num: i + 1,
        title: plan.title || `方案 ${i + 1}`,
        desc: plan.description || plan.prompt || ''
      }))
    : imagePlans_default

  const handleGenerate = async () => {
    const toGenerate = selectedPlans.size > 0
      ? analysisResult.designPlan.filter((_: any, i: number) => selectedPlans.has(i))
      : analysisResult.designPlan
    if (generating || !projectIdFromState || !toGenerate?.length) return
    setGenerating(true)
    setGenerateDone(false)
    setGeneratedImages([])
    try {
      const prompts = toGenerate.map((plan: any) => ({
        id: plan.id || '',
        prompt: plan.prompt || plan.title || '',
        style: plan.style || '',
        size: pixelSize
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
    }
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
      setSaveMsg('已保存到项目记录')
      setTimeout(() => setSaveMsg(''), 2000)
    } catch {
      downloadImage(dataUrl)
    }
  }

  // Size mapping from user selection to DALL-E supported sizes (1024² | 1792×1024 | 1024×1792)
  // Extract ratio from value (e.g. "1:1_1200x1200" → "1:1", or bare "1:1")
  const ratio = selectedSize.includes('_') ? selectedSize.split('_')[0] : selectedSize
  const sizeMap: Record<string, string> = {
    '1:1': '1024x1024',
    '3:4': '1024x1792',
    '4:3': '1792x1024',
    '2:3': '1024x1792',
    '3:2': '1792x1024',
    '4:5': '1024x1792',
    '5:4': '1792x1024',
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '21:10': '1792x1024',
    '21:9': '1792x1024',
  }
  const pixelSize = sizeMap[ratio] || '1024x1024'

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

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>生成速度</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {speeds.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSpeed(s.key)}
                  style={{
                    padding: '10px',
                    border: speed === s.key ? '1px solid var(--brand)' : '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: speed === s.key ? 'var(--brand-glow)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: speed === s.key ? 'var(--brand)' : 'var(--fg)'
                  }}>
                    {s.label}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: 'var(--fg-muted)',
                    display: 'block',
                    marginTop: '2px'
                  }}>
                    {s.desc}
                  </span>
                </button>
              ))}
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
                      已完成 {generatedImages.length} / {taskIdsRef.current.length} 张
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
                    <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: '0 0 12px 0' }}>
                      共 {generatedImages.length} 张生成完成
                    </p>
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
                          padding: '4px', display: 'flex', gap: '2px',
                          borderTop: '1px solid var(--border-subtle)'
                        }}>
                          {task.result?.url && (
                            <>
                              <button
                                onClick={() => downloadImage(task.result.url)}
                                title="下载"
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  gap: '2px', padding: '4px 2px', fontSize: '10px', fontWeight: 500,
                                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                                  background: 'var(--bg-muted)', color: 'var(--fg-secondary)'
                                }}
                              >
                                <Download size={10} /> 下载
                              </button>
                              <button
                                onClick={() => saveToProject(task.result.url)}
                                title="保存到项目"
                                style={{
                                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  gap: '2px', padding: '4px 2px', fontSize: '10px', fontWeight: 500,
                                  border: 'none', borderRadius: '4px', cursor: 'pointer',
                                  background: 'var(--brand-glow)', color: 'var(--brand)'
                                }}
                              >
                                <FolderDown size={10} /> 保存
                              </button>
                            </>
                          )}
                          {task.status === 'failed' && (
                            <span style={{ fontSize: '10px', color: 'var(--danger)', textAlign: 'center', width: '100%', padding: '4px' }}>
                              生成失败
                            </span>
                          )}
                        </div>
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
