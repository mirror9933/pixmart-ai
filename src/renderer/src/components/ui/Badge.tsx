import { type ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--brand-glow)',
    color: 'var(--brand)',
  },
  success: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  warning: {
    backgroundColor: '#fef9c3',
    color: '#854d0e',
  },
  error: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  info: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 10px',
        fontSize: '12px',
        fontWeight: 500,
        borderRadius: 'var(--radius-full)',
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        ...variantStyles[variant],
      }}
      className={className}
    >
      {children}
    </span>
  )
}

export default Badge
