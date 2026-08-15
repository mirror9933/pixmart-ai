import { AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface ErrorModalProps {
  open: boolean
  title?: string
  message: string
  onClose: () => void
}

/** 通用错误提示弹窗(模型校验失败 / 生成失败 / 不支持识图生图等) */
export function ErrorModal({ open, title = '操作失败', message, onClose }: ErrorModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button variant="primary" onClick={onClose}>
          知道了
        </Button>
      }
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <AlertCircle size={20} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
        <p style={{
          margin: 0,
          fontSize: '13px',
          color: 'var(--fg)',
          lineHeight: '1.7',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          {message}
        </p>
      </div>
    </Modal>
  )
}

export default ErrorModal
