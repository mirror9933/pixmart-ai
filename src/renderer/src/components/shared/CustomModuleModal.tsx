import { useState, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

/** Skill 预设模板(参考电商详情页模块设计规范) */
const SKILL_TEMPLATE = `- 模块名：XXX
- 商业目标：建立第一眼吸引力、商品定位和整套详情页的视觉调性，让用户快速判断商品值得继续浏览。
- 画面任务：突出产品整体形象、核心气质、消费场景和主利益点，形成详情页首屏的强视觉记忆。
- 产品出现：建议完整产品出现，占画面35%-60%；若产品为套装或多件组合，必须保持数量、比例和摆放关系真实一致。
- 内容要素：产品主体、核心场景、品牌感背景、1个主利益点、适度装饰道具、统一光影方向。
- 文字策略：根据模块目标设计文案。
- 构图建议：主体明确、空间干净，有首屏冲击力；可用居中、三分法或轻微斜角构图，但不得让背景抢走产品主角地位。`

const MAX_SKILL_LENGTH = 2000

export interface CustomModuleData {
  key: string
  title: string
  desc: string
  prompt: string
}

interface CustomModuleModalProps {
  open: boolean
  onClose: () => void
  onSave: (module: CustomModuleData) => void
  /** 编辑模式:传入已有模块则预填表单,保存时沿用其 key;为空表示新增 */
  editing?: CustomModuleData | null
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '13px',
  fontFamily: 'var(--font-sans)',
  color: 'var(--fg)',
  backgroundColor: 'var(--bg-muted)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s ease',
}

export function CustomModuleModal({ open, onClose, onSave, editing }: CustomModuleModalProps) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [skill, setSkill] = useState('')
  const [copied, setCopied] = useState(false)

  // 每次打开时重置表单(编辑模式预填当前值)
  useEffect(() => {
    if (open) {
      setName(editing?.title || '')
      setDesc(editing?.desc || '')
      setSkill(editing?.prompt || '')
      setCopied(false)
    }
  }, [open, editing])

  const skillOverflow = skill.length > MAX_SKILL_LENGTH
  const canSave = name.trim().length > 0 && !skillOverflow

  /** 复制 skill 预设模板到剪贴板;文本域为空时同时填入模板 */
  const handleCopyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(SKILL_TEMPLATE)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
    setSkill((prev) => prev || SKILL_TEMPLATE)
  }

  const handleSave = () => {
    const title = name.trim()
    if (!title || skillOverflow) return
    // 模板中的「模块名：XXX」替换为实际模块名
    const prompt = (skill.trim() || SKILL_TEMPLATE).replace(/模块名[:：]\s*XXX/g, `模块名：${title}`)
    onSave({
      key: editing?.key || `custom-${Date.now().toString(36)}`,
      title,
      desc: desc.trim(),
      prompt
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '编辑模块' : '自定义模块'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            保存
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 模块名称 */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--fg-secondary)',
            marginBottom: '6px'
          }}>
            模块名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：场景氛围图"
            style={inputStyle}
          />
        </div>

        {/* 模块简介 */}
        <div>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--fg-secondary)',
            marginBottom: '6px'
          }}>
            模块简介
          </label>
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="一句话说明该模块的用途（选填）"
            style={inputStyle}
          />
        </div>

        {/* Skill 模块提示词 */}
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px'
          }}>
            <label style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--fg-secondary)'
            }}>
              Skill（模块提示词）
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleCopyTemplate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  color: 'var(--brand)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)'
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? '已复制' : '复制skill要求'}
              </button>
              <span style={{
                fontSize: '11px',
                color: skillOverflow ? 'var(--danger)' : 'var(--fg-muted)',
                fontFamily: 'var(--font-mono)'
              }}>
                {skill.length}/{MAX_SKILL_LENGTH}
              </span>
            </div>
          </div>
          <textarea
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="输入该模块的提示词要求，或点击「复制skill要求」填入模板"
            rows={10}
            style={{
              ...inputStyle,
              resize: 'vertical',
              lineHeight: '1.6',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px'
            }}
          />
        </div>
      </div>
    </Modal>
  )
}

export default CustomModuleModal
