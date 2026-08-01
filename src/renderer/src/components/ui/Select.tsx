import { type SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectOption {
  value: string
  label: string
  /** 可选：选项分组（渲染为 <optgroup>，连续同组的选项归入同一组） */
  group?: string
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[]
  value?: string
  onChange?: (value: string) => void
  label?: string
}

export function Select({
  options,
  value,
  onChange,
  label,
  placeholder,
  className,
  style,
  ...props
}: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && (
        <label
          style={{
            fontSize: '13px',
            fontWeight: 500,
            color: 'var(--fg-secondary)',
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 36px 8px 12px',
            fontSize: '14px',
            fontFamily: 'var(--font-sans)',
            color: value ? 'var(--fg)' : 'var(--fg-muted)',
            backgroundColor: 'var(--bg-muted)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            appearance: 'none',
            cursor: 'pointer',
            outline: 'none',
            transition: 'all 0.2s ease',
            ...style,
          }}
          className={className}
          {...props}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {(() => {
            // 按连续同组归并，渲染 <optgroup>
            const grouped: { group: string; options: SelectOption[] }[] = []
            for (const option of options) {
              const last = grouped[grouped.length - 1]
              if (last && last.group === (option.group || '')) {
                last.options.push(option)
              } else {
                grouped.push({ group: option.group || '', options: [option] })
              }
            }
            return grouped.map((g) =>
              g.group ? (
                <optgroup key={g.group} label={g.group}>
                  {g.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                g.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              )
            )
          })()}
        </select>
        <ChevronDown
          size={16}
          style={{
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: 'var(--fg-muted)',
          }}
        />
      </div>
    </div>
  )
}

export default Select
