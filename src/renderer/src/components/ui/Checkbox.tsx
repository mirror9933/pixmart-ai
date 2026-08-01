import { useRef } from 'react'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  const id = useRef(`cbx-${Math.random().toString(36).slice(2, 8)}`).current

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
      <label htmlFor={id} className="check">
        <svg width="18" height="18" viewBox="0 0 18 18">
          <path d="M1,9 L1,3.5 C1,2 2,1 3.5,1 L14.5,1 C16,1 17,2 17,3.5 L17,14.5 C17,16 16,17 14.5,17 L3.5,17 C2,17 1,16 1,14.5 L1,9 Z" />
          <polyline points="1 9 7 14 15 4" />
        </svg>
      </label>
      {label && <span style={{ fontSize: 14, color: 'var(--fg)' }}>{label}</span>}
    </span>
  )
}

export default Checkbox
