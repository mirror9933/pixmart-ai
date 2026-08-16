import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2,
  Crop as CropIcon, FolderDown, Upload, RefreshCw, Check, X
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { MAIN_DETAIL_SIZE_OPTIONS } from '@/constants/sizeOptions'

interface Filters { brightness: number; contrast: number; saturate: number; grayscale: number; blur: number }
const DEFAULT_FILTERS: Filters = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, blur: 0 }

interface CropBox { x: number; y: number; w: number; h: number }

/** 解析 '3:2' 为目标宽高比数值 */
function parseRatio(size: string): number {
  const m = size.match(/^(\d+):(\d+)$/)
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10)
  return 1
}

const FILTER_PRESETS: Array<{ label: string; value: Filters }> = [
  { label: '原图', value: DEFAULT_FILTERS },
  { label: '黑白', value: { brightness: 100, contrast: 110, saturate: 0, grayscale: 100, blur: 0 } },
  { label: '暖色', value: { brightness: 105, contrast: 100, saturate: 110, grayscale: 0, blur: 0 } },
  { label: '冷色', value: { brightness: 100, contrast: 100, saturate: 90, grayscale: 0, blur: 0 } },
  { label: '复古', value: { brightness: 95, contrast: 85, saturate: 75, grayscale: 10, blur: 0 } },
  { label: '清晰', value: { brightness: 105, contrast: 120, saturate: 115, grayscale: 0, blur: 0 } }
]

