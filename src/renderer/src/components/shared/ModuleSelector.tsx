import { useState, useEffect, useRef } from 'react'
import { Plus, X, Pencil } from 'lucide-react'
import Checkbox from '../ui/Checkbox'
import CustomModuleModal, { type CustomModuleData } from './CustomModuleModal'

interface ModuleSelectorProps {
  /** 内置模块定义(如主图 5 模块 / 详情图 16 模块) */
  baseModules: CustomModuleData[]
  /** 自定义模块持久化 key(settings) */
  storageKey: string
  /** 内置模块提示词覆盖持久化 key(settings) */
  overrideKey: string
  /** 选中状态:模块 key -> 数量(选中即存在) */
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
  /** 完整模块列表(内置含覆盖 + 自定义)变化时通知父组件,用于传给规划页 */
  onModuleListChange?: (list: CustomModuleData[]) => void
}

/**
 * 模块选择器(主图/详情图共用):
 * 勾选模块 + 各模块生成数量(1-4) + 全选/取消全选 + 自定义模块 + 编辑模块提示词
 */
export function ModuleSelector({
  baseModules,
  storageKey,
  overrideKey,
  value,
  onChange,
  onModuleListChange
}: ModuleSelectorProps) {
  // 自定义模块(持久化到 settings)
  const [customModules, setCustomModules] = useState<CustomModuleData[]>([])
  // 内置模块的提示词覆盖(未覆盖时用默认提示词)
  const [moduleOverrides, setModuleOverrides] = useState<Record<string, { title: string; desc: string; prompt: string }>>({})
  const [modalOpen, setModalOpen] = useState(false)
  // 当前正在编辑的模块(null 表示新增自定义)
  const [editingModule, setEditingModule] = useState<CustomModuleData | null>(null)

  // 内置模块(应用覆盖) + 自定义模块,构成完整可选模块列表
  const allModules: CustomModuleData[] = [
    ...baseModules.map(m => {
      const ov = moduleOverrides[m.key]
      return ov ? { ...m, title: ov.title, desc: ov.desc, prompt: ov.prompt } : m
    }),
    ...customModules
  ]

  const selectedCount = Object.keys(value).length
  const allSelected = selectedCount === allModules.length

  // 加载持久化的自定义模块与内置覆盖
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [rawCustom, rawOverrides] = await Promise.all([
          window.api.settings.get(storageKey),
          window.api.settings.get(overrideKey)
        ])
        if (cancelled) return
        if (rawCustom) {
          const parsed = JSON.parse(rawCustom)
          if (Array.isArray(parsed)) {
            setCustomModules(parsed.filter((m): m is CustomModuleData =>
              m && typeof m.key === 'string' && typeof m.title === 'string' && typeof m.prompt === 'string'))
          }
        }
        if (rawOverrides) {
          const parsed = JSON.parse(rawOverrides)
          if (parsed && typeof parsed === 'object') setModuleOverrides(parsed)
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [storageKey, overrideKey])

  // 完整模块列表变化时通知父组件
  const onListChangeRef = useRef(onModuleListChange)
  onListChangeRef.current = onModuleListChange
  useEffect(() => {
    onListChangeRef.current?.(allModules)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleOverrides, customModules, baseModules])

  const persistCustomModules = (list: CustomModuleData[]) => {
    try { window.api.settings.set(storageKey, JSON.stringify(list)) } catch {}
  }

  const persistModuleOverrides = (overrides: Record<string, { title: string; desc: string; prompt: string }>) => {
    try { window.api.settings.set(overrideKey, JSON.stringify(overrides)) } catch {}
  }

  const toggleModule = (key: string) => {
    onChange(prev => {
      const next = { ...prev }
      if (next[key]) delete next[key]
      else next[key] = 1
      return next
    })
  }

  const setModuleCount = (key: string, count: number) => {
    onChange(prev => ({ ...prev, [key]: Math.max(1, Math.min(4, count)) }))
  }

  const toggleAll = () => {
    if (allSelected) {
      onChange({})
    } else {
      onChange(Object.fromEntries(allModules.map(m => [m.key, value[m.key] || 1])))
    }
  }

  const handleSaveCustomModule = (mod: CustomModuleData) => {
    setCustomModules(prev => {
      const next = [...prev, mod]
      persistCustomModules(next)
      return next
    })
    // 新增的自定义模块默认选中 1 张
    onChange(prev => ({ ...prev, [mod.key]: 1 }))
  }

  const handleRemoveCustomModule = (key: string) => {
    setCustomModules(prev => {
      const next = prev.filter(c => c.key !== key)
      persistCustomModules(next)
      return next
    })
    onChange(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  /** 编辑保存:自定义模块直接更新列表;内置模块写入覆盖配置 */
  const handleSaveModuleEdit = (mod: CustomModuleData) => {
    if (mod.key.startsWith('custom-')) {
      setCustomModules(prev => {
        const next = prev.map(c => (c.key === mod.key ? { ...c, title: mod.title, desc: mod.desc, prompt: mod.prompt } : c))
        persistCustomModules(next)
        return next
      })
    } else {
      setModuleOverrides(prev => {
        const next = { ...prev, [mod.key]: { title: mod.title, desc: mod.desc, prompt: mod.prompt } }
        persistModuleOverrides(next)
        return next
      })
    }
  }

  return (
    <>
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--fg-secondary)',
            marginBottom: '0'
          }}>选择模块</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>
              已选 {selectedCount}/{allModules.length}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Checkbox checked={allSelected} onChange={toggleAll} />
              <span style={{ fontSize: '11px', color: 'var(--fg-secondary)' }}>
                {allSelected ? '取消全选' : '全选'}
              </span>
            </div>
            <button
              onClick={() => { setEditingModule(null); setModalOpen(true) }}
              style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                padding: '2px 8px', fontSize: '11px', fontWeight: 500,
                border: '1px solid var(--brand)', borderRadius: 'var(--radius-full)',
                background: 'var(--brand-glow)', color: 'var(--brand)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              <Plus size={11} />
              自定义
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {allModules.map((mod) => {
            const count = value[mod.key] || 0
            const isSelected = count > 0
            const isCustom = mod.key.startsWith('custom-')
            return (
              <div
                key={mod.key}
                onClick={() => toggleModule(mod.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected ? 'var(--brand-glow)' : 'var(--bg-muted)',
                  border: isSelected ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  opacity: isSelected ? 1 : 0.6
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox checked={isSelected} onChange={() => toggleModule(mod.key)} />
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? 'var(--brand)' : 'var(--fg)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {mod.title}
                  </span>
                  {/* 编辑模块提示词(内置模块可覆盖默认提示词,自定义模块可修改) */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingModule(mod); setModalOpen(true) }}
                    title={isCustom ? '编辑模块' : '编辑模块提示词'}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '18px', height: '18px', flexShrink: 0,
                      border: 'none', borderRadius: '50%',
                      background: 'transparent', color: 'var(--fg-muted)',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--brand-glow)'
                      e.currentTarget.style.color = 'var(--brand)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--fg-muted)'
                    }}
                  >
                    <Pencil size={11} />
                  </button>
                </div>
                {isCustom && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveCustomModule(mod.key) }}
                    title="删除该自定义模块"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: '18px', height: '18px', flexShrink: 0,
                      border: 'none', borderRadius: '50%',
                      background: 'transparent', color: 'var(--fg-muted)',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                      e.currentTarget.style.color = '#ef4444'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--fg-muted)'
                    }}
                  >
                    <X size={11} />
                  </button>
                )}
                {isSelected && (
                  <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>数量</span>
                    <select
                      value={count}
                      onChange={(e) => setModuleCount(mod.key, parseInt(e.target.value) || 1)}
                      style={{
                        padding: '3px 6px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-sans)',
                        color: 'var(--fg)',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {[1, 2, 3, 4].map(n => (
                        <option key={n} value={n}>{n} 张</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <CustomModuleModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingModule(null)
        }}
        editing={editingModule}
        onSave={editingModule ? handleSaveModuleEdit : handleSaveCustomModule}
      />
    </>
  )
}

export default ModuleSelector
