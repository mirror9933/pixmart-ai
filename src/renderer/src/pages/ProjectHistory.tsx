import { useState, useMemo, useEffect } from 'react'
import { Search, FolderOpen, Download, Trash2, Eye, X, Image as ImageIcon, CheckSquare, Calendar, Tag } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Checkbox from '@/components/ui/Checkbox'

interface DemoProject {
  id: string
  name: string
  description: string
  category: string
  status: 'done' | 'processing' | 'failed'
  imageCount: number
  date: string
  tags: string[]
  outputImages: string[]
}

const categories = ['全部', '全品类商品图', '风格复刻'] as const

export default function ProjectHistory() {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('全部')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [detailProject, setDetailProject] = useState<DemoProject | null>(null)
  const [detailImages, setDetailImages] = useState<string[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  /** 打开项目详情并加载图片 */
  const openDetail = async (project: DemoProject) => {
    setDetailProject(project)
    setDetailImages([])
    if ((project as any).outputImages?.length) {
      const urls = await Promise.all(
        (project as any).outputImages.slice(0, 20).map((rel: string) =>
          window.api.files.getImageDataUrl(project.id, rel).catch(() => null)
        )
      )
      setDetailImages(urls.filter(Boolean) as string[])
    }
  }
  const [deleteTarget, setDeleteTarget] = useState<DemoProject | null>(null)
  const [projects, setProjects] = useState<DemoProject[]>([])

  // Load real projects from database
  useEffect(() => {
    (async () => {
      const raw = await window.api.projects.getAll().catch(() => [])
      const mapped: DemoProject[] = await Promise.all((raw || []).map(async (p: any) => {
          const outputImages: string[] = p.outputImages || []
          let thumbnail = ''
          if (outputImages.length > 0) {
            try {
              thumbnail = await window.api.files.getImageDataUrl(p.id, outputImages[0]) || ''
            } catch {}
          }
          return {
            id: p.id,
            name: p.title || '',
            description: p.description || '',
            category: p.categoryLabel || p.category || '全品类商品图',
            status: p.status === 'failed' ? 'failed' : p.status === 'processing' ? 'processing' : 'done',
            imageCount: p.imageCount || 0,
            date: (p.updatedAt || p.createdAt || '').slice(0, 10),
            tags: p.params?.tags || [],
            outputImages,
            _thumbnail: thumbnail
          } as DemoProject & { _thumbnail?: string }
        }))
        setProjects(mapped)
      })()
    }, [])

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchCategory = activeCategory === '全部' || p.category === activeCategory
      const matchSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        p.tags.some((t) => t.includes(search))
      return matchCategory && matchSearch
    })
  }, [projects, activeCategory, search])

  const toggleSelectMode = () => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set())
      return !prev
    })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredProjects.map((p) => p.id)))
    }
  }

  const handleBatchDelete = async () => {
    try {
      await window.api.projects.deleteMany([...selectedIds])
    } catch {}
    setProjects((prev) => prev.filter((p) => !selectedIds.has(p.id)))
    setSelectedIds(new Set())
    setSelectMode(false)
  }

  const handleDeleteSingle = async (project: DemoProject) => {
    try {
      await window.api.projects.delete(project.id)
    } catch {}
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
    setDeleteTarget(null)
  }

  const statusMap: Record<string, { label: string; className: string }> = {
    done: { label: '已完成', className: 'status-done' },
    processing: { label: '处理中', className: 'status-pending' },
    failed: { label: '失败', className: 'status-failed' }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--brand-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FolderOpen size={20} style={{ color: 'var(--brand)' }} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--fg)', margin: 0 }}>
            项目记录
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-full)',
            width: '260px'
          }}>
            <Search size={15} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索项目名称、描述、标签..."
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: '13px',
                color: 'var(--fg)',
                width: '100%'
              }}
            />
          </div>
          <Button variant="secondary" onClick={toggleSelectMode} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13px'
          }}>
            <CheckSquare size={14} />
            {selectMode ? '取消管理' : '批量管理'}
          </Button>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: activeCategory === cat ? 600 : 400,
              border: activeCategory === cat ? '1px solid var(--brand)' : '1px solid var(--border)',
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              background: activeCategory === cat ? 'var(--brand-glow)' : 'transparent',
              color: activeCategory === cat ? 'var(--brand)' : 'var(--fg-muted)',
              transition: 'all 0.2s'
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {selectMode && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '10px 16px',
          background: 'var(--brand-glow)',
          border: '1px solid var(--brand)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Checkbox
              checked={selectedIds.size === filteredProjects.length && filteredProjects.length > 0}
              onChange={toggleSelectAll}
            />
            <span style={{ fontSize: '13px', color: 'var(--fg-secondary)' }}>
              已选 <strong style={{ color: 'var(--brand)' }}>{selectedIds.size}</strong> 项
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <Button
            variant="ghost"
            onClick={() => {
              console.log('下载选中:', [...selectedIds])
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 12px' }}
          >
            <Download size={14} />
            下载
          </Button>
          <Button
            variant="danger"
            onClick={handleBatchDelete}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 12px' }}
          >
            <Trash2 size={14} />
            删除
          </Button>
          <Button
            variant="ghost"
            onClick={toggleSelectMode}
            style={{ fontSize: '12px', padding: '4px 12px' }}
          >
            取消
          </Button>
        </div>
      )}

      {filteredProjects.length > 0 ? (
        <div className="anim-stagger" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {filteredProjects.map((project) => {
            const isSelected = selectedIds.has(project.id)
            return (
              <div
                key={project.id}
                className="anim-card"
                style={{
                  background: 'var(--bg-surface)',
                  border: isSelected ? '2px solid var(--brand)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => {
                  if (selectMode) {
                    toggleSelect(project.id)
                  } else {
                    openDetail(project)
                  }
                }}
                onMouseEnter={(e) => {
                  if (!selectMode) {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{
                  height: '140px',
                  background: 'var(--bg-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}>
                  {selectMode && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      zIndex: 1
                    }}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleSelect(project.id)}
                      />
                    </div>
                  )}
                  {(project as any)._thumbnail ? (
                    <img src={(project as any)._thumbnail}
                      alt={project.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <ImageIcon size={32} style={{ color: 'var(--fg-muted)' }} />
                  )}
                </div>

                <div style={{ padding: '14px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '6px'
                  }}>
                    <span style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      background: 'var(--brand-glow)',
                      color: 'var(--brand)',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 500
                    }}>
                      {project.category}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                      {project.imageCount} 张
                    </span>
                  </div>

                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--fg)',
                    margin: '0 0 6px 0'
                  }}>
                    {project.name}
                  </h3>

                  <p style={{
                    fontSize: '12px',
                    color: 'var(--fg-muted)',
                    margin: '0 0 10px 0',
                    lineHeight: '1.5',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {project.description}
                  </p>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: 'var(--fg-muted)'
                    }}>
                      <Calendar size={12} />
                      {project.date}
                    </span>
                    {!selectMode && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            window.api.files.getImagePath(project.id, '.').then((p: string | null) => {
                              if (p) window.api.files.openPath(p)
                            }).catch(() => {})
                          }}
                          style={iconBtnStyle}
                        >
                          <FolderOpen size={13} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(project)
                          }}
                          style={iconBtnStyle}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--fg-muted)'
        }}>
          <ImageIcon size={48} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p style={{ fontSize: '15px', fontWeight: 500, margin: '0 0 4px 0' }}>没有找到匹配的项目</p>
          <p style={{ fontSize: '13px', margin: 0 }}>尝试调整搜索关键词或筛选条件</p>
        </div>
      )}

      {detailProject && (
        <Modal open={true} onClose={() => { setDetailProject(null); setDetailImages([]) }}>
          <div className="anim-fade-in" style={{
            display: 'flex', flexDirection: 'column', gap: '16px',
            maxWidth: '100%', overflowX: 'hidden', wordBreak: 'break-word'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--brand-glow)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <ImageIcon size={18} style={{ color: 'var(--brand)' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{
                  fontSize: '15px', fontWeight: 700, color: 'var(--fg)',
                  margin: '0 0 4px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {detailProject.name}
                </h2>
                <span className={statusMap[detailProject.status].className} style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600
                }}>
                  {statusMap[detailProject.status].label}
                </span>
              </div>
            </div>

            <div>
              {detailImages.length > 0 ? (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '6px',
                  maxHeight: '180px',
                  overflowY: 'auto',
                  overflowX: 'hidden'
                }}>
                  {detailImages.map((url, i) => (
                    <div key={i} style={{
                      aspectRatio: '1',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      background: 'var(--bg-muted)',
                      border: '1px solid var(--border-subtle)',
                      position: 'relative',
                      cursor: 'pointer'
                    }} onClick={() => setPreviewUrl(url)}>
                      <img src={url} alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {/* 预览按钮：图片右上角 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setPreviewUrl(url) }}
                        title="预览图片"
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.55)',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          opacity: '0.9',
                          transition: 'all 0.15s'
                        }}
                      >
                        <Eye size={13} style={{ color: '#fff' }} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  height: '100px',
                  background: 'var(--bg-muted)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <ImageIcon size={40} style={{ color: 'var(--fg-muted)' }} />
                </div>
              )}
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              fontSize: '12px',
              flexWrap: 'wrap'
            }}>
              <span>
                <span style={{ color: 'var(--fg-muted)' }}>图片数量 </span>
                <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{detailProject.imageCount} 张</span>
              </span>
              <span>
                <span style={{ color: 'var(--fg-muted)' }}>创建日期 </span>
                <span style={{ color: 'var(--fg)' }}>{detailProject.date}</span>
              </span>
              <span>
                <span style={{ color: 'var(--fg-muted)' }}>分类 </span>
                <span style={{ color: 'var(--fg)' }}>{detailProject.category}</span>
              </span>
            </div>

            {detailProject.description && (
              <p style={{
                fontSize: '13px',
                color: 'var(--fg-secondary)',
                margin: 0,
                lineHeight: '1.6',
                overflow: 'hidden'
              }}>
                {detailProject.description}
              </p>
            )}

            {detailProject.tags.length > 0 && (
              <div style={{
                display: 'flex',
                gap: '5px',
                flexWrap: 'wrap'
              }}>
                {detailProject.tags.map((tag) => (
                  <span key={tag} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '11px',
                    padding: '3px 8px',
                    background: 'var(--bg-muted)',
                    borderRadius: 'var(--radius-full)',
                    color: 'var(--fg-muted)',
                    whiteSpace: 'nowrap'
                  }}>
                    <Tag size={10} />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={() => { setDetailProject(null); setDetailImages([]) }}>
                关闭
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal open={true} onClose={() => setDeleteTarget(null)}>
          <div className="anim-fade-in" style={{ padding: '24px', textAlign: 'center', maxWidth: '380px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-full)',
              background: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Trash2 size={24} style={{ color: '#ef4444' }} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--fg)', margin: '0 0 8px 0' }}>
              确认删除
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: '0 0 20px 0' }}>
              确定要删除「{deleteTarget.name}」吗？此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button variant="danger" onClick={() => handleDeleteSingle(deleteTarget)}>
                确认删除
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* 图片大图预览 */}
      {previewUrl && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.85)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out'
        }} onClick={() => setPreviewUrl(null)}>
          <button
            onClick={() => setPreviewUrl(null)}
            style={{
              position: 'absolute', top: '16px', right: '16px',
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', zIndex: 1
            }}
          >
            <X size={18} style={{ color: '#fff' }} />
          </button>
          <img src={previewUrl} alt="预览"
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--fg-muted)',
  transition: 'all 0.15s'
}