/** 简单图片编辑工具:上传 → 裁剪/旋转/翻转/滤镜 → 导出(纯 Canvas 实现,无第三方依赖) */
export function ImageEditor({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const viewBoxRef = useRef<HTMLDivElement | null>(null)

  const [source, setSource] = useState<string | null>(null)
  const [natSize, setNatSize] = useState<{ w: number; h: number } | null>(null)
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [cropMode, setCropMode] = useState(false)
  const [cropBox, setCropBox] = useState<CropBox | null>(null)
  /** 固定裁剪尺寸(参考应用图片尺寸,如 '3:2');null = 自由尺寸 */
  const [cropRatio, setCropRatio] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // 拖动/缩放裁剪框
  const dragRef = useRef<{ type: 'move' | 'resize'; startX: number; startY: number; box: CropBox } | null>(null)

  /** 加载图片文件 */
  const loadFile = useCallback((file: File) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        setNatSize({ w: img.naturalWidth, h: img.naturalHeight })
        setSource(dataUrl)
        setRotation(0)
        setFlipH(false)
        setFlipV(false)
        setFilters(DEFAULT_FILTERS)
        setCropMode(false)
        setCropBox(null)
        setMsg('')
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) loadFile(f)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) loadFile(f)
  }

  /** 渲染主画布:旋转/翻转/滤镜全部在绘制时应用 */
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !natSize) return
    const rot = ((rotation % 360) + 360) % 360
    const swap = rot === 90 || rot === 270
    const w = swap ? natSize.h : natSize.w
    const h = swap ? natSize.w : natSize.h
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturate}%) grayscale(${filters.grayscale}%) blur(${filters.blur}px)`
    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    ctx.drawImage(img, -natSize.w / 2, -natSize.h / 2, natSize.w, natSize.h)
    ctx.restore()
  }, [source, natSize, rotation, flipH, flipV, filters])

  // 裁剪框初始位置(canvas 显示空间内,固定比例时取该比例最大内接矩形居中,自由时取 80% 居中)
  const initCropBox = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    if (!cw || !ch) return
    const target = cropRatio ? parseRatio(cropRatio) : 0
    let bw = Math.round(cw * 0.8)
    let bh = Math.round(ch * 0.8)
    if (target) {
      const cur = cw / ch
      if (cur > target) {
        bw = Math.round(ch * target)
        bh = ch
      } else {
        bw = cw
        bh = Math.round(cw / target)
      }
    }
    setCropBox({ x: Math.round((cw - bw) / 2), y: Math.round((ch - bh) / 2), w: bw, h: bh })
  }

  const handleEnterCrop = () => {
    setCropMode(true)
    initCropBox()
  }

  // 固定尺寸切换时,按新比例重新初始化裁剪框
  useEffect(() => {
    if (cropMode && source) {
      requestAnimationFrame(initCropBox)
    }
  }, [cropRatio])

  const handleCropMouseDown = (e: React.MouseEvent, type: 'move' | 'resize') => {
    if (!cropBox) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { type, startX: e.clientX, startY: e.clientY, box: { ...cropBox } }
  }

  const handleCropMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current || !cropBox) return
    const { type, startX, startY, box: startBox } = dragRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const vw = canvas.clientWidth
    const vh = canvas.clientHeight
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (type === 'move') {
      const nx = Math.max(0, Math.min(startBox.x + dx, vw - startBox.w))
      const ny = Math.max(0, Math.min(startBox.y + dy, vh - startBox.h))
      setCropBox({ ...startBox, x: Math.round(nx), y: Math.round(ny) })
    } else {
      // 右下角手柄:缩放选框(选择固定尺寸时锁定比例,否则自由)
      const ratio = cropRatio ? parseRatio(cropRatio) : 0
      let nw = startBox.w + dx
      if (ratio) {
        let nh = nw / ratio
        // 边界限制:不超出图片右下边界,并保持比例
        const maxW = Math.min(vw - startBox.x, (vh - startBox.y) * ratio)
        nw = Math.max(48, Math.min(nw, maxW))
        nh = nw / ratio
        if (nh > vh - startBox.y) {
          nh = vh - startBox.y
          nw = nh * ratio
        }
        if (nw < 48) {
          nw = 48
          nh = nw / ratio
        }
        setCropBox({ x: startBox.x, y: startBox.y, w: Math.round(nw), h: Math.round(nh) })
      } else {
        let nh = startBox.h + dy
        nw = Math.max(48, Math.min(nw, vw - startBox.x))
        nh = Math.max(48, Math.min(nh, vh - startBox.y))
        setCropBox({ x: startBox.x, y: startBox.y, w: Math.round(nw), h: Math.round(nh) })
      }
    }
  }

  const handleCropMouseUp = () => { dragRef.current = null }

  /** 确认裁剪:基于当前渲染结果裁剪,作为新的底图 */
  const applyCrop = () => {
    const canvas = canvasRef.current
    if (!canvas || !cropBox) return
    const scaleX = canvas.width / canvas.clientWidth
    const scaleY = canvas.height / canvas.clientHeight
    let sx = Math.round(cropBox.x * scaleX)
    let sy = Math.round(cropBox.y * scaleY)
    let sw = Math.round(cropBox.w * scaleX)
    let sh = Math.round(cropBox.h * scaleY)
    sx = Math.max(0, Math.min(sx, canvas.width - 1))
    sy = Math.max(0, Math.min(sy, canvas.height - 1))
    sw = Math.min(sw, canvas.width - sx)
    sh = Math.min(sh, canvas.height - sy)
    const out = document.createElement('canvas')
    out.width = sw
    out.height = sh
    const ctx = out.getContext('2d')
    if (!ctx) return
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh)
    const newData = out.toDataURL('image/png')
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setNatSize({ w: img.naturalWidth, h: img.naturalHeight })
      setSource(newData)
      setRotation(0)
      setFlipH(false)
      setFlipV(false)
      setFilters(DEFAULT_FILTERS)
      setCropMode(false)
      setCropBox(null)
    }
    img.src = newData
  }

  const cancelCrop = () => {
    setCropMode(false)
    setCropBox(null)
  }

  /** 导出:保存到配置的导出目录并打开 */
  const handleExport = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    setSaving(true)
    setMsg('')
    try {
      const res = await window.api.files.saveToExports(canvas.toDataURL('image/png'))
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
  }

  /** 导出下拉选择处理:local = 本地保存;main/detail/ad = 全品类商品图对应 tab;style = 风格复刻 */
  const handleExportChoice = (v: string) => {
    if (v === 'local') {
      handleExport()
      return
    }
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      sessionStorage.setItem('pixmart-import-images', JSON.stringify({
        target: v,
        images: [canvas.toDataURL('image/png')]
      }))
      // 先提示已导入,再跳转到目标页面
      const targetLabel = v === 'main' ? '主图' : v === 'detail' ? '详情图' : v === 'ad' ? '广告图' : '风格复刻'
      setMsg(`图片已导入${targetLabel}，正在跳转...`)
      setTimeout(() => {
        navigate(v === 'style' ? '/style-replication' : '/')
      }, 900)
    } catch (err: any) {
      setMsg(`导出失败：${err?.message || '未知错误'}`)
    }
  }

  const filterLabel = (k: keyof Filters) =>
    k === 'brightness' ? '亮度' : k === 'contrast' ? '对比度' : k === 'saturate' ? '饱和度' : k === 'grayscale' ? '灰度' : '模糊'

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* 顶栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} />
          返回
        </Button>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--fg)', margin: 0, fontFamily: 'var(--font-display)' }}>
          图片编辑
        </h1>
        <div style={{ flex: 1 }} />
        {source && (
          <Select
            value=""
            onChange={handleExportChoice}
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

      {msg && (
        <div style={{
          padding: '10px 14px',
          marginBottom: '16px',
          background: 'rgba(22, 163, 74, 0.1)',
          border: '1px solid rgba(22, 163, 74, 0.3)',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          color: '#16a34a'
        }}>
          {msg}
        </div>
      )}

      {!source ? (
        /* 上传区 */
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            minHeight: '50vh',
            border: dragging ? '2px solid var(--brand)' : '2px dashed var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: dragging ? 'var(--brand-glow)' : 'var(--bg-surface)',
            color: 'var(--fg-muted)',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <Upload size={40} style={{ color: 'var(--brand)' }} />
          <p style={{ margin: 0, fontSize: '14px' }}>
            点击选择图片，或拖拽图片到此处
          </p>
          <p style={{ margin: 0, fontSize: '12px' }}>
            支持 JPG / PNG / WebP
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* 预览区 */}
          <div style={{ flex: '1 1 560px', minWidth: 0 }}>
            <div
              ref={viewBoxRef}
              style={{
                position: 'relative',
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                userSelect: 'none'
              }}
              onMouseMove={cropMode ? handleCropMouseMove : undefined}
              onMouseUp={handleCropMouseUp}
              onMouseLeave={handleCropMouseUp}
            >
              <canvas
                ref={canvasRef}
                style={{
                  maxWidth: '100%',
                  maxHeight: '60vh',
                  objectFit: 'contain',
                  display: 'block',
                  borderRadius: 'var(--radius-sm)'
                }}
              />
              {/* 裁剪框覆盖层(基于 canvas 显示位置) */}
              {cropMode && cropBox && canvasRef.current && (() => {
                const canvas = canvasRef.current as HTMLCanvasElement
                const ox = canvas.offsetLeft
                const oy = canvas.offsetTop
                const cw = canvas.clientWidth
                const ch = canvas.clientHeight
                const b = cropBox
                return (
                  <>
                    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: oy + b.y, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: 0, top: oy + b.y + b.h, width: '100%', height: `calc(100% - ${oy + b.y + b.h}px)`, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: 0, top: oy + b.y, width: ox + b.x, height: b.h, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: ox + b.x + b.w, top: oy + b.y, width: `calc(100% - ${ox + b.x + b.w}px)`, height: b.h, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
                    <div
                      onMouseDown={(e) => handleCropMouseDown(e, 'move')}
                      style={{
                        position: 'absolute', left: ox + b.x, top: oy + b.y, width: b.w, height: b.h,
                        border: '2px solid var(--brand)', boxSizing: 'border-box', cursor: 'move'
                      }}
                    >
                      <div
                        onMouseDown={(e) => handleCropMouseDown(e, 'resize')}
                        style={{
                          position: 'absolute', right: -7, bottom: -7, width: 16, height: 16,
                          borderRadius: '50%', background: 'var(--brand)', border: '2px solid #fff',
                          cursor: 'nwse-resize', boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </>
                )
              })()}
            </div>

            {/* 编辑工具栏 */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '8px',
              marginTop: '12px', padding: '10px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)'
            }}>
              {!cropMode ? (
                <>
                  <Button size="sm" variant="secondary" onClick={handleEnterCrop}>
                    <CropIcon size={14} /> 裁剪
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRotation(r => r + 90)}>
                    <RotateCw size={14} /> 右旋
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRotation(r => r - 90)}>
                    <RotateCcw size={14} /> 左旋
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setFlipH(f => !f)}>
                    <FlipHorizontal2 size={14} /> 水平翻转
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setFlipV(f => !f)}>
                    <FlipVertical2 size={14} /> 垂直翻转
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    onClick={() => {
                      setRotation(0); setFlipH(false); setFlipV(false); setFilters(DEFAULT_FILTERS)
                    }}
                  >
                    <RefreshCw size={14} /> 重置
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="primary" onClick={applyCrop}>
                    <Check size={14} /> 确认裁剪
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelCrop}>
                    <X size={14} /> 取消
                  </Button>
                  <Select
                    value={cropRatio || 'free'}
                    onChange={(v) => setCropRatio(v === 'free' ? null : v)}
                    options={[{ value: 'free', label: '自由尺寸' }, ...MAIN_DETAIL_SIZE_OPTIONS]}
                    style={{ minWidth: '150px', height: '30px', padding: '0 8px' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--fg-muted)', alignSelf: 'center', marginLeft: '4px' }}>
                    {cropRatio
                      ? `已锁定比例 ${cropRatio}，拖拽手柄按比例缩放`
                      : '拖动选框移动，拖拽右下角手柄调整大小'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* 滤镜/调节面板 */}
          <div style={{
            flex: '0 0 240px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>滤镜预设</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {FILTER_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setFilters({ ...p.value })}
                  style={{
                    padding: '5px 0',
                    fontSize: '11px',
                    border: filters.brightness === p.value.brightness && filters.contrast === p.value.contrast && filters.saturate === p.value.saturate && filters.grayscale === p.value.grayscale && filters.blur === p.value.blur
                      ? '1px solid var(--brand)'
                      : '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-muted)',
                    color: 'var(--fg)',
                    cursor: 'pointer'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '2px 0' }} />
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>调节</p>
            {(Object.keys(DEFAULT_FILTERS) as Array<keyof Filters>).map(k => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--fg-secondary)' }}>{filterLabel(k)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>{filters[k]}{k === 'blur' ? 'px' : ''}</span>
                </div>
                <input
                  type="range"
                  min={k === 'brightness' || k === 'contrast' || k === 'saturate' ? 0 : k === 'blur' ? 0 : 0}
                  max={k === 'brightness' ? 200 : k === 'contrast' ? 200 : k === 'saturate' ? 200 : k === 'grayscale' ? 100 : 10}
                  value={filters[k]}
                  onChange={(e) => setFilters(f => ({ ...f, [k]: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: 'var(--brand)' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ImageEditor
