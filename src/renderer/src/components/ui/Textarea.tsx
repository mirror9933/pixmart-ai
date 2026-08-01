import { type TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({
  label,
  className,
  style,
  ...props
}: TextareaProps) {
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
      <textarea
        style={{
          width: '100%',
          padding: '8px 12px',
          fontSize: '14px',
          fontFamily: 'var(--font-sans)',
          color: 'var(--fg)',
          backgroundColor: 'var(--bg-muted)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          resize: 'none',
          outline: 'none',
          transition: 'all 0.2s ease',
          minHeight: '80px',
          ...style,
        }}
        className={className}
        {...props}
      />
    </div>
  )
}

export default Textarea
