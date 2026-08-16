import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Layers, Settings2, Trash2, Plus, Upload, Sparkles, Zap, ChevronRight, ArrowLeft, X
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import SearchableSelect from '@/components/ui/SearchableSelect'
import Textarea from '@/components/ui/Textarea'
import UploadArea, { type UploadedFile } from '@/components/ui/UploadArea'
import AiWriteModal from '@/components/shared/AiWriteModal'
import ErrorModal from '@/components/shared/ErrorModal'
import ModuleSelector from '@/components/shared/ModuleSelector'
import type { CustomModuleData } from '@/components/shared/CustomModuleModal'
import { useModelOptions } from '@/hooks/useModelOptions'
import { uploadToBase64 } from '@/utils/imageToBase64'
import { MAIN_MODULE_TYPES } from '@/constants/mainModules'
import { DETAIL_MODULE_TYPES } from '@/constants/detailModules'
import { MAIN_DETAIL_SIZE_OPTIONS, PLATFORM_OPTIONS } from '@/constants/sizeOptions'

interface TaskCard {
  id: string
  title: string
  scope: 'global' | 'custom'
  platform: string
  language: string
  model: string
  size: string
  quality: string
  description: string
  images: UploadedFile[]
  /** 单独设置的模块选择(跟随全局时忽略) */
  modules: Record<string, number>
  /** 单独设置的完整模块定义(内置含覆盖 + 自定义) */
  moduleList: CustomModuleData[]
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
    description: '',
    images: [],
    modules: {},
    moduleList: []
  }
}

/** 按所选模块展开生成任务:每个模块按其数量生成多张 */
function expandModules(
  modules: Record<string, number>,
  moduleTypes: CustomModuleData[]
): Array<{ id: string; prompt: string }> {
  const prompts: Array<{ id: string; prompt: string }> = []
  for (const type of moduleTypes) {
    const count = modules[type.key] || 0
    for (let i = 1; i <= count; i++) {
      prompts.push({ id: `${type.key}-${i}`, prompt: type.prompt })
    }
  }
  return prompts
}

