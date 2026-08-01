import { useState, useCallback, useEffect } from 'react'
import {
  Layers, Settings2, Trash2, Plus, Upload, Sparkles, Zap, ChevronRight, ArrowLeft
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Toggle from '@/components/ui/Toggle'
import UploadArea, { type UploadedFile } from '@/components/ui/UploadArea'
import AiWriteModal from '@/components/shared/AiWriteModal'
import { useModelOptions } from '@/hooks/useModelOptions'

interface TaskCard {
  id: string
  title: string
  scope: 'global' | 'custom'
  platform: string
  language: string
  model: string
  size: string
  quality: string
  quantity: string
  description: string
}

const topTabs = ['主图', '详情图'] as const
type TopTab = (typeof topTabs)[number]

function createTask(index: number): TaskCard {
  return {
    id: `task-${Date.now()}-${index}`,
    title: `任务 ${index}`,
    scope: 'global',
    platform: '',
    language: '',
    model: '',
    size: '',
    quality: '',
    quantity: '',
    description: ''
  }
}

export default function BatchTasks() {
  const navigate = useNavigate()
  const { allModels: modelOptions } = useModelOptions()
  const [activeTab, setActiveTab] = useState<Tab>('主图')
  const [tasks, setTasks] = useState<TaskCard[]>(() => [
    createTask(1),
    createTask(2),
    createTask(3)
  ])
  const [detailModule, setDetailModule] = useState(false)
  const [globalDesc, setGlobalDesc] = useState('')
  const [globalSettings, setGlobalSettings] = useState({
    platform: '',
    language: '',
    model: '',
    size: '',
    quality: '',
    quantity: ''
  })
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [batchImages, setBatchImages] = useState<UploadedFile[]>([])
  const [backHover, setBackHover] = useState(false)

  // Restore temporary state (auto-deleted when app exits)
  useEffect(() => {
    (async () => {
      try {
        const state = await window.api.files.loadTempState('batchTasks')
        if (!state) return
        if (state.activeTab) setActiveTab(state.activeTab)
        if (typeof state.detailModule === 'boolean') setDetailModule(state.detailModule)
        if (state.globalDesc) setGlobalDesc(state.globalDesc)
        if (state.globalSettings) setGlobalSettings(state.globalSettings)
        if (state.tasks?.length) setTasks(state.tasks)
        if (state.batchImages?.length) setBatchImages(state.batchImages)
      } catch {}
    })()
  }, [])

  const handleBack = async () => {
    try {
      await window.api.files.saveTempState('batchTasks', {
        activeTab,
        detailModule,
        globalDesc,
        globalSettings,
        tasks,
        batchImages: batchImages.map(img => ({
          path: img.path, name: img.name, size: img.size, dataUrl: img.dataUrl
        }))
      })
    } catch {}
    navigate('/', { state: { restore: true } })
  }

  const addTask = useCallback(() => {
    setTasks((prev) => [...prev, createTask(prev.length + 1)])
  }, [])

  const removeTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.filter((t) => t.id !== id).map((t, i) => ({ ...t, title: `任务 ${i + 1}` }))
    )
  }, [])

  const updateTask = useCallback((id: string, data: Partial<TaskCard>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)))
  }, [])

  const handleSubmit = () => {
    console.log('提交批量任务:', { globalSettings, tasks })
  }

  const handleSelectImages = (files: UploadedFile[]) => {
    setBatchImages(prev => [...prev, ...files])
  }

  const handleRemoveImage = (index: number) => {
    setBatchImages(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div style={{ padding: '8px 24px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div
        onMouseEnter={() => setBackHover(true)}
        onMouseLeave={() => setBackHover(false)}
        style={{
          display: 'inline-block',
          marginBottom: '8px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: backHover ? 'var(--brand-glow)' : 'transparent',
          transition: 'background-color 0.2s ease',
        }}
      >
        <button
          onClick={handleBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            fontWeight: 400,
            color: backHover ? 'var(--brand)' : 'var(--fg-muted)',
            backgroundColor: backHover ? 'var(--brand-glow)' : 'transparent',
            transition: 'color 0.2s ease, background-color 0.2s ease',
            border: 'none',
            cursor: 'pointer',
            marginBottom: '8px',
          }}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
        >
          <ArrowLeft size={16} />
          返回
        </button>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--brand-glow)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Layers size={20} style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '22px',
              fontWeight: 700,
              color: 'var(--fg)',
              margin: 0
            }}>批量任务</h1>
            <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: 0 }}>
              一次性创建多个生成任务，高效批量产出电商图片
            </p>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        background: 'var(--bg-muted)',
        borderRadius: 'var(--radius-md)',
        padding: '4px',
        width: 'fit-content'
      }}>
        {topTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as TopTab)}
            style={{
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: activeTab === tab ? 600 : 400,
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: activeTab === tab ? 'var(--bg-surface)' : 'transparent',
              color: activeTab === tab ? 'var(--brand)' : 'var(--fg-muted)',
              boxShadow: activeTab === tab ? 'var(--shadow-sm)' : 'none'
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px',
        marginBottom: '20px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px'
        }}>
          <Settings2 size={16} style={{ color: 'var(--brand)' }} />
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg)' }}>
            全局批量设置
          </span>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>全局 AI 帮写</label>
          <div style={{ position: 'relative' }}>
            <Textarea
              value={globalDesc}
              onChange={setGlobalDesc}
              placeholder="输入全局产品描述，AI 将为每个任务自动生成描述..."
              rows={3}
            />
            <button
              onClick={() => setAiModalOpen(true)}
              style={aiWriteBtnStyle}
            >
              <Sparkles size={12} />
              AI帮写
            </button>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          marginBottom: '14px'
        }}>
          <div>
            <label style={labelStyle}>目标平台</label>
            <Select
              value={globalSettings.platform}
              onChange={(v) => setGlobalSettings((s) => ({ ...s, platform: v }))}
              options={[
                { value: 'taobao', label: '淘宝' },
                { value: 'tmall', label: '天猫' },
                { value: 'jd', label: '京东' },
                { value: 'pinduoduo', label: '拼多多' }
              ]}
              placeholder="选择平台"
            />
          </div>
          <div>
            <label style={labelStyle}>目标语言</label>
            <Select
              value={globalSettings.language}
              onChange={(v) => setGlobalSettings((s) => ({ ...s, language: v }))}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
                { value: 'ja', label: '日本語' }
              ]}
              placeholder="选择语言"
            />
          </div>
          <div>
            <label style={labelStyle}>生成模型</label>
            <Select
              value={globalSettings.model}
              onChange={(v) => setGlobalSettings((s) => ({ ...s, model: v }))}
              options={modelOptions}
              placeholder="选择模型"
            />
          </div>
          <div>
            <label style={labelStyle}>图片尺寸</label>
            <Select
              value={globalSettings.size}
              onChange={(v) => setGlobalSettings((s) => ({ ...s, size: v }))}
              options={[
                { value: '1:1', label: '1:1 (800×800)' },
                { value: '3:4', label: '3:4 (600×800)' },
                { value: '16:9', label: '16:9 (1200×675)' }
              ]}
              placeholder="选择尺寸"
            />
          </div>
          <div>
            <label style={labelStyle}>输出质量</label>
            <Select
              value={globalSettings.quality}
              onChange={(v) => setGlobalSettings((s) => ({ ...s, quality: v }))}
              options={[
                { value: 'standard', label: '标准' },
                { value: 'hd', label: '高清' },
                { value: '2k', label: '2K' }
              ]}
              placeholder="选择质量"
            />
          </div>
          <div>
            <label style={labelStyle}>生成数量</label>
            <Select
              value={globalSettings.quantity}
              onChange={(v) => setGlobalSettings((s) => ({ ...s, quantity: v }))}
              options={[
                { value: '1', label: '1 张' },
                { value: '2', label: '2 张' },
                { value: '4', label: '4 张' }
              ]}
              placeholder="选择数量"
            />
          </div>
        </div>

        {activeTab === '详情图' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: 'var(--bg-muted)',
            borderRadius: 'var(--radius-md)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-secondary)' }}>
                详情图模块
              </span>
              <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                {detailModule ? '自定义模块' : '智能模块'}
              </span>
            </div>
            <Toggle checked={detailModule} onChange={setDetailModule} />
          </div>
        )}
      </div>

      <div className="anim-stagger" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '80px' }}>
        {tasks.map((task, index) => (
          <div
            key={task.id}
            className="anim-card"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '16px 20px'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--brand)',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {index + 1}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
                  {task.title}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex',
                  gap: '2px',
                  background: 'var(--bg-muted)',
                  borderRadius: 'var(--radius-md)',
                  padding: '3px'
                }}>
                  {(['global', 'custom'] as const).map((scope) => (
                    <button
                      key={scope}
                      onClick={() => updateTask(task.id, { scope })}
                      style={{
                        padding: '4px 12px',
                        fontSize: '11px',
                        fontWeight: task.scope === scope ? 600 : 400,
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer',
                        background: task.scope === scope ? 'var(--bg-surface)' : 'transparent',
                        color: task.scope === scope ? 'var(--brand)' : 'var(--fg-muted)',
                        boxShadow: task.scope === scope ? 'var(--shadow-sm)' : 'none',
                        transition: 'all 0.2s'
                      }}
                    >
                      {scope === 'global' ? '跟随全局' : '单独设置'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => removeTask(task.id)}
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--fg-muted)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#ef4444'
                    e.currentTarget.style.color = '#ef4444'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--fg-muted)'
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {task.scope === 'custom' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <UploadArea count={0} maxCount={6} label={`上传 ${task.title} 产品图`} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <Select
                    value={task.platform}
                    onChange={(v) => updateTask(task.id, { platform: v })}
                    options={[
                      { value: 'taobao', label: '淘宝' },
                      { value: 'tmall', label: '天猫' },
                      { value: 'jd', label: '京东' }
                    ]}
                    placeholder="平台"
                  />
                  <Select
                    value={task.model}
                    onChange={(v) => updateTask(task.id, { model: v })}
                    options={modelOptions}
                    placeholder="模型"
                  />
                  <Select
                    value={task.quality}
                    onChange={(v) => updateTask(task.id, { quality: v })}
                    options={[
                      { value: 'standard', label: '标准' },
                      { value: 'hd', label: '高清' },
                      { value: '2k', label: '2K' }
                    ]}
                    placeholder="质量"
                  />
                </div>
              </div>
            ) : (
              <UploadArea count={0} maxCount={6} label={`上传 ${task.title} 产品图`} />
            )}
          </div>
        ))}

        <button
          onClick={addTask}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '14px',
            border: '2px dashed var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--brand)'
            e.currentTarget.style.color = 'var(--brand)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--fg-muted)'
          }}
        >
          <Plus size={16} />
          添加任务
        </button>
      </div>

      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        boxShadow: '0 -4px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          maxWidth: '1200px',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Upload size={16} style={{ color: 'var(--fg-muted)' }} />
          <span style={{ fontSize: '14px', color: 'var(--fg-secondary)' }}>
            预计执行 <strong style={{ color: 'var(--brand)' }}>{tasks.length}</strong> 项任务
          </span>
        </div>
        <Button variant="primary" onClick={handleSubmit} style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 28px'
        }}>
          <Zap size={16} />
          提交任务
          <ChevronRight size={14} />
        </Button>
        </div>
      </div>

      <AiWriteModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onApply={(text) => {
          setGlobalDesc(text)
          setAiModalOpen(false)
        }}
        productImages={batchImages.map(img => img.dataUrl)}
        productInfo={globalDesc}
        context=""
      />
    </div>
  )
}

type Tab = TopTab

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--fg-secondary)',
  marginBottom: '6px'
}

const aiWriteBtnStyle: React.CSSProperties = {
  position: 'absolute',
  right: '8px',
  bottom: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--brand)',
  background: 'var(--brand-glow)',
  border: '1px solid var(--brand)',
  borderRadius: 'var(--radius-full)',
  cursor: 'pointer'
}
