import { useEffect, useRef, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface CropModalProps {
  open: boolean
  /** 待裁剪图片(data URL) */
  image: string
  /** 目标比例(如 '3:2')或像素(如 '1792x1024') */
  size: string
  onConfirm: (cropped: string) => void
  onCancel: () => void
}

interface Box { x: number; y: number; w: number; h: number }

/** 解析 '3:2' 或 '1792x1024' 为目标宽高比数值 */
function parseRatio(size: string): number {
  const m = size.match(/^(\d+):(\d+)$/)
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10)
  const mp = size.match(/^(\d+)x(\d+)$/)
  if (mp) return parseInt(mp[1], 10) / parseInt(mp[2], 10)
  return 1
}

/** 手动裁剪弹窗:固定目标比例裁剪框,可拖动位置、拖拽四角缩放,确认后按框裁剪输出 */
export function CropModal({ open, image, size, onConfirm, onCancel }: CropModalProps) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [view, setView] = useState<{ w: number; h: number } | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const targetRatioRef = useRef(1)
  const dragRef = useRef<{ type: 'move' | 'resize'; startX: number; startY: number; box: Box } | null>(null)

  useEffect(() => {
    if (!open || !image) return
    setNat(null)
    setView(null)
    setBox(null)
    const img = new Image()
    img.onload = () => {
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      if (!nw || !nh) return
      setNat({ w: nw, h: nh })
      // 显示尺寸:最长边 480
      const scale = Math.min(1, 480 / Math.max(nw, nh))
      const vw = Math.round(nw * scale)
      const vh = Math.round(nh * scale)
      setView({ w: vw, h: vh })
      // 初始裁剪框:目标比例的最大内接矩形,居中
      const target = parseRatio(size)
      targetRatioRef.current = target
      const cur = vw / vh
      let bw = vw
      let bh = vh
      if (cur > target) bw = Math.round(vh * target)
      else bh = Math.round(vw / target)
      setBox({ x: Math.round((vw - bw) / 2), y: Math.round((vh - bh) / 2), w: bw, h: bh })
    }
    img.src = image
  }, [open, image, size])

  /** 移动或缩放选框的最小显示尺寸 */
  const MIN_BOX = 72

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'resize') => {
    if (!box) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { type, startX: e.clientX, startY: e.clientY, box: { ...box } }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragRef.current || !view) return
    const { type, startX, startY, box: startBox } = dragRef.current
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (type === 'move') {
      let nx = startBox.x + dx
      let ny = startBox.y + dy
      nx = Math.max(0, Math.min(nx, view.w - startBox.w))
      ny = Math.max(0, Math.min(ny, view.h - startBox.h))
      setBox({ ...startBox, x: Math.round(nx), y: Math.round(ny) })
    } else {
      // 缩放:锚定左上角,按目标比例调整宽高
      const target = targetRatioRef.current
      let nw = startBox.w + dx
      // 最小/最大限制(不超出图片右下边界)
      nw = Math.max(MIN_BOX, Math.min(nw, view.w - startBox.x))
      let nh = nw / target
      if (nh > view.h - startBox.y) {
        nh = view.h - startBox.y
        nw = nh * target
      }
      if (nw < MIN_BOX) {
        nw = MIN_BOX
        nh = nw / target
      }
      setBox({
        x: startBox.x,
        y: startBox.y,
        w: Math.round(nw),
        h: Math.round(nh)
      })
    }
  }

  const handleMouseUp = () => { dragRef.current = null }

  /** 重置为最大内接选框 */
  const handleReset = () => {
    if (!view) return
    const target = targetRatioRef.current
    const cur = view.w / view.h
    let bw = view.w
    let bh = view.h
    if (cur > target) bw = Math.round(view.h * target)
    else bh = Math.round(view.w / target)
    setBox({ x: Math.round((view.w - bw) / 2), y: Math.round((view.h - bh) / 2), w: bw, h: bh })
  }

  const handleConfirm = () => {
    if (!nat || !view || !box) return
    const scale = nat.w / view.w
    let sx = Math.round(box.x * scale)
    let sy = Math.round(box.y * scale)
    let sw = Math.round(box.w * scale)
    let sh = Math.round(box.h * scale)
    // 边界修正(避免取整越界)
    sx = Math.max(0, Math.min(sx, nat.w - 1))
    sy = Math.max(0, Math.min(sy, nat.h - 1))
    sw = Math.min(sw, nat.w - sx)
    sh = Math.min(sh, nat.h - sy)
    // 裁剪输出放大到较长边 1024,保证生成图片分辨率充足
    const longSide = Math.max(sw, sh)
    let outW = sw
    let outH = sh
    if (longSide < 1024) {
      const up = 1024 / longSide
      outW = Math.round(sw * up)
      outH = Math.round(sh * up)
    }
    const c = document.createElement('canvas')
    c.width = outW
    c.height = outH
    const ctx = c.getContext('2d')
    if (!ctx) return
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
      onConfirm(c.toDataURL('image/jpeg', 0.92))
    }
    img.src = image
  }

  const maskStyle: React.CSSProperties = { position: 'absolute', background: 'rgba(0, 0, 0, 0.55)', pointerEvents: 'none' }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="手动裁剪参考图"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button variant="primary" onClick={handleConfirm} disabled={!box || !nat}>确认裁剪</Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--fg)', lineHeight: 1.7 }}>
          拖动选框调整位置，拖拽<b>四角手柄</b>缩放选框（锁定比例 {size}），框外部分将被裁掉。
        </p>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            alignSelf: 'center',
            borderRadius: 'var(--radius-md)',
            userSelect: 'none',
            ...(view ? { width: view.w, height: view.h } : { width: 320, height: 240 })
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {image && (
            <img
              src={image}
              alt="参考图"
              draggable={false}
              style={{
                width: view?.w || '100%',
                height: view?.h || '100%',
                display: 'block',
                objectFit: 'cover'
              }}
            />
          )}
          {box && view && (
            <>
              {/* 框外遮罩(上下左右四块) */}
              <div style={{ ...maskStyle, left: 0, top: 0, width: view.w, height: box.y }} />
              <div style={{ ...maskStyle, left: 0, top: box.y + box.h, width: view.w, height: view.h - box.y - box.h }} />
              <div style={{ ...maskStyle, left: 0, top: box.y, width: box.x, height: box.h }} />
              <div style={{ ...maskStyle, left: box.x + box.w, top: box.y, width: view.w - box.x - box.w, height: box.h }} />
              {/* 裁剪框 */}
              <div
                onMouseDown={(e) => handleMouseDown(e, 'move')}
                style={{
                  position: 'absolute',
                  left: box.x,
                  top: box.y,
                  width: box.w,
                  height: box.h,
                  border: '2px solid var(--brand)',
                  boxSizing: 'border-box',
                  cursor: 'move',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.3)'
                }}
              >
                {/* 四角缩放手柄 */}
                <div
                  onMouseDown={(e) => handleMouseDown(e, 'resize')}
                  style={{
                    position: 'absolute',
                    right: -6,
                    bottom: -6,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'var(--brand)',
                    border: '2px solid #fff',
                    cursor: 'nwse-resize',
                    boxSizing: 'border-box'
                  }}
                />
                <div
                  onMouseDown={(e) => handleMouseDown(e, 'resize')}
                  style={{
                    position: 'absolute',
                    left: -6,
                    bottom: -6,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'var(--brand)',
                    border: '2px solid #fff',
                    cursor: 'nesw-resize',
                    boxSizing: 'border-box'
                  }}
                />
                <div
                  onMouseDown={(e) => handleMouseDown(e, 'resize')}
                  style={{
                    position: 'absolute',
                    right: -6,
                    top: -6,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'var(--brand)',
                    border: '2px solid #fff',
                    cursor: 'nesw-resize',
                    boxSizing: 'border-box'
                  }}
                />
                <div
                  onMouseDown={(e) => handleMouseDown(e, 'resize')}
                  style={{
                    position: 'absolute',
                    left: -6,
                    top: -6,
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: 'var(--brand)',
                    border: '2px solid #fff',
                    cursor: 'nwse-resize',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--fg-muted)' }}>
            产品超出选框时，缩小选框框住产品主体即可；输出会自动放大到足够清晰度。
          </p>
          <Button size="sm" variant="secondary" onClick={handleReset} disabled={!view}>
            重置为最大
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default CropModal
