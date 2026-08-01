import { type ReactNode, useState, useRef } from 'react'

export interface UploadedFile {
  path: string
  name: string
  size: number
  dataUrl: string
}

interface UploadAreaProps {
  icon?: ReactNode
  title?: string
  subtitle?: string
  count?: number
  maxCount?: number
  onUpload?: (files: UploadedFile[]) => void
  className?: string
}

const IMAGE_EXTS = /\.(jpg|jpeg|png|webp|gif|bmp)$/i
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/bmp'

function filesToUploaded(files: File[]): UploadedFile[] {
  return files
    .filter(f => IMAGE_EXTS.test(f.name))
    .map(f => ({
      path: (f as any).path || '',
      name: f.name,
      size: f.size,
      // URL.createObjectURL works directly in renderer — no IPC needed
      dataUrl: URL.createObjectURL(f),
    }))
}

export function UploadArea({
  icon,
  title = '点击或拖拽上传图片',
  subtitle = '支持 JPG、PNG、WEBP 格式',
  count = 0,
  maxCount = 6,
  onUpload,
  className,
}: UploadAreaProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const active = isDragOver || isHovered

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    if (selected.length > 0) {
      onUpload?.(filesToUploaded(selected))
    }
    // Reset so same file can be selected again
    e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const imageFiles = Array.from(e.dataTransfer.files).filter(f => IMAGE_EXTS.test(f.name))
    if (imageFiles.length > 0 && onUpload) {
      onUpload(filesToUploaded(imageFiles))
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <div
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          border: `2px dashed ${active ? 'var(--brand)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)',
          backgroundColor: isDragOver ? 'var(--brand-glow)' : 'var(--bg-muted)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          minHeight: '160px',
        }}
        className={className}
      >
        {icon && (
          <div
            style={{
              marginBottom: '12px',
              color: active ? 'var(--brand)' : 'var(--fg-muted)',
              transition: 'color 0.2s ease',
            }}
          >
            {icon}
          </div>
        )}
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: 500,
            color: isDragOver ? 'var(--brand)' : 'var(--fg)',
          }}
        >
          {isDragOver ? '释放以上传图片' : title}
        </p>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '13px',
            color: 'var(--fg-muted)',
          }}
        >
          {subtitle}
        </p>
        {maxCount > 0 && (
          <span
            style={{
              marginTop: '8px',
              fontSize: '12px',
              color: 'var(--fg-muted)',
              padding: '2px 8px',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {count}/{maxCount}
          </span>
        )}
      </div>
    </>
  )
}

export default UploadArea