export default function BatchTasks() {
  const navigate = useNavigate()
  const { allModels: modelOptions, textModels: textModelOptions } = useModelOptions()
  const [activeTab, setActiveTab] = useState<TopTab>('主图')
  const [tasks, setTasks] = useState<TaskCard[]>(() => [
    createTask(1),
    createTask(2),
    createTask(3)
  ])
  const [globalSettings, setGlobalSettings] = useState({
    platform: '',
    language: '',
    textModel: '',
    model: '',
    size: '',
    quality: ''
  })
  // 批量模块选择:主图/详情图各一套(与单图流程共用模块定义与自定义存储)
  const [batchMainModules, setBatchMainModules] = useState<Record<string, number>>(
    Object.fromEntries(MAIN_MODULE_TYPES.map(m => [m.key, 1]))
  )
  const [batchMainModuleList, setBatchMainModuleList] = useState<CustomModuleData[]>(MAIN_MODULE_TYPES)
  const [batchDetailModules, setBatchDetailModules] = useState<Record<string, number>>(
    Object.fromEntries(DETAIL_MODULE_TYPES.map(m => [m.key, 1]))
  )
  const [batchDetailModuleList, setBatchDetailModuleList] = useState<CustomModuleData[]>(DETAIL_MODULE_TYPES)
  // AI 帮写:当前正在编辑描述的任务 id(null 表示未打开)
  const [aiWriteTargetId, setAiWriteTargetId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [batchMsg, setBatchMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // 错误弹窗(模型校验 / 生成失败等)
  const [errorModal, setErrorModal] = useState<{ title?: string; message: string } | null>(null)

  // Restore temporary state (auto-deleted when app exits)
  useEffect(() => {
    (async () => {
      try {
        const state = await window.api.files.loadTempState('batchTasks')
        if (!state) return
        if (state.activeTab) setActiveTab(state.activeTab)
        if (state.globalSettings) setGlobalSettings(state.globalSettings)
        if (state.tasks?.length) setTasks(state.tasks)
        if (state.batchMainModules) setBatchMainModules(state.batchMainModules)
        if (state.batchDetailModules) setBatchDetailModules(state.batchDetailModules)
      } catch {}
    })()
  }, [])

  const handleBack = async () => {
    try {
      await window.api.files.saveTempState('batchTasks', {
        activeTab,
        globalSettings,
        tasks,
        batchMainModules,
        batchDetailModules
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

  const removeTaskImage = useCallback((taskId: string, index: number) => {
    setTasks((prev) => prev.map((t) =>
      t.id === taskId ? { ...t, images: t.images.filter((_, i) => i !== index) } : t
    ))
  }, [])

  /** 切换任务作用域:切到"单独设置"时初始化该任务的模块选择(默认全选) */
  const changeScope = (taskId: string, scope: 'global' | 'custom') => {
    if (scope === 'custom') {
      const base = activeTab === '主图' ? MAIN_MODULE_TYPES : DETAIL_MODULE_TYPES
      updateTask(taskId, {
        scope,
        modules: Object.fromEntries(base.map(m => [m.key, 1]))
      })
    } else {
      updateTask(taskId, { scope })
    }
  }

  /** 提交批量任务:每个有产品图的任务创建一个项目并按其模块选择提交生成 */
  const handleSubmit = async () => {
    if (submitting) return
    const currentModules = activeTab === '主图' ? batchMainModules : batchDetailModules
    const currentModuleList = activeTab === '主图' ? batchMainModuleList : batchDetailModuleList
    if (Object.keys(currentModules).length === 0) {
      setBatchMsg({ type: 'error', text: '请至少选择一个模块' })
      return
    }
    const globalPrompts = expandModules(currentModules, currentModuleList)
    if (globalPrompts.length === 0) return
    const validTasks = tasks.filter(t => t.images.length > 0)
    if (validTasks.length === 0) {
      setBatchMsg({ type: 'error', text: '请至少为一项任务上传产品图' })
      return
    }
    // 模型必选校验:每个有效任务都必须有生成模型(全局或单独设置)
    for (const task of validTasks) {
      const model = task.scope === 'custom' ? task.model : globalSettings.model
      if (!model) {
        setErrorModal({
          title: '请先选择模型',
          message: task.scope === 'custom'
            ? `任务「${task.title}」未选择生成模型，请在「单独设置」中选择。`
            : '未选择生成模型，请先在「全局批量设置」的生成模型中选择。'
        })
        return
      }
    }
    // 尺寸预校验:按模型尺寸能力表明确不支持的,弹窗提示并中止提交
    for (const task of validTasks) {
      const custom = task.scope === 'custom'
      const model = custom ? task.model : globalSettings.model
      const size = custom ? task.size : globalSettings.size
      if (!model || !size) continue
      try {
        const check = await window.api.ai.checkSize({ model, size })
        if (check.known && !check.supported) {
          setErrorModal({
            title: '尺寸不支持',
            message: `任务「${task.title}」：${check.message || `模型不支持 ${size} 尺寸`}\n\n该模型支持：${(check.suggestions || []).join('、')}\n\n请在「图片尺寸」中选择支持的尺寸，或更换生成模型后重新提交。`
          })
          return
        }
      } catch {}
    }

    const platformLabel = (v: string) => PLATFORM_OPTIONS.find(p => p.value === v)?.label || v
    const languageLabel = (v: string) => v === 'zh' ? '中文' : v === 'en' ? 'English' : v === 'ja' ? '日本語' : v

    setSubmitting(true)
    setBatchMsg(null)
    let submitted = 0
    let failed = 0
    // 尺寸不支持提示只弹一次
    const sizeNotified = { done: false }
    try {
      for (const task of validTasks) {
        try {
          const custom = task.scope === 'custom'
          // 模块:单独设置的任务用其自身模块选择,否则跟随全局
          const taskModules = custom && Object.keys(task.modules).length > 0 ? task.modules : currentModules
          const taskModuleList = custom && task.moduleList.length > 0 ? task.moduleList : currentModuleList
          // 只保留当前模块列表中存在的选择,按列表顺序展开
          const effectiveModules: Record<string, number> = {}
          for (const type of taskModuleList) {
            const c = taskModules[type.key] || 0
            if (c > 0) effectiveModules[type.key] = c
          }
          if (Object.keys(effectiveModules).length === 0) {
            failed++
            continue
          }
          const prompts = expandModules(effectiveModules, taskModuleList)

          const imageUrls = await Promise.all(task.images.map(img => uploadToBase64(img)))
          const project = await window.api.projects.create({
            title: task.title,
            description: task.description,
            category: activeTab === '主图' ? '全品类商品图' : '详情图',
            categoryLabel: activeTab === '主图' ? '全品类商品图' : '详情图',
            sourceImages: imageUrls
          })
          // 平台/语言作为补充要求传入生成
          const platform = custom ? task.platform : globalSettings.platform
          const language = custom ? task.language : globalSettings.language
          const extraPrompt = [
            platform ? `目标平台：${platformLabel(platform)}` : '',
            language ? `目标语言：${languageLabel(language)}` : ''
          ].filter(Boolean).join('。')

          await window.api.ai.generateImages({
            projectId: project.id,
            prompts,
            model: (custom ? task.model : globalSettings.model) || undefined,
            quality: (custom ? task.quality : globalSettings.quality) || undefined,
            size: (custom ? task.size : globalSettings.size) || undefined,
            referenceImages: imageUrls,
            extraPrompt: extraPrompt || undefined
          })
          submitted++
        } catch (e: any) {
          // 模型不支持所选尺寸:弹窗告知,让用户选择调整尺寸后重新提交
          const errMsg = e?.message || ''
          if (errMsg.includes('SIZE_NOT_SUPPORTED') && !sizeNotified.done) {
            sizeNotified.done = true
            setErrorModal({
              title: '尺寸不支持',
              message: '有任务的生成尺寸不被当前模型支持，图片无法按该尺寸生成。\n\n请在「图片尺寸」中调整尺寸，或更换生成模型后重新提交任务。'
            })
          }
          failed++
        }
      }
    } finally {
      setSubmitting(false)
    }
    setBatchMsg({
      type: failed === 0 ? 'success' : 'error',
      text: failed === 0
        ? `已提交 ${submitted} 个任务，共 ${submitted * globalPrompts.length} 张图片生成`
        : `提交完成：成功 ${submitted} 个，失败 ${failed} 个`
    })
  }

  const totalImages = tasks.filter(t => t.images.length > 0).length
  const currentModules = activeTab === '主图' ? batchMainModules : batchDetailModules
  const plannedCount = Object.values(currentModules).reduce((a, b) => a + b, 0)
  // 预计生成张数:单独设置的任务按各自模块计算,其余按全局模块
  const totalPlanned = tasks.filter(t => t.images.length > 0).reduce((sum, t) => {
    if (t.scope === 'custom' && Object.keys(t.modules).length > 0) {
      return sum + Object.values(t.modules).reduce((a, b) => a + b, 0)
    }
    return sum + plannedCount
  }, 0)

  // AI 帮写参考的目标平台:单独设置的任务用任务平台,否则用全局平台(转中文标签)
  const aiWriteTask = tasks.find(t => t.id === aiWriteTargetId) || null
  const aiWritePlatform = aiWriteTask
    ? (aiWriteTask.scope === 'custom' ? aiWriteTask.platform : globalSettings.platform)
    : ''
  const aiWritePlatformLabel = aiWritePlatform
    ? (PLATFORM_OPTIONS.find(p => p.value === aiWritePlatform)?.label || aiWritePlatform)
    : ''

  return (
    <div style={{ padding: '8px 24px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <button
        onClick={handleBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: 'var(--radius-md)',
          fontSize: '13px',
          fontWeight: 400,
          color: 'var(--fg-muted)',
          backgroundColor: 'transparent',
          transition: 'color 0.2s ease, background-color 0.2s ease',
          border: 'none',
          cursor: 'pointer',
          marginBottom: '8px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--brand)'
          e.currentTarget.style.backgroundColor = 'var(--brand-glow)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--fg-muted)'
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <ArrowLeft size={16} />
        返回
      </button>

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
              多商品批量生成：每个任务上传产品图，按所选模块统一批量产出
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
            onClick={() => setActiveTab(tab)}
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
              options={PLATFORM_OPTIONS}
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
            <label style={labelStyle}>文案模型（AI 帮写）</label>
            <SearchableSelect
              value={globalSettings.textModel}
              onChange={(v) => setGlobalSettings((s) => ({ ...s, textModel: v }))}
              options={textModelOptions}
              placeholder="AI 写作/识图"
            />
          </div>
          <div>
            <label style={labelStyle}>生成模型</label>
            <SearchableSelect
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
              options={MAIN_DETAIL_SIZE_OPTIONS}
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
        </div>

        {/* 模块选择:与单图流程一致(主图 5 模块 / 详情图 16 模块) */}
        {activeTab === '主图' ? (
          <ModuleSelector
            baseModules={MAIN_MODULE_TYPES}
            storageKey="main_custom_modules"
            overrideKey="main_module_overrides"
            value={batchMainModules}
            onChange={setBatchMainModules}
            onModuleListChange={setBatchMainModuleList}
          />
        ) : (
          <ModuleSelector
            baseModules={DETAIL_MODULE_TYPES}
            storageKey="detail_custom_modules"
            overrideKey="detail_module_overrides"
            value={batchDetailModules}
            onChange={setBatchDetailModules}
            onModuleListChange={setBatchDetailModuleList}
          />
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
                      onClick={() => changeScope(task.id, scope)}
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

            {/* 任务产品图 */}
            <div style={{ marginBottom: '12px' }}>
              {task.images.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  {task.images.map((img, i) => (
                    <div key={i} style={{
                      position: 'relative',
                      width: '64px',
                      height: '64px',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      border: '1px solid var(--border)'
                    }}>
                      <img src={img.dataUrl} alt={img.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        onClick={() => removeTaskImage(task.id, i)}
                        style={{
                          position: 'absolute',
                          top: '2px',
                          right: '2px',
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.55)',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <UploadArea
                count={task.images.length}
                maxCount={6}
                label={`上传 ${task.title} 产品图`}
                onUpload={(files) => updateTask(task.id, { images: [...task.images, ...files] })}
              />
            </div>

            {/* 任务产品描述(AI 帮写按任务独立) */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>产品描述</label>
              <div style={{ position: 'relative' }}>
                <Textarea
                  value={task.description}
                  onChange={(e) => updateTask(task.id, { description: e.target.value })}
                  placeholder="建议输入：产品名称、卖点、目标人群、目标电商平台、图片风格等"
                  rows={2}
                />
                <button
                  onClick={() => {
                    // 模型必选校验:AI 帮写需要文案模型
                    if (!globalSettings.textModel) {
                      setErrorModal({
                        title: '请先选择模型',
                        message: '使用 AI 帮写前，请先在「全局批量设置」的文案模型中选择一个模型。'
                      })
                      return
                    }
                    setAiWriteTargetId(task.id)
                  }}
                  style={aiWriteBtnStyle}
                >
                  <Sparkles size={12} />
                  AI帮写
                </button>
              </div>
            </div>

            {task.scope === 'custom' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '10px' }}>
                  <Select
                    value={task.platform}
                    onChange={(v) => updateTask(task.id, { platform: v })}
                    options={PLATFORM_OPTIONS}
                    placeholder="平台"
                  />
                  <Select
                    value={task.language}
                    onChange={(v) => updateTask(task.id, { language: v })}
                    options={[
                      { value: 'zh', label: '中文' },
                      { value: 'en', label: 'English' },
                      { value: 'ja', label: '日本語' }
                    ]}
                    placeholder="语言"
                  />
                  <SearchableSelect
                    value={task.model}
                    onChange={(v) => updateTask(task.id, { model: v })}
                    options={modelOptions}
                    placeholder="模型"
                  />
                  <Select
                    value={task.size}
                    onChange={(v) => updateTask(task.id, { size: v })}
                    options={MAIN_DETAIL_SIZE_OPTIONS}
                    placeholder="尺寸"
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
                {/* 单独设置:任务独立的模块选择(默认全选当前类型的模块) */}
                <ModuleSelector
                  baseModules={activeTab === '主图' ? MAIN_MODULE_TYPES : DETAIL_MODULE_TYPES}
                  storageKey={activeTab === '主图' ? 'main_custom_modules' : 'detail_custom_modules'}
                  overrideKey={activeTab === '主图' ? 'main_module_overrides' : 'detail_module_overrides'}
                  value={task.modules}
                  onChange={(v) => updateTask(task.id, { modules: v })}
                  onModuleListChange={(list) => updateTask(task.id, { moduleList: list })}
                />
              </>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>
                跟随全局设置（平台/语言/模型/尺寸/质量/模块）
              </div>
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
              {totalImages > 0 ? (
                <>
                  预计生成 <strong style={{ color: 'var(--brand)' }}>{totalPlanned}</strong> 张图片
                  （{totalImages} 个任务）
                </>
              ) : (
                '请为任务上传产品图'
              )}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {batchMsg && (
              <span style={{
                fontSize: '12px',
                color: batchMsg.type === 'success' ? '#16a34a' : 'var(--danger)'
              }}>
                {batchMsg.text}
              </span>
            )}
            <Button variant="primary" onClick={handleSubmit} disabled={submitting || totalImages === 0} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 28px'
            }}>
              <Zap size={16} />
              {submitting ? '提交中...' : '提交任务'}
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      </div>

      <AiWriteModal
        open={!!aiWriteTargetId}
        onClose={() => setAiWriteTargetId(null)}
        onApply={(text) => {
          if (aiWriteTargetId) updateTask(aiWriteTargetId, { description: text })
          setAiWriteTargetId(null)
        }}
        productImages={tasks.find(t => t.id === aiWriteTargetId)?.images.map(img => img.dataUrl) || []}
        productInfo={tasks.find(t => t.id === aiWriteTargetId)?.description || ''}
        context={aiWritePlatformLabel || ''}
        selectedModel={globalSettings.textModel}
      />

      {errorModal && (
        <ErrorModal
          open
          title={errorModal.title}
          message={errorModal.message}
          onClose={() => setErrorModal(null)}
        />
      )}
    </div>
  )
}

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
