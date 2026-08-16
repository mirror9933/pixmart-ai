import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Eye, X, RefreshCw, CheckCircle2, ImagePlus } from 'lucide-react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import SearchableSelect from '@/components/ui/SearchableSelect'
import UploadArea, { type UploadedFile } from '@/components/ui/UploadArea'
import { useModelOptions } from '@/hooks/useModelOptions'
import { MAIN_DETAIL_SIZE_OPTIONS } from '@/constants/sizeOptions'

/** 白底图生成:上传产品图 → 选生图模型/尺寸 → AI 生成纯白背景商品图(单张处理,UI 与全品类商品图一致) */
export function WhiteBgGenerator({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate()
  const { imageModels } = useModelOptions()
  const taskIdsRef = useRef<string[]>([])

  const [images, setImages] = useState<UploadedFile[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [size, setSize] = useState('1:1')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // 任务状态轮询
  useEffect(() => {
    const unsub = window.api.ai.onTaskUpdate((task: any) => {
      if (!taskIdsRef.current.includes(task.id)) return
      if (task.status === 'completed' && task.result?.url) {
        setResult(task.result.url)
        setGenerating(false)
        setMsg('')
      } else if (task.status === 'failed') {
        setError(task.error || '生成失败，请重试')
        setGenerating(false)
      }
    })
    return () => unsub()
  }, [])

  const handleSelectImages = (files: UploadedFile[]) => {
    // 仅支持单张上传:新选择的图片直接替换旧图
    const first = files[0]
    if (first) setImages([first])
    setResult(null)
    setError('')
  }

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
    setResult(null)
  }

  /** UploadArea 提供的是 blob URL,后端参考图只接受 data:image/ 前缀的 base64,需转换 */
  const toBase64DataUrl = async (blobUrl: string): Promise<string> => {
    const resp = await fetch(blobUrl)
    const blob = await resp.blob()
    return new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(new Error('图片读取失败'))
      fr.readAsDataURL(blob)
    })
  }

  const handleGenerate = async () => {
    if (generating) return
    const rawSource = images[0]?.dataUrl
    if (!rawSource) { setError('请先上传产品图片'); return }
    if (!model) { setError('请先选择生图模型'); return }
    setError('')
    setMsg('')
    setGenerating(true)
    setResult(null)
    try {
      const source = await toBase64DataUrl(rawSource)
      const project = await window.api.projects.create({
        title: '白底图生成',
        description: '',
        category: '其他功能',
        categoryLabel: '其他功能',
        sourceImages: images.map(img => img.dataUrl)
      })
      const prompt = `E-commerce white-background product photo: remove the original background and place the product on a pure white background (#FFFFFF). The product must remain EXACTLY the same - identical shape, colors, materials, surface details and any packaging text. Product fully visible, complete, centered, no cropping. Soft even studio lighting, clean precise edges, realistic material rendering, crisp focus, commercial quality. No text added, no watermark, no props, no gradients on the background, no reflections on the background.`
      const response = await window.api.ai.generateImages({
        projectId: project.id,
        prompts: [{ id: 'white-1', prompt, size, referenceImages: [source] }],
        quality: 'hd',
        model,
        referenceImages: [],
        productProfile: '',
        productProfileEn: ''
      })
      taskIdsRef.current = response.taskIds || []
    } catch (err: any) {
      setError(err?.message || '生成失败')
      setGenerating(false)
    }
  }

  /** 导出:本地保存或导入到其他页面 */
  const handleExport = async (target: string) => {
    if (!result) return
    if (target === 'local') {
      setSaving(true)
      setMsg('')
      try {
        const res = await window.api.files.saveToExports(result)
        if (res?.path) {
          setMsg(`已保存到：${res.path}`)
          window.api.files.openPath(res.path)
        } else {
          setMsg('保存成功')
        }
      } catch (err: any) {
        setMsg(`保存失败：${err?.message || '未知错误'}`)
      } finally {
        setSaving(false)
      }
      return
    }
    try {
      sessionStorage.setItem('pixmart-import-images', JSON.stringify({
        target,
        images: [result]
      }))
      const label = target === 'main' ? '主图' : target === 'detail' ? '详情图' : target === 'ad' ? '广告图' : '风格复刻'
      setMsg(`白底图已导入${label}，正在跳转...`)
      setTimeout(() => {
        navigate(target === 'style' ? '/style-replication' : '/')
      }, 900)
    } catch (err: any) {
      setMsg(`导出失败：${err?.message || '未知错误'}`)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--fg-secondary)',
    marginBottom: '8px'
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </Button>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--fg)', margin: 0, fontFamily: 'var(--font-display)' }}>
          白底图生成
        </h1>
        <div style={{ flex: 1 }} />
        {result && (
          <Select
            value=""
            onChange={(v) => handleExport(v)}
            options={[
              { value: 'local', label: '导出到本地' },
              { value: 'main', label: '导出到主图' },
              { value: 'detail', label: '导出到详情图' },
              { value: 'ad', label: '导出到广告图' },
              { value: 'style', label: '导出到风格复刻' }
            ]}
            placeholder={saving ? '保存中...' : '导出图片...'}
            style={{ minWidth: '160px' }}
          />
        )}
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: '16px',
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 'var(--radius-md)', fontSize: '12px', color: '#ef4444'
        }}>
          {error}
        </div>
      )}
      {msg && (
        <div style={{
          padding: '10px 14px', marginBottom: '16px',
          background: 'rgba(22, 163, 74, 0.1)', border: '1px solid rgba(22, 163, 74, 0.3)',
          borderRadius: 'var(--radius-md)', fontSize: '12px', color: '#16a34a'
        }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* 左侧:上传 + 设置(与全品类商品图一致的 UI) */}
        <div style={{
          flex: '0 0 340px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div>
            <label style={labelStyle}>产品图</label>
            {images.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                {images.map((img, i) => (
                  <div key={i} style={{
                    position: 'relative', width: '72px', height: '72px',
                    borderRadius: 'var(--radius-md)', overflow: 'hidden',
                    border: '1px solid var(--border)'
                  }}>
                    <img src={img.dataUrl} alt={img.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button
                      onClick={() => setPreviewUrl(img.dataUrl)}
                      style={{
                        position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px',
                        borderRadius: '4px', background: 'rgba(0,0,0,0.55)', color: '#fff',
                        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: 0, transition: 'opacity 0.15s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0' }}
                    >
                      <Eye size={12} />
                    </button>
                    <button
                      onClick={() => handleRemoveImage(i)}
                      style={{
                        position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px',
                        borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: '10px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <UploadArea
              count={images.length}
              maxCount={1}
              label="上传产品图片"
              onUpload={handleSelectImages}
            />
          </div>

          <div>
            <label style={labelStyle}>生图模型</label>
            <SearchableSelect
              value={model}
              onChange={setModel}
              options={imageModels}
              placeholder="选择生图模型"
            />
          </div>
          <div>
            <label style={labelStyle}>输出尺寸</label>
            <Select
              value={size}
              onChange={setSize}
              options={MAIN_DETAIL_SIZE_OPTIONS}
              placeholder="选择尺寸"
            />
          </div>
          <Button variant="primary" onClick={handleGenerate} disabled={generating} style={{ width: '100%' }}>
            {generating ? '生成中...' : <><RefreshCw size={15} /> 生成白底图</>}
          </Button>
        </div>

        {/* 右侧:预览区(与全品类商品图一致) */}
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
          {generating ? (
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
                  正在生成白底图...
                </p>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  AI 正在为产品图生成纯白背景，请稍候
                </p>
              </div>
            </>
          ) : result ? (
            <>
              <img
                src={result}
                alt="白底图结果"
                style={{ maxWidth: '100%', maxHeight: '480px', objectFit: 'contain', borderRadius: 'var(--radius-md)' }}
              />
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--fg-muted)' }}>
                生成完成，可通过右上角「导出图片」保存或导入其他页面
              </p>
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
                  白底图生成预览
                </p>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
                  上传产品图并选择模型后，点击生成白底图
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 图片预览 overlay */}
      {previewUrl && (
        <div
          onClick={() => setPreviewUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out'
          }}
        >
          <img src={previewUrl} alt="预览" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  )
}

export default WhiteBgGenerator
