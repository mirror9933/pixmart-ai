import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  children?: ReactNode
}

const sizeStyles: Record<ButtonSize, { padding: string; fontSize: string }> = {
  sm: { padding: '6px 12px', fontSize: '13px' },
  md: { padding: '8px 16px', fontSize: '14px' },
  lg: { padding: '12px 24px', fontSize: '15px' },
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--brand)',
    color: '#ffffff',
    border: '1px solid transparent',
  },
  secondary: {
    backgroundColor: 'var(--bg-muted)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--fg-muted)',
    border: '1px solid transparent',
  },
  danger: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    border: '1px solid transparent',
  },
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className,
  style,
  ...props
}: ButtonProps) {
  const sizeStyle = sizeStyles[size]
  const variantStyle = variantStyles[variant]
  const animClass = variant === 'primary' ? 'anim-btn anim-btn-primary' : variant === 'ghost' ? 'anim-btn anim-btn-ghost' : variant === 'secondary' ? 'anim-btn anim-btn-secondary' : 'anim-btn'

  return (
    <button
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'nowrap',
        ...sizeStyle,
        ...variantStyle,
        ...style,
      }}
      disabled={disabled || loading}
      className={`${animClass}${className ? ' ' + className : ''}`}
      {...props}
    >
      {loading ? (
        <Loader2
          size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
          className="animate-spin"
        />
      ) : icon ? (
        <span style={{ display: 'flex', alignItems: 'center' }}>
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  )
}

export default Button
