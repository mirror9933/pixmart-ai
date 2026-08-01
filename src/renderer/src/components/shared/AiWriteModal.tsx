import { useState } from 'react'
import { Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Textarea'

const styleChips = [
  { label: '品牌旗舰风', desc: '高端品牌旗舰店风格，突出产品质感与品牌调性，营造奢华氛围' },
  { label: '功能参数型', desc: '以产品功能和参数为核心，清晰展示产品特点，适合科技类产品' },
  { label: '生活场景型', desc: '将产品融入真实生活场景，营造温馨自然的氛围，适合家居、食品类' },
  { label: '促销转化型', desc: '突出促销信息和价格优势，营造紧迫感和购买欲望，适合活动促销' },
  { label: '极简高级感', desc: '采用极简设计风格，大面积留白，突出产品本身，营造高级感' },
]

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
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')

  const handleChipClick = async (index: number) => {
    setSelectedChip(index)
    setError('')
    setLoading(true)

    try {
      const style = styleChips[index].desc
      // Convert blob URLs to base64 data URLs for IPC transport
      const imageUrls = productImages && productImages.length > 0
        ? await Promise.all(productImages.map(toBase64DataUrl))
        : []

      const result = await window.api.ai.aiWrite({
        type: 'description',
        productInfo: productInfo || '',
        style,
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

  const handleCustomGenerate = async () => {
    if (!customPrompt.trim()) return
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
    setSelectedChip(null)
    setText('')
    setError('')
    setCustomPrompt('')
  }

  const handleClose = () => {
    onClose()
    setSelectedChip(null)
    setText('')
    setError('')
    setCustomPrompt('')
  }

  return (
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
        {/* Style chips */}
        <div>
          <p style={{
            margin: '0 0 8px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--fg-secondary)',
          }}>
            快速选择风格
          </p>
          <p style={{
            margin: '0 0 12px',
            fontSize: '11px',
            color: 'var(--fg-muted)',
          }}>
            选择风格后 AI 将根据您的产品图片和描述自动生成文案
          </p>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            {styleChips.map((chip, index) => (
              <button
                key={index}
                onClick={() => handleChipClick(index)}
                disabled={loading}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-sans)',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid',
                  borderColor: selectedChip === index
                    ? 'var(--brand)'
                    : 'var(--border)',
                  backgroundColor: selectedChip === index
                    ? 'var(--brand-glow)'
                    : 'transparent',
                  color: selectedChip === index
                    ? 'var(--brand)'
                    : 'var(--fg-secondary)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom prompt input */}
        <div>
          <p style={{
            margin: '0 0 8px',
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--fg-secondary)',
          }}>
            或输入自定义要求
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
            placeholder="选择上方风格或输入自定义要求后，AI 将自动生成文案..."
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
  )
}

export default AiWriteModal
