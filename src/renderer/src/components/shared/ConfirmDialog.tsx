import { AlertTriangle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  /** 确认按钮用危险色(红色),用于删除/重置等破坏性操作 */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** 通用确认弹窗(主题化,替代 window.confirm) */
export function ConfirmDialog({
  open,
  title = '确认操作',
  message,
  confirmText = '确认',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <AlertTriangle
          size={20}
          style={{
            color: danger ? 'var(--danger)' : '#f59e0b',
            flexShrink: 0,
            marginTop: '2px'
          }}
        />
        <p style={{
          margin: 0,
          fontSize: '13px',
          color: 'var(--fg)',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {message}
        </p>
      </div>
    </Modal>
  )
}

export default ConfirmDialog
