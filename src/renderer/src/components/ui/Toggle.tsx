interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        cursor: 'pointer',
      }}
    >
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="anim-toggle-track"
        style={{
          position: 'relative',
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          border: '2px solid transparent',
          outline: 'none',
          backgroundColor: checked ? 'var(--brand)' : 'var(--fg-muted)',
          cursor: 'pointer',
          padding: 0,
          boxSizing: 'border-box',
        }}
      >
        <span
          className="anim-toggle-thumb"
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '22px' : '2px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.1)',
          }}
        />
      </button>
      {label && (
        <span
          style={{
            fontSize: '14px',
            color: 'var(--fg)',
            userSelect: 'none',
          }}
        >
          {label}
        </span>
      )}
    </label>
  )
}

export default Toggle
