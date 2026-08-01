import { Check } from 'lucide-react'

const steps = [
  { id: 1, label: '输入' },
  { id: 2, label: '分析中' },
  { id: 3, label: '确认规划' },
  { id: 4, label: '生成中' },
  { id: 5, label: '完成' },
]

interface StepIndicatorProps {
  currentStep: number
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0',
        padding: '24px 0',
      }}
    >
      {steps.map((step, index) => {
        const isCompleted = step.id < currentStep
        const isActive = step.id === currentStep
        const isFuture = step.id > currentStep

        return (
          <div
            key={step.id}
            style={{
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 600,
                  backgroundColor: isCompleted || isActive
                    ? 'var(--brand)'
                    : 'var(--bg-muted)',
                  color: isCompleted || isActive
                    ? '#ffffff'
                    : 'var(--fg-muted)',
                  boxShadow: isActive ? 'var(--shadow-glow)' : 'none',
                  transition: 'all 0.3s ease',
                }}
                className="hidden sm:flex"
              >
                {isCompleted ? (
                  <Check size={18} />
                ) : (
                  <span>{step.id}</span>
                )}
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive
                    ? 'var(--brand)'
                    : isCompleted
                    ? 'var(--fg-secondary)'
                    : 'var(--fg-muted)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.3s ease',
                }}
                className="hidden sm:block"
              >
                {step.label}
              </span>
            </div>

            {index < steps.length - 1 && (
              <div
                style={{
                  width: '60px',
                  height: '2px',
                  margin: '0 8px',
                  backgroundColor: isCompleted
                    ? 'var(--brand)'
                    : 'var(--border)',
                  transition: 'background-color 0.3s ease',
                }}
                className="hidden sm:block"
              />
            )}
          </div>
        )
      })}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        className="sm:hidden"
      >
        {steps.map((step) => {
          const isActive = step.id === currentStep
          const isCompleted = step.id < currentStep
          return (
            <div
              key={step.id}
              style={{
                width: isActive ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                backgroundColor: isCompleted || isActive
                  ? 'var(--brand)'
                  : 'var(--border)',
                transition: 'all 0.3s ease',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

export default StepIndicator
