import { useState, useRef, useEffect, useCallback } from 'react'
import { X, FileText, RefreshCw, Trash2, Search } from 'lucide-react'

interface LogEntry {
  timestamp: string
  level: string
  message: string
}

function parseLogLine(line: string): LogEntry | null {
  const match = line.match(/^\[([^\]]+)\]\s*\[([^\]]+)\]\s*(.*)$/)
  if (!match) return null
  return { timestamp: match[1], level: match[2], message: match[3] }
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    return ts
  }
}

interface LogViewerProps {
  open: boolean
  onClose: () => void
}

export function LogViewer({ open, onClose }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('ALL')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [size, setSize] = useState({ w: 680, h: 480 })
  const [resizing, setResizing] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })
  const logEndRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)
  const logsRef = useRef<LogEntry[]>([])
  const [logFiles, setLogFiles] = useState<string[]>([])
  const [currentFile, setCurrentFile] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const api = (window as any).api
      if (!api?.paths?.getLogs) {
        setError('日志 API 不可用')
        return
      }
      const result = await api.paths.getLogs()
      if (!result) {
        setError('获取日志失败：返回为空')
        return
      }
      if (result.files) setLogFiles(result.files)
      if (result.currentFile) setCurrentFile(result.currentFile)
      if (result.content) {
        const lines = result.content.split('\n').filter(Boolean)
        const entries = lines.map(parseLogLine).filter(Boolean) as LogEntry[]
        logsRef.current = entries
        setLogs(entries)
      } else {
        logsRef.current = []
        setLogs([])
      }
    } catch (e) {
      setError(`获取日志出错: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchLogFile = useCallback(async (filename: string) => {
    setLoading(true)
    setError(null)
    try {
      const api = (window as any).api
      const result = await api?.paths?.getLogFile?.(filename)
      if (result?.content) {
        const lines = result.content.split('\n').filter(Boolean)
        const entries = lines.map(parseLogLine).filter(Boolean) as LogEntry[]
        logsRef.current = entries
        setLogs(entries)
      } else {
        logsRef.current = []
        setLogs([])
      }
      setCurrentFile(filename)
    } catch (e) {
      setError(`读取日志文件出错: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && !initialized.current) {
      initialized.current = true
      setPos({ x: 80, y: 80 })
      fetchLogs()
    }
    if (!open) {
      initialized.current = false
    }
  }, [open, fetchLogs])

  useEffect(() => {
    if (!open || !autoRefresh) return
    const timer = setInterval(fetchLogs, 3000)
    return () => clearInterval(timer)
  }, [open, autoRefresh, fetchLogs])

  useEffect(() => {
    if (autoRefresh && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoRefresh])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos])

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      setPos({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      })
    }
    const handleUp = () => setDragging(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setResizing(true)
    resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h }
  }, [size])

  useEffect(() => {
    if (!resizing) return
    const handleMove = (e: MouseEvent) => {
      setSize({
        w: Math.max(400, resizeStart.current.w + (e.clientX - resizeStart.current.x)),
        h: Math.max(280, resizeStart.current.h + (e.clientY - resizeStart.current.y)),
      })
    }
    const handleUp = () => setResizing(false)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [resizing])

  const handleClearLogs = async () => {
    try {
      await (window as any).api?.paths?.clearLogs?.()
      logsRef.current = []
      setLogs([])
    } catch {}
  }

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== 'ALL' && log.level !== levelFilter) return false
    if (filter && !log.message.toLowerCase().includes(filter.toLowerCase())) return false
    return true
  })

  const levelColors: Record<string, { bg: string; fg: string }> = {
    ERROR: { bg: '#fee2e2', fg: '#991b1b' },
    WARN: { bg: '#fef3c7', fg: '#92400e' },
    INFO: { bg: '#dbeafe', fg: '#1e40af' },
    DEBUG: { bg: '#f3f4f6', fg: '#6b7280' },
  }

  const levelCounts = { ALL: logs.length, ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 }
  logs.forEach((l) => { if (l.level in levelCounts) levelCounts[l.level as keyof typeof levelCounts]++ })

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, zIndex: 9999, pointerEvents: 'none', overflow: 'visible' }}>
      <div
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          width: size.w,
          height: size.h,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'hidden',
          pointerEvents: 'auto',
          userSelect: dragging || resizing ? 'none' : 'auto',
        }}
      >
        <div
          onMouseDown={handleMouseDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border)',
            cursor: dragging ? 'grabbing' : 'grab',
            background: 'var(--bg-muted)',
            flexShrink: 0,
          }}
        >
          <FileText size={15} style={{ color: 'var(--brand)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap' }}>
            软件日志
          </span>
          {currentFile && (
            <span style={{ fontSize: '10px', color: 'var(--fg-muted)', whiteSpace: 'nowrap' }}>
              {currentFile}
            </span>
          )}

          <div data-no-drag style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {logFiles.length > 1 && (
              <select
                data-no-drag
                value={currentFile}
                onChange={(e) => fetchLogFile(e.target.value)}
                style={{
                  padding: '3px 6px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  fontSize: '10px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {logFiles.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}

            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)' }} />
              <input
                type="text"
                placeholder="搜索..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                style={{
                  width: '120px',
                  padding: '4px 8px 4px 24px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  fontSize: '11px',
                  outline: 'none',
                }}
              />
            </div>

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? '暂停自动刷新' : '开启自动刷新'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: autoRefresh ? 'var(--brand-glow)' : 'transparent',
                color: autoRefresh ? 'var(--brand)' : 'var(--fg-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <RefreshCw size={12} className={autoRefresh ? 'animate-spin' : ''} />
            </button>

            <button
              onClick={fetchLogs}
              title="手动刷新"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--fg-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <RefreshCw size={12} />
            </button>

            <button
              onClick={onClose}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '28px', height: '28px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'transparent',
                color: 'var(--fg-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        <div data-no-drag style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '6px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}>
          {(['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'] as const).map((lvl) => {
            const isActive = levelFilter === lvl
            const colors = lvl === 'ALL' ? null : levelColors[lvl]
            return (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  border: 'none',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  background: isActive
                    ? (colors?.bg || 'var(--brand-glow)')
                    : 'transparent',
                  color: isActive
                    ? (colors?.fg || 'var(--brand)')
                    : 'var(--fg-muted)',
                }}
              >
                {lvl} ({levelCounts[lvl]})
              </button>
            )
          })}
        </div>

        <div
          data-no-drag
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '8px 0',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '11px',
            lineHeight: '1.6',
            background: 'var(--bg)',
          }}
        >
          {error ? (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <div style={{ color: '#991b1b', fontSize: '12px', marginBottom: '8px' }}>{error}</div>
              <button
                onClick={fetchLogs}
                style={{
                  padding: '6px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-surface)',
                  color: 'var(--fg)',
                  cursor: 'pointer',
                  fontSize: '11px',
                }}
              >
                重试
              </button>
            </div>
          ) : loading && logs.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: '12px' }}>
              加载中...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: '12px' }}>
              {logs.length === 0 ? '暂无日志记录' : '没有匹配的日志'}
            </div>
          ) : (
            filteredLogs.map((log, i) => {
              const colors = levelColors[log.level] || levelColors.DEBUG
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '2px 14px',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-muted)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ color: 'var(--fg-muted)', flexShrink: 0, width: '65px' }}>
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <span style={{
                    flexShrink: 0,
                    width: '44px',
                    textAlign: 'center',
                    padding: '0 4px',
                    borderRadius: 'var(--radius-sm)',
                    background: colors.bg,
                    color: colors.fg,
                    fontWeight: 600,
                    fontSize: '10px',
                  }}>
                    {log.level}
                  </span>
                  <span style={{ color: 'var(--fg)', wordBreak: 'break-all' }}>
                    {log.message}
                  </span>
                </div>
              )
            })
          )}
          <div ref={logEndRef} />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 14px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-muted)',
          fontSize: '10px',
          color: 'var(--fg-muted)',
          flexShrink: 0,
        }}>
          <span>
            {filteredLogs.length} / {logs.length} 条
            {autoRefresh && ' · 自动刷新中'}
          </span>
          <button
            onClick={handleClearLogs}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'none', border: 'none',
              color: 'var(--fg-muted)', cursor: 'pointer', fontSize: '10px',
            }}
          >
            <Trash2 size={10} />
            清空日志
          </button>
        </div>

        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            right: 0, bottom: 0,
            width: '16px', height: '16px',
            cursor: 'nwse-resize',
            pointerEvents: 'auto',
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" style={{ position: 'absolute', right: 3, bottom: 3 }}>
            <path d="M8 0v8H0" fill="none" stroke="var(--fg-muted)" strokeWidth="1" opacity="0.4" />
            <path d="M8 3v5H3" fill="none" stroke="var(--fg-muted)" strokeWidth="1" opacity="0.4" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default LogViewer
