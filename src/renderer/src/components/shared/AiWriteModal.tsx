import { useState } from 'react'
import { Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'
import { ConfirmDialog } from './ConfirmDialog'

/** Convert a blob:// or file path to a base64 data URL via canvas */
function toBase64DataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('Canvas unavailable'))
      ctx.drawImage(img, 0, 0)
      resolve(c.toDataURL('image/jpeg', 0.92))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

interface AiWriteModalProps {
  open: boolean
  onClose: () => void
  onApply: (text: string) => void
  productImages?: string[]
  productInfo?: string
  context?: string
  selectedModel?: string
}

export function AiWriteModal({ open, onClose, onApply, productImages, productInfo, context, selectedModel }: AiWriteModalProps) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  // 未上传参考图确认弹窗
  const [noImgConfirm, setNoImgConfirm] = useState(false)

  const handleCustomGenerate = async () => {
    if (!customPrompt.trim()) return
    // 模型必选校验:AI 帮写需要文案模型
    if (!selectedModel) {
      setError('请先在「文案模型」中选择一个模型，再使用 AI 帮写')
      return
    }
    // 未上传参考图:弹出主题确认弹窗,由用户决定是否仅凭文字描述继续生成
    if (!productImages || productImages.length === 0) {
      setNoImgConfirm(true)
      return
    }
    doGenerate()
  }

  /** 实际执行生成(已通过参考图确认) */
  const doGenerate = async () => {
    setError('')
    setLoading(true)

    try {
      const imageUrls = productImages && productImages.length > 0
        ? await Promise.all(productImages.map(toBase64DataUrl))
        : []

      const result = await window.api.ai.aiWrite({
        type: 'description',
        productInfo: productInfo || '',
        style: customPrompt.trim(),
        context: context || '',
        model: selectedModel || '',
        images: imageUrls,
      })

      if (result.success && result.content) {
        setText(result.content)
      } else {
        setError('AI 生成失败，请重试')
      }
    } catch (err: any) {
      const msg = err?.message || String(err) || '未知错误'
      setError(msg.includes('没有可用的AI模型') ? msg : `AI 生成失败: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    onApply(text)
    onClose()
    setText('')
    setError('')
    setCustomPrompt('')
  }

  const handleClose = () => {
    onClose()
    setText('')
    setError('')
    setCustomPrompt('')
  }

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
      title="AI 写作助手"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleApply} disabled={!text.trim() || loading}>
            <Sparkles size={16} />
            使用此描述
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Custom prompt input */}
        <div>
          <p style={{
            margin: '0 0 8px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--fg-secondary)',
          }}>
            输入生成要求
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="例如：突出产品的防水功能和超薄设计..."
              rows={2}
            />
            <Button
              variant="primary"
              onClick={handleCustomGenerate}
              disabled={!customPrompt.trim() || loading}
              style={{ flexShrink: 0, alignSelf: 'flex-start' }}
            >
              <Sparkles size={14} />
              生成
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '24px',
            background: 'var(--bg-muted)',
            borderRadius: 'var(--radius-md)',
          }}>
            <Loader2 size={20} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '14px', color: 'var(--fg-secondary)' }}>
              AI 正在生成文案...
            </span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
          }}>
            <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
            <span style={{ fontSize: '13px', color: '#ef4444' }}>{error}</span>
          </div>
        )}

        {/* Generated text */}
        <div>
          <p style={{
            margin: '0 0 8px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--fg-secondary)',
          }}>
            AI 生成结果
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="输入要求后，AI 将自动生成文案..."
            rows={6}
          />
        </div>

        {/* Product info summary */}
        {(productInfo || (productImages && productImages.length > 0)) && (
          <div style={{
            padding: '10px 12px',
            background: 'var(--bg-muted)',
            borderRadius: 'var(--radius-md)',
            fontSize: '12px',
            color: 'var(--fg-muted)',
          }}>
            <span style={{ fontWeight: 500, color: 'var(--fg-secondary)' }}>AI 将参考：</span>
            {productImages && productImages.length > 0 && (
              <span> {productImages.length} 张产品图片</span>
            )}
            {productInfo && (
              <span>{productImages && productImages.length > 0 ? '、' : ''} 产品描述</span>
            )}
          </div>
        )}
      </div>
      </Modal>

      {/* 未上传参考图确认弹窗 */}
      <ConfirmDialog
        open={noImgConfirm}
        title="未上传参考图"
        message="尚未上传产品参考图，AI 无法识别产品图片，将仅凭文字描述生成，结果可能不准确。仍要继续吗？"
        confirmText="仍要生成"
        cancelText="取消"
        onConfirm={() => {
          setNoImgConfirm(false)
          doGenerate()
        }}
        onCancel={() => setNoImgConfirm(false)}
      />
    </>
  )
}

export default AiWriteModal
