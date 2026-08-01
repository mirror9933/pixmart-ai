import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ImagePlus, Sparkles, Wand2, Plus, Layers, Shield, Download,
  Zap, Eye, X
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import UploadArea, { type UploadedFile } from '@/components/ui/UploadArea'
import AiWriteModal from '@/components/shared/AiWriteModal'
import { useModelOptions } from '@/hooks/useModelOptions'

const tabs = ['单图复刻', '批量复刻'] as const
type Tab = (typeof tabs)[number]

const speeds = [
  { key: 'recommended', label: '推荐' },
  { key: 'standard', label: '标准' },
  { key: 'fast', label: '快速' },
  { key: 'turbo', label: '极速' }
] as const

const features = [
  {
    icon: Layers,
    title: '智能风格融合',
    desc: 'AI 深度分析参考图的色彩、排版、视觉元素，智能融合到您的产品图中'
  },
  {
    icon: Shield,
    title: '产品特性保留',
    desc: '在复刻风格的同时，确保产品主体清晰、细节完整、特征不丢失'
  },
  {
    icon: Download,
    title: '一键生成导出',
    desc: '支持批量生成多张图片，一键导出高清文件，直接用于上架和投放'
  }
]

export default function StyleReplication() {
  const navigate = useNavigate()
  const { textModels: textModelOptions, imageModels: imageModelOptions } = useModelOptions()
  const [activeTab, setActiveTab] = useState<Tab>('单图复刻')
  const [speed, setSpeed] = useState('recommended')
  const [prompt, setPrompt] = useState('')
  const [form, setForm] = useState({
    textModel: '',
    imageModel: '',
    size: '',
    quality: '',
    quantity: ''
  })
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [refImages, setRefImages] = useState<UploadedFile[]>([])
  const [productImages, setProductImages] = useState<UploadedFile[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isReplicating, setIsReplicating] = useState(false)
  const [replicateError, setReplicateError] = useState('')

  const handleSelectRefImages = (files: UploadedFile[]) => {
    setRefImages(prev => [...prev, ...files])
  }

  const handleSelectProductImages = (files: UploadedFile[]) => {
    setProductImages(prev => [...prev, ...files])
  }

  const handleRemoveRefImage = (index: number) => {
    setRefImages(prev => prev.filter((_, i) => i !== index))
  }

  const handleRemoveProductImage = (index: number) => {
    setProductImages(prev => prev.filter((_, i) => i !== index))
  }

  const sizeLabels: Record<string, string> = {
    '1:1': '1:1 正方形',
    '3:4': '3:4 竖版',
    '16:9': '16:9 横版'
  }

  const handleReplicate = async () => {
    if (isReplicating) return
    setReplicateError('')
    if (refImages.length === 0) {
      setReplicateError('请先上传参考设计图')
      return
    }
    if (productImages.length === 0) {
      setReplicateError('请先上传产品素材图')
      return
    }
    setIsReplicating(true)
    try {
      // Convert blob URLs to base64 for IPC transport
      const allImages = [...refImages, ...productImages]
      const imageUrls = await Promise.all(
        allImages.map(img => {
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

      const info = prompt || `参考图风格复刻，生成${form.quantity || 1}张详情图`
      const project = await window.api.projects.create({
        title: info.slice(0, 30),
        description: info,
        category: '风格复刻',
        categoryLabel: '风格复刻',
        sourceImages: imageUrls
      })

      const result = await window.api.ai.analyzeProduct({
        projectId: project.id,
        images: imageUrls,
        description: info,
        model: form.textModel,
        mode: 'replicate',
        extra: prompt
      })

      navigate('/confirm-plan', {
        state: {
          result,
          projectId: project.id,
          imageModel: form.imageModel,
          textModel: form.textModel,
          platform: '',
          language: 'zh',
          size: form.size,
          sizeLabel: form.size ? (sizeLabels[form.size] || form.size) : '',
          quality: form.quality,
          quantity: parseInt(form.quantity) || 1,
          activeTab: '单图复刻',
          // 生成时保持产品主体一致：参考设计图（风格）+ 产品素材图（主体）分别传入（已转 base64）
          styleImages: imageUrls.slice(0, refImages.length),
          referenceImages: imageUrls.slice(refImages.length),
          productProfile: result.productProfile || '',
          productProfileEn: result.productProfileEn || '',
          extraPrompt: prompt
        }
      })
    } catch (err: any) {
      setReplicateError(err?.message || '复刻失败，请重试')
    } finally {
      setIsReplicating(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: 'var(--fg)',
          margin: '0 0 8px 0',
          fontFamily: 'var(--font-display)'
        }}>
          一键复刻爆款详情页风格
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--fg-muted)', margin: 0 }}>
          上传参考设计图，AI 智能分析风格并应用到您的产品图上
        </p>
      </div>

      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        background: 'var(--bg-muted)',
        borderRadius: 'var(--radius-md)',
        padding: '4px',
        width: 'fit-content',
        margin: '0 auto 20px'
      }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 24px',
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

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        <div style={{
          flex: '0 0 42%',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg)' }}>
              风格复刻设置
            </span>

          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>参考设计图</label>
            {refImages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                {refImages.map((img, i) => (
                  <div key={i} style={{
                    position: 'relative', width: '72px', height: '72px',
                    borderRadius: 'var(--radius-md)', overflow: 'hidden',
                    border: '1px solid var(--border)',
                  }}>
                    <img src={img.dataUrl} alt={img.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => setPreviewUrl(img.dataUrl)} style={eyeBtnStyle}>
                      <Eye size={12} />
                    </button>
                    <button onClick={() => handleRemoveRefImage(i)} style={removeBtnStyle}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <UploadArea count={refImages.length} maxCount={1} label="上传爆款参考设计图" onUpload={handleSelectRefImages} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>产品素材图</label>
            {productImages.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                {productImages.map((img, i) => (
                  <div key={i} style={{
                    position: 'relative', width: '72px', height: '72px',
                    borderRadius: 'var(--radius-md)', overflow: 'hidden',
                    border: '1px solid var(--border)',
                  }}>
                    <img src={img.dataUrl} alt={img.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button onClick={() => setPreviewUrl(img.dataUrl)} style={eyeBtnStyle}>
                      <Eye size={12} />
                    </button>
                    <button onClick={() => handleRemoveProductImage(i)} style={removeBtnStyle}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <UploadArea count={productImages.length} maxCount={6} label="上传您的产品图片" onUpload={handleSelectProductImages} />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>补充提示词</label>
            <div style={{ position: 'relative' }}>
              <Textarea
                value={prompt}
                onChange={setPrompt}
                placeholder="描述您希望的风格细节、特殊要求..."
                rows={3}
              />
              <button
                onClick={() => setAiModalOpen(true)}
                style={aiWriteBtnStyle}
              >
                <Sparkles size={12} />
                AI帮写
              </button>
            </div>
          </div>

          <div style={{
            background: 'var(--bg-muted)',
            borderRadius: 'var(--radius-md)',
            padding: '14px',
            marginBottom: '14px'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginBottom: '10px'
            }}>
              <div>
                <label style={labelStyle}>文案模型</label>
                <Select
                  value={form.textModel}
                  onChange={(v) => setForm((f) => ({ ...f, textModel: v }))}
                  options={textModelOptions}
                  placeholder="AI 写作/识图"
                />
              </div>
              <div>
                <label style={labelStyle}>生图模型</label>
                <Select
                  value={form.imageModel}
                  onChange={(v) => setForm((f) => ({ ...f, imageModel: v }))}
                  options={imageModelOptions}
                  placeholder="图片生成"
                />
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '10px',
              marginBottom: '12px'
            }}>
              <div>
                <label style={labelStyle}>图片尺寸</label>
                <Select
                  value={form.size}
                  onChange={(v) => setForm((f) => ({ ...f, size: v }))}
                  options={[
                    { value: '1:1', label: '1:1 (800×800)' },
                    { value: '3:4', label: '3:4 (600×800)' },
                    { value: '16:9', label: '16:9 (1200×675)' }
                  ]}
                  placeholder="选择尺寸"
                />
              </div>
              <div>
                <label style={labelStyle}>输出质量</label>
                <Select
                  value={form.quality}
                  onChange={(v) => setForm((f) => ({ ...f, quality: v }))}
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
                  value={form.quantity}
                  onChange={(v) => setForm((f) => ({ ...f, quantity: v }))}
                  options={[
                    { value: '1', label: '1 张' },
                    { value: '2', label: '2 张' },
                    { value: '4', label: '4 张' }
                  ]}
                  placeholder="选择数量"
                />
              </div>
            </div>

            <div style={{ marginBottom: '4px' }}>
              <label style={labelStyle}>生成速度</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                {speeds.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSpeed(s.key)}
                    style={{
                      flex: 1,
                      padding: '7px 0',
                      fontSize: '12px',
                      fontWeight: speed === s.key ? 600 : 400,
                      border: speed === s.key ? '1px solid var(--brand)' : '1px solid var(--border)',
                      borderRadius: 'var(--radius-full)',
                      cursor: 'pointer',
                      background: speed === s.key ? 'var(--brand-glow)' : 'transparent',
                      color: speed === s.key ? 'var(--brand)' : 'var(--fg-muted)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {replicateError && (
            <div style={{
              fontSize: '12px',
              color: 'var(--danger)',
              marginBottom: '8px',
              textAlign: 'center'
            }}>
              {replicateError}
            </div>
          )}
          <Button variant="primary" onClick={handleReplicate} disabled={isReplicating} style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}>
            <Wand2 size={16} />
            {isReplicating ? '复刻中...' : '开始复刻'}
          </Button>
        </div>

        <div style={{
          flex: '1',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          minHeight: '500px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px'
        }}>
          {isReplicating ? (
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
                  正在复刻产品风格...
                </p>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  AI 正在分析参考图风格并应用到您的产品上，请稍候
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
                  复刻结果预览
                </p>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  上传参考图和产品图后，开始风格复刻
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="anim-stagger" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginTop: '24px'
      }}>
        {features.map((feat) => {
          const Icon = feat.icon
          return (
            <div
              key={feat.title}
              className="anim-card"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                textAlign: 'center'
              }}
            >
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--brand-glow)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <Icon size={22} style={{ color: 'var(--brand)' }} />
              </div>
              <h3 style={{
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--fg)',
                margin: '0 0 6px 0'
              }}>
                {feat.title}
              </h3>
              <p style={{
                fontSize: '12px',
                color: 'var(--fg-muted)',
                margin: 0,
                lineHeight: '1.6'
              }}>
                {feat.desc}
              </p>
            </div>
          )
        })}
      </div>

      <AiWriteModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onApply={(text) => {
          setPrompt(text)
          setAiModalOpen(false)
        }}
        productImages={[
          ...refImages.map(img => img.dataUrl),
          ...productImages.map(img => img.dataUrl),
        ]}
        productInfo={prompt}
        context=""
      />

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

const removeBtnStyle: React.CSSProperties = {
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
}

const eyeBtnStyle: React.CSSProperties = {
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
}
