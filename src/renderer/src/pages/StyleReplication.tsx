import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ImagePlus, Wand2, Plus,
  Zap, Eye, X, RefreshCw
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Textarea from '@/components/ui/Textarea'
import ErrorModal from '@/components/shared/ErrorModal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import UploadArea, { type UploadedFile } from '@/components/ui/UploadArea'
import { useModelOptions } from '@/hooks/useModelOptions'
import { buildAiErrorMessage } from '@/utils/aiError'

export default function StyleReplication() {
  const navigate = useNavigate()
  const { textModels: textModelOptions, imageModels: imageModelOptions } = useModelOptions()
  const [prompt, setPrompt] = useState('')
  const [form, setForm] = useState({
    textModel: '',
    imageModel: '',
    size: '',
    quality: '',
    quantity: ''
  })
  const [refImages, setRefImages] = useState<UploadedFile[]>([])
  const [productImages, setProductImages] = useState<UploadedFile[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isReplicating, setIsReplicating] = useState(false)
  const [replicateError, setReplicateError] = useState('')
  // 错误弹窗(模型校验 / 分析失败 / 模型不支持识图等)
  const [errorModal, setErrorModal] = useState<{ title?: string; message: string } | null>(null)
  // 刷新(重置表单)确认弹窗
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  // 挂载时恢复临时保存的表单/图片;模型默认用上次使用的(last_models.style)
  useEffect(() => {
    (async () => {
      try {
        const [state, lastModelsRaw] = await Promise.all([
          window.api.files.loadTempState('styleReplication'),
          window.api.settings.get('last_models')
        ])
        let lastModels: any = {}
        try { lastModels = lastModelsRaw ? JSON.parse(lastModelsRaw) : {} } catch {}
        const defaultModels = {
          textModel: lastModels.style?.textModel || '',
          imageModel: lastModels.style?.imageModel || ''
        }
        if (state && typeof state === 'object') {
          if (typeof state.prompt === 'string') setPrompt(state.prompt)
          if (state.form) {
            setForm({
              ...state.form,
              textModel: state.form.textModel || defaultModels.textModel,
              imageModel: state.form.imageModel || defaultModels.imageModel
            })
          } else {
            setForm((f) => ({ ...f, ...defaultModels }))
          }
          if (state.refImages?.length) setRefImages(state.refImages)
          if (state.productImages?.length) setProductImages(state.productImages)
        } else {
          setForm((f) => ({ ...f, ...defaultModels }))
        }
      } catch {}
      // 从图片编辑导入的图片(导出到本页):合并进产品图列表
      try {
        const raw = sessionStorage.getItem('pixmart-import-images')
        if (raw) {
          sessionStorage.removeItem('pixmart-import-images')
          const data = JSON.parse(raw)
          const urls: string[] = Array.isArray(data) ? data : data?.images
          if (Array.isArray(urls) && urls.length > 0) {
            const imported = urls.map((u, i) => ({
              path: '',
              name: `edited-${Date.now()}-${i + 1}.png`,
              size: Math.round(u.length * 0.75),
              dataUrl: u
            }))
            setProductImages(prev => [...prev, ...imported])
          }
        }
      } catch {}
    })()
  }, [])

  // 表单输入实时自动保存(500ms 防抖);模型选择单独持久化到 last_models(合并,不覆盖其他页面)
  useEffect(() => {
    const timer = setTimeout(() => {
      window.api.settings.get('last_models').then((raw) => {
        let prev: any = {}
        try { prev = raw ? JSON.parse(raw) : {} } catch {}
        window.api.settings.set('last_models', JSON.stringify({
          ...prev,
          style: { textModel: form.textModel, imageModel: form.imageModel }
        })).catch(() => {})
      }).catch(() => {})
      window.api.files.saveTempState('styleReplication', {
        prompt,
        form,
        refImages: refImages.map(img => ({ path: img.path, name: img.name, size: img.size, dataUrl: img.dataUrl })),
        productImages: productImages.map(img => ({ path: img.path, name: img.name, size: img.size, dataUrl: img.dataUrl }))
      }).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [prompt, form, refImages, productImages])

  /** 刷新按钮:重置表单(清空输入),但保留文案模型/生图模型为上次使用的 */
  const handleResetForm = () => {
    setResetConfirmOpen(true)
  }

  /** 执行重置(确认后) */
  const doResetForm = async () => {
    let lastModels: any = {}
    try {
      const raw = await window.api.settings.get('last_models')
      if (raw) lastModels = JSON.parse(raw)
    } catch {}
    setPrompt('')
    setForm({
      textModel: lastModels.style?.textModel || '',
      imageModel: lastModels.style?.imageModel || '',
      size: '',
      quality: '',
      quantity: ''
    })
    setRefImages([])
    setProductImages([])
    // 清空已保存的临时状态,避免下次打开恢复旧值
    try { await window.api.files.saveTempState('styleReplication', {}) } catch {}
  }

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
    // 模型必选校验:风格分析(识图)需要文案模型
    if (!form.textModel) {
      setReplicateError('请先选择文案模型')
      setErrorModal({
        title: '请先选择模型',
        message: '风格复刻需要 AI 识别产品图片。请先在「文案模型」中选择一个支持识图的模型。'
      })
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
      const msg = err?.message || '复刻失败，请重试'
      setReplicateError(msg)
      setErrorModal({
        title: '风格分析失败',
        message: buildAiErrorMessage(msg, '复刻失败，请重试', 'text')
      })
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
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：添加「限时特惠」文字，使用红色主题.."
              rows={3}
            />
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
                <SearchableSelect
                  value={form.textModel}
                  onChange={(v) => setForm((f) => ({ ...f, textModel: v }))}
                  options={textModelOptions}
                  placeholder="AI 写作/识图"
                />
              </div>
              <div>
                <label style={labelStyle}>生图模型</label>
                <SearchableSelect
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
                    { value: '4', label: '4 张' },
                    { value: '6', label: '6 张' },
                    { value: '8', label: '8 张' },
                    { value: '10', label: '10 张' }
                  ]}
                  placeholder="选择数量"
                />
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

      {/* 错误弹窗 */}
      {/* 刷新(重置表单)确认弹窗 */}
      <ConfirmDialog
        open={resetConfirmOpen}
        title="重置表单"
        message="确定要重置当前表单吗？输入的内容将清空（文案模型和生图模型会保留上次使用的）。"
        confirmText="确定重置"
        cancelText="取消"
        onConfirm={() => {
          setResetConfirmOpen(false)
          doResetForm()
        }}
        onCancel={() => setResetConfirmOpen(false)}
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
