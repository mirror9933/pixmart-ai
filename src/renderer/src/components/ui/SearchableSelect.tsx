import { useState, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'

interface SearchableSelectOption {
  value: string
  label: string
}

interface SearchableSelectProps {
  value?: string
  onChange?: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  label?: string
  style?: React.CSSProperties
}

/**
 * 带搜索过滤的下拉选择(用于模型列表等长列表);外观与 Select 保持一致。
 * 关闭机制:全屏透明遮罩(点击遮罩关闭),面板与按钮位于遮罩之上,
 * 避免 document 级事件监听与输入框聚焦冲突。
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  label,
  style
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Escape 关闭
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  const selected = options.find(o => o.value === value)
  const keyword = search.trim().toLowerCase()
  const filtered = keyword
    ? options.filter(o => o.label.toLowerCase().includes(keyword))
    : options

  const close = () => {
    setOpen(false)
    setSearch('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg-secondary)' }}>
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => { setOpen(o => !o); setSearch('') }}
          style={{
            position: 'relative',
            zIndex: open ? 301 : 'auto',
            width: '100%',
            padding: '8px 36px 8px 12px',
            fontSize: '14px',
            fontFamily: 'var(--font-sans)',
            color: selected ? 'var(--fg)' : 'var(--fg-muted)',
            backgroundColor: 'var(--bg-muted)',
            border: open ? '1px solid var(--brand)' : '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            textAlign: 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'all 0.2s ease',
            ...style
          }}
        >
          {selected ? selected.label : (placeholder || '请选择')}
        </button>
        <ChevronDown
          size={16}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: open ? 'rotate(180deg) translateY(50%)' : 'translateY(-50%)',
            pointerEvents: 'none',
            color: 'var(--fg-muted)',
            transition: 'transform 0.2s ease',
            zIndex: open ? 301 : 'auto'
          }}
        />

        {open && (
          <>
            {/* 全屏透明遮罩:点击外部关闭(面板与按钮 zIndex 高于遮罩,不受影响) */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'transparent' }}
              onMouseDown={(e) => {
                e.preventDefault()
                close()
              }}
            />
            {/* 下拉面板 */}
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              minWidth: 'max(100%, 280px)',
              zIndex: 300,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden'
            }}>
              {/* 搜索框 */}
              <div style={{
                padding: '8px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Search size={13} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索模型..."
                  autoFocus
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    fontSize: '12px',
                    color: 'var(--fg)',
                    fontFamily: 'var(--font-sans)'
                  }}
                />
              </div>
              {/* 选项列表 */}
              <div style={{ maxHeight: '240px', overflowY: 'auto', padding: '4px' }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: '12px', color: 'var(--fg-muted)', textAlign: 'center' }}>
                    无匹配模型
                  </div>
                ) : filtered.map((opt) => {
                  const active = opt.value === value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange?.(opt.value)
                        close()
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '7px 10px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-sans)',
                        lineHeight: '1.4',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        background: active ? 'var(--brand-glow)' : 'transparent',
                        color: active ? 'var(--brand)' : 'var(--fg)',
                        whiteSpace: 'normal',
                        wordBreak: 'break-word'
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-muted)' }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default SearchableSelect
