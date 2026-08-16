import { useState, useEffect, useRef } from 'react'
import {
  FolderCog, Cpu, Sliders, Eye, EyeOff, RefreshCw, Check,
  Plus, Trash2, Zap, TestTube, Server, ChevronRight, Pencil,
  Settings2, FolderOpen, Image as ImageIcon, FileText, HardDrive,
  Info, Sparkles, Download, Copy
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Toggle from '@/components/ui/Toggle'
import Badge from '@/components/ui/Badge'
import Checkbox from '@/components/ui/Checkbox'
import Modal from '@/components/ui/Modal'
import { useLogViewerStore } from '@/stores/useLogViewerStore'
import { useModelStore } from '@/stores/useModelStore'
import { VENDOR_INFO, PROTOCOL_INFO, CAPABILITY_LABELS, type VendorType, type CustomProtocol, type ModelConfig, type ModelInfo, type ModelMeta, type ModelCapability } from '@/types/model'

const sidebarItems = [
  { key: 'models', label: '模型管理', icon: Cpu },
  { key: 'advanced', label: '高级设置', icon: Sliders },
  { key: 'about', label: '关于 Pixmart', icon: Info }
] as const

const PATH_LABELS: Record<string, string> = {
  projects: '项目文件',
  exports: '图片导出',
  temp: '临时文件',
  logs: '日志文件'
}

const PATH_DESCS: Record<string, string> = {
  projects: '存储所有项目数据和生成的图片',
  exports: '默认的图片导出保存路径',
  temp: '存储生成过程中的临时文件',
  logs: '存储应用运行日志'
}

const PATH_ICONS: Record<string, typeof FolderCog> = {
  projects: FolderOpen,
  exports: ImageIcon,
  temp: HardDrive,
  logs: FileText
}

type SidebarKey = (typeof sidebarItems)[number]['key']

/** 网盘下载链接(安装包分享页/直链)。点击"网盘下载"弹窗确认后浏览器跳转 */
const MIRROR_DOWNLOAD_URL = 'https://pan.quark.cn/s/bc5115bec115'
/** 网盘提取码(弹窗中告知用户) */
const MIRROR_DOWNLOAD_CODE = 'aAD9'

/** 厂商 logo(本地 SVG,离线可用;自定义厂商用图标占位) */
const VENDOR_LOGOS: Record<string, string> = {
  openai: '/vendor-logo/openai.svg',
  anthropic: '/vendor-logo/anthropic.svg',
  google: '/vendor-logo/google.svg',
  openrouter: '/vendor-logo/openrouter.svg',
  agnes: '/vendor-logo/agnes.svg',
  ofox: '/vendor-logo/ofox.svg',
  aihubmix: '/vendor-logo/aihubmix.svg',
  siliconflow: '/vendor-logo/siliconflow.svg',
  volcengine: '/vendor-logo/volcengine.svg',
  bailian: '/vendor-logo/bailian.svg',
  mimo: '/vendor-logo/mimo.svg',
  kimi: '/vendor-logo/kimi.svg',
  minimax: '/vendor-logo/minimax.svg'
}

/** Ofox 推广注册链接(悬浮 Ofox 卡片弹窗跳转) */
const OFOX_REFERRAL_URL = 'https://ofox.io/r/n8ebbc'

/** MiMo 推广注册链接(悬浮 MiMo 卡片弹窗跳转,邀请码 6Q7WYQ) */
const MIMO_REFERRAL_URL = 'https://platform.xiaomimimo.com?ref=6Q7WYQ'

/** SiliconFlow 推荐官邀请链接(悬浮 SiliconFlow 卡片弹窗跳转) */
const SILICONFLOW_REFERRAL_URL = 'https://cloud.siliconflow.cn/i/oGNJ2KSx'

export default function Settings() {
  const {
    modelConfigs, fetchConfigs, addConfig, updateConfig, deleteConfig, testConnection, fetchModels, loading
  } = useModelStore()

  const [activeSection, setActiveSection] = useState<SidebarKey>('models')
  const [aboutFlipped, setAboutFlipped] = useState(false)
  const [wechatCopied, setWechatCopied] = useState(false)
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'latest' | 'error' | 'downloading' | 'downloaded'>('idle')
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateError, setUpdateError] = useState('')
  const [updateVersion, setUpdateVersion] = useState('')
  const [appVersion, setAppVersion] = useState('')

  // 真实版本号:从主进程读取(跟随 package.json version,发布新版本自动更新显示)
  useEffect(() => {
    window.api.app.getVersion().then((v: string) => setAppVersion(v)).catch(() => {})
  }, [])
  // 网盘下载提示(链接硬编码于 MIRROR_DOWNLOAD_URL,不在界面中配置)
  const [mirrorMsg, setMirrorMsg] = useState('')
  // 网盘跳转确认弹窗
  const [mirrorConfirmOpen, setMirrorConfirmOpen] = useState(false)
  // 提取码复制反馈
  const [codeCopied, setCodeCopied] = useState(false)

  const handleCopyMirrorCode = async () => {
    try {
      await navigator.clipboard.writeText(MIRROR_DOWNLOAD_CODE)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {}
  }

  /** 点击网盘下载:弹窗确认(告知提取码)后浏览器跳转 */
  const handleOpenMirror = () => {
    if (!MIRROR_DOWNLOAD_URL) {
      setMirrorMsg('网盘链接待配置，请等待后续版本提供')
      setTimeout(() => setMirrorMsg(''), 3000)
      return
    }
    setMirrorConfirmOpen(true)
  }

  const handleConfirmMirror = async () => {
    setMirrorConfirmOpen(false)
    const res = await window.api.paths.openExternal(MIRROR_DOWNLOAD_URL)
    if (!res?.success) {
      setMirrorMsg(res?.error || '打开网盘链接失败')
      setTimeout(() => setMirrorMsg(''), 3000)
    }
  }

  const handleCopyWechat = async () => {
    try {
      await navigator.clipboard.writeText('lan89an89')
      setWechatCopied(true)
      setTimeout(() => setWechatCopied(false), 2000)
    } catch {}
  }

  // 监听主进程更新状态事件(检查/下载进度/下载完成等)
  useEffect(() => {
    const unsub = window.api.updater.onStatus((s: any) => {
      switch (s?.status) {
        case 'checking':
          setUpdateState('checking')
          break
        case 'available':
          setUpdateState('available')
          setUpdateVersion(s.payload?.version || '')
          break
        case 'not-available':
          setUpdateState('latest')
          setTimeout(() => setUpdateState('idle'), 3000)
          break
        case 'error':
          setUpdateState('error')
          setUpdateError(s.payload?.message || '更新出错')
          break
        case 'progress':
          setUpdateState('downloading')
          setUpdateProgress(s.payload?.percent || 0)
          break
        case 'downloaded':
          setUpdateState('downloaded')
          setUpdateVersion(s.payload?.version || '')
          break
      }
    })
    window.api.updater.getState().then((st: any) => {
      if (st) {
        setAppVersion(st.version || '')
        if (!st.isPackaged) {
          setUpdateError('开发模式不支持在线更新（打包安装后可正常检查）')
        }
      }
    }).catch(() => {})
    return unsub
  }, [])

  const handleCheckUpdate = async () => {
    if (updateState === 'checking' || updateState === 'downloading' || updateState === 'downloaded') return
    setUpdateError('')
    const res = await window.api.updater.check()
    if (!res?.success) {
      setUpdateState('error')
      setUpdateError(res?.error || '检查更新失败')
    }
    // 检查成功后的状态由主进程事件驱动
  }

  const handleDownloadUpdate = async () => {
    const res = await window.api.updater.download()
    if (!res?.success) {
      setUpdateState('error')
      setUpdateError(res?.error || '下载更新失败')
    }
    // 下载进度由主进程事件驱动
  }

  const handleQuitAndInstall = () => {
    window.api.updater.quitAndInstall()
  }
  const [showApiKey, setShowApiKey] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; latency: number } | null>(null)
  const [modelStep, setModelStep] = useState(1)
  const [hoveredVendor, setHoveredVendor] = useState<string | null>(null)
  // 厂商卡片 hover 延迟关闭:鼠标从卡片上移到弹窗(经过间隙)时弹窗不消失
  const vendorHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleVendorHoverEnter = (key: string) => {
    if (vendorHoverTimer.current) clearTimeout(vendorHoverTimer.current)
    setHoveredVendor(key)
  }

  const handleVendorHoverLeave = (key: string) => {
    if (vendorHoverTimer.current) clearTimeout(vendorHoverTimer.current)
    vendorHoverTimer.current = setTimeout(() => {
      setHoveredVendor((cur) => (cur === key ? null : cur))
    }, 200)
  }
  const [newConfig, setNewConfig] = useState({
    vendor: '' as VendorType | '',
    protocol: 'openai' as CustomProtocol,
    customUrl: '',
    apiKey: '',
    name: '',
    // 配置级高级选项(自定义厂商可用)
    orgId: '',
    timeout: '',
    headersText: ''
  })
  // 配置级高级选项校验错误(自定义请求头 JSON 解析失败时提示)
  const [headersError, setHeadersError] = useState('')
  // 正在编辑的配置(null = 新增模式)
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null)
  // 测试连接/获取模型失败时的具体错误信息
  const [connError, setConnError] = useState('')
  const [fetchError, setFetchError] = useState('')
  // 待删除确认的配置(null = 无)
  const [deleteTarget, setDeleteTarget] = useState<ModelConfig | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set())
  // 手动添加模型名输入
  const [manualModel, setManualModel] = useState('')
  // 模型级元数据编辑草稿(modelId -> 别名/能力/上下文/最大输出/备注)
  const [metaDrafts, setMetaDrafts] = useState<Record<string, ModelMeta>>({})
  // 展开"模型高级配置"的模型集合
  const [expandedMeta, setExpandedMeta] = useState<Set<string>>(new Set())
  const [pendingConfigId, setPendingConfigId] = useState<string | null>(null)
  // 供卸载清理使用的最新值(ref 避免闭包过期)
  const pendingConfigIdRef = useRef<string | null>(null)
  const editingConfigRef = useRef<ModelConfig | null>(null)
  useEffect(() => {
    pendingConfigIdRef.current = pendingConfigId
  }, [pendingConfigId])
  useEffect(() => {
    editingConfigRef.current = editingConfig
  }, [editingConfig])

  /** 更新某个模型的元数据草稿 */
  const updateMetaDraft = (modelId: string, patch: Partial<ModelMeta>) => {
    setMetaDrafts((prev) => ({
      ...prev,
      [modelId]: { ...prev[modelId], ...patch }
    }))
  }

  const toggleExpandMeta = (modelId: string) => {
    setExpandedMeta((prev) => {
      const next = new Set(prev)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

  const [paths, setPaths] = useState<Record<string, { current: string; default: string }>>({})
  const [pathsLoading, setPathsLoading] = useState(true)
  const [pathsPlatform, setPathsPlatform] = useState<'windows' | 'mac'>('windows')
  const [pathSaving, setPathSaving] = useState<string | null>(null)
  const [pathMessage, setPathMessage] = useState<{ key: string; type: 'success' | 'error'; text: string } | null>(null)
  const [savedPaths, setSavedPaths] = useState<Record<string, string>>({})
  const pathMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openLogViewer = useLogViewerStore((s) => s.openLogViewer)

  const [backupConfig, setBackupConfig] = useState({ enabled: false, time: '09:00', dir: '' })
  const [backupMsg, setBackupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadBackupConfig()
  }, [])

  const handleExportBackup = async () => {
    try {
      const result = await window.api.backup.export()
      if (result.canceled) return
      if (result.success) {
        setBackupMsg({ type: 'success', text: `已导出备份：${result.path}${result.counts?.images ? `（含 ${result.counts.images} 个项目图片文件夹）` : ''}` })
      } else {
        setBackupMsg({ type: 'error', text: `导出失败：${result.error || '未知错误'}` })
      }
    } catch (e: any) {
      setBackupMsg({ type: 'error', text: `导出失败：${e?.message || '未知错误'}` })
    }
  }

  const loadPaths = async () => {
    try {
      const result = await (window as any).api.paths.getAll()
      setPaths(result.paths)
      setPathsPlatform(result.platform)
      // 以数据库中的值作为“已保存”基线，重启后不会误显示为已修改
      setSavedPaths(Object.fromEntries(
        Object.entries(result.paths).map(([k, v]: [string, any]) => [k, v.current])
      ))
    } catch (e) {
      console.error('Failed to load paths:', e)
    } finally {
      setPathsLoading(false)
    }
  }

  const loadBackupConfig = async () => {
    try {
      const config = await window.api.backup.getConfig()
      setBackupConfig({ enabled: config.enabled, time: config.time || '09:00', dir: config.dir || '' })
    } catch {}
  }

  const handleImportBackup = async () => {
    try {
      const result = await window.api.backup.import()
      if (result.canceled) return
      if (result.success) {
        const c = result.counts || {}
        setBackupMsg({ type: 'success', text: `已还原：设置 ${c.settings ?? 0} 项、模型 ${c.modelConfigs ?? 0} 个、项目 ${c.projects ?? 0} 条${c.images ? `、图片文件夹 ${c.images} 个` : '（该备份不含项目图片）'}` })
        // 导入后刷新内存中的数据，使界面立即反映还原结果
        fetchConfigs()
        loadPaths()
        loadBackupConfig()
      } else {
        setBackupMsg({ type: 'error', text: `导入失败：${result.error || '未知错误'}` })
      }
    } catch (e: any) {
      setBackupMsg({ type: 'error', text: `导入失败：${e?.message || '未知错误'}` })
    }
  }

  const handleChooseBackupDir = async () => {
    try {
      const dir = await window.api.paths.selectDirectory('选择自动备份位置')
      if (dir) {
        setBackupConfig((c) => ({ ...c, dir }))
        await window.api.backup.setConfig({ dir })
      }
    } catch {}
  }

  const handleToggleBackup = async (enabled: boolean) => {
    setBackupConfig((c) => ({ ...c, enabled }))
    await window.api.backup.setConfig({ enabled })
  }

  const handleChangeBackupTime = async (time: string) => {
    setBackupConfig((c) => ({ ...c, time }))
    await window.api.backup.setConfig({ time })
  }

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  useEffect(() => {
    loadPaths()
  }, [])

  const handleBrowsePath = async (key: string) => {
    try {
      const selected = await (window as any).api.paths.selectDirectory(`选择${PATH_LABELS[key]}路径`)
      if (selected) {
        setPaths((prev) => ({
          ...prev,
          [key]: { ...prev[key], current: selected }
        }))
      }
    } catch (e) {
      console.error('Failed to select directory:', e)
    }
  }

  const handleSavePath = async (key: string) => {
    setPathSaving(key)
    setPathMessage(null)
    try {
      const result = await (window as any).api.paths.update(key, paths[key].current)
      setSavedPaths((prev) => ({ ...prev, [key]: paths[key].current }))
      if (result.moved > 0) {
        showPathMessage(key, 'success', `路径已更新，已迁移 ${result.moved} 个项目`)
      } else {
        showPathMessage(key, 'success', '路径已更新')
      }
    } catch (e) {
      showPathMessage(key, 'error', `更新失败: ${(e as Error).message}`)
    } finally {
      setPathSaving(null)
    }
  }

  const handleResetPath = async (key: string) => {
    setPathSaving(key)
    setPathMessage(null)
    try {
      const result = await (window as any).api.paths.resetToDefault(key)
      setPaths((prev) => ({
        ...prev,
        [key]: { ...prev[key], current: prev[key].default }
      }))
      // 恢复默认后，以默认值作为已保存基线
      setSavedPaths((prev) => ({ ...prev, [key]: paths[key].default }))
      if (result.moved > 0) {
        showPathMessage(key, 'success', `已恢复默认，已迁移 ${result.moved} 个项目`)
      } else {
        showPathMessage(key, 'success', '已恢复默认路径')
      }
    } catch (e) {
      showPathMessage(key, 'error', `恢复失败: ${(e as Error).message}`)
    } finally {
      setPathSaving(null)
    }
  }

  const showPathMessage = (key: string, type: 'success' | 'error', text: string) => {
    if (pathMessageTimer.current) clearTimeout(pathMessageTimer.current)
    setPathMessage({ key, type, text })
    pathMessageTimer.current = setTimeout(() => {
      setPathMessage(null)
      pathMessageTimer.current = null
    }, 2000)
  }

  const handleOpenPath = async (dirPath: string) => {
    try {
      await (window as any).api.paths.openDirectory(dirPath)
    } catch (e) {
      console.error('Failed to open directory:', e)
    }
  }

  /** 解析自定义请求头文本:合法 JSON 对象 -> 记录,否则返回 null(同时写入校验错误) */
  const parseHeadersText = (): Record<string, string> | null => {
    const text = newConfig.headersText.trim()
    if (!text) return {}
    try {
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setHeadersError('请求头需为 JSON 对象，例如 { "X-Api-Key": "xxx" }')
        return null
      }
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== 'string') {
          setHeadersError(`请求头 "${k}" 的值必须是字符串`)
          return null
        }
      }
      setHeadersError('')
      return parsed as Record<string, string>
    } catch {
      setHeadersError('JSON 格式错误，请检查引号与逗号')
      return null
    }
  }

  const ensurePendingConfig = async (): Promise<string> => {
    // 编辑模式:直接使用被编辑配置的 id,不创建新配置
    if (editingConfig) return editingConfig.id
    if (pendingConfigId) return pendingConfigId
    const isCustom = newConfig.vendor === 'custom'
    const headers = isCustom ? parseHeadersText() : {}
    if (headers === null) throw new Error('自定义请求头格式错误')
    const config = await addConfig({
      vendor: newConfig.vendor as VendorType,
      // 配置名称优先,缺省用厂商名(vendor_label 列即显示名)
      vendorLabel: newConfig.name || VENDOR_INFO[newConfig.vendor as VendorType]?.label || '',
      apiKey: newConfig.apiKey,
      baseUrl: isCustom ? newConfig.customUrl : VENDOR_INFO[newConfig.vendor as VendorType]?.defaultBaseUrl || '',
      protocol: isCustom ? newConfig.protocol : undefined,
      name: newConfig.name || VENDOR_INFO[newConfig.vendor as VendorType]?.label || '',
      // 仅自定义厂商保存高级选项
      ...(isCustom ? {
        orgId: newConfig.orgId.trim(),
        timeout: newConfig.timeout ? Math.max(0, parseInt(newConfig.timeout, 10) || 0) : 0,
        headers
      } : {}),
      models: [],
      defaultModel: '',
      isActive: false
    })
    setPendingConfigId(config.id)
    return config.id
  }

  /** 编辑模式下:把当前表单字段(不含模型/状态)先保存到被编辑配置,保证测试/获取用最新值 */
  const syncEditFields = async () => {
    if (!editingConfig) return
    const isCustom = newConfig.vendor === 'custom'
    const headers = isCustom ? parseHeadersText() : undefined
    if (headers === null) throw new Error('自定义请求头格式错误')
    await updateConfig(editingConfig.id, {
      vendor: newConfig.vendor as VendorType,
      vendorLabel: newConfig.name || VENDOR_INFO[newConfig.vendor as VendorType]?.label || '',
      apiKey: newConfig.apiKey,
      baseUrl: isCustom ? newConfig.customUrl : VENDOR_INFO[newConfig.vendor as VendorType]?.defaultBaseUrl || '',
      protocol: isCustom ? newConfig.protocol : undefined,
      name: newConfig.name || VENDOR_INFO[newConfig.vendor as VendorType]?.label || '',
      ...(isCustom ? {
        orgId: newConfig.orgId.trim(),
        timeout: newConfig.timeout ? Math.max(0, parseInt(newConfig.timeout, 10) || 0) : 0,
        headers
      } : {})
    })
  }

  const handleTestConnection = async () => {
    setTestResult(null)
    setConnError('')
    try {
      await syncEditFields()
      const configId = await ensurePendingConfig()
      const result = await testConnection(configId)
      if (!result.success && result.error) {
        setConnError(result.error)
      }
      setTestResult(result)
    } catch (e: any) {
      setTestResult({ success: false, latency: 0 })
      setConnError(e?.message || '未知错误')
      console.error(e)
    }
  }

  const handleFetchModels = async () => {
    setFetchError('')
    try {
      await syncEditFields()
      const configId = await ensurePendingConfig()
      // 编辑模式:不覆盖数据库已保存模型列表(最终以「保存修改」为准)
      const models = await fetchModels(configId, editingConfig ? { persist: false } : undefined)
      const modelList = (Array.isArray(models) ? models : []).map((m: any) => {
        if (typeof m === 'string') return { id: m, name: m }
        return m
      })
      if (modelList.length === 0) {
        setFetchError('未能获取模型列表（端点可能不支持 /models 接口），可点击下方「手动添加模型」直接输入模型名')
      }
      setAvailableModels((prev) => {
        // 编辑模式:保留原有模型(端点返回的列表可能不含已保存模型)
        const existing = editingConfig
          ? [...new Set([...prev.map((m) => m.id), ...modelList.map((m) => m.id)])]
            .map((id) => modelList.find((m) => m.id === id) || prev.find((m) => m.id === id) || { id, name: id })
          : modelList
        return existing
      })
      setSelectedModels((prev) => {
        // 编辑模式:保留原有勾选;新增模式:默认不自动全选,由用户手动勾选需要的模型
        return new Set(editingConfig ? prev : [])
      })
      // 自动回填模型元数据草稿:端点返回的 contextWindow 直接带入(不覆盖已填的别名/能力/备注)
      setMetaDrafts((prev) => {
        const drafts: Record<string, ModelMeta> = { ...prev }
        for (const m of modelList) {
          drafts[m.id] = {
            ...(prev[m.id] || {}),
            contextWindow: m.contextWindow ? Number(m.contextWindow) : (prev[m.id]?.contextWindow ?? undefined)
          }
        }
        return drafts
      })
    } catch (e: any) {
      setFetchError(e?.message || '获取模型列表失败，可点击下方「手动添加模型」直接输入模型名')
      console.error(e)
    }
  }

  /** 手动添加模型:输入模型名加入列表并勾选(中转站无 /models 接口时的兜底) */
  const handleManualAddModel = () => {
    const name = manualModel.trim()
    if (!name) return
    if (!availableModels.some((m) => m.id === name)) {
      setAvailableModels((prev) => [...prev, { id: name, name }])
    }
    setSelectedModels((prev) => {
      const next = new Set(prev)
      next.add(name)
      return next
    })
    setManualModel('')
  }

  /** 打开编辑模式:预填全部字段并加载已有模型 */
  const startEdit = (config: ModelConfig) => {
    setEditingConfig(config)
    setNewConfig({
      vendor: config.vendor,
      protocol: (config.protocol || 'openai') as CustomProtocol,
      customUrl: config.baseUrl || '',
      apiKey: config.apiKey,
      name: config.name || '',
      orgId: config.orgId || '',
      timeout: config.timeout ? String(config.timeout) : '',
      headersText: config.headers && Object.keys(config.headers).length > 0 ? JSON.stringify(config.headers, null, 2) : ''
    })
    setHeadersError('')
    setConnError('')
    setFetchError('')
    setTestResult(null)
    setModelStep(1)
    // 加载已有模型到列表与草稿
    const modelList = config.models.map((m) => ({ id: m, name: m }))
    setAvailableModels(modelList)
    setSelectedModels(new Set(config.models))
    const drafts: Record<string, ModelMeta> = {}
    for (const [mid, meta] of Object.entries((config as any).modelMeta || {})) {
      drafts[mid] = { ...(meta as ModelMeta) }
    }
    setMetaDrafts(drafts)
    setExpandedMeta(new Set())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** 取消编辑/新增:清理临时状态;编辑模式不删除被编辑配置;keepPending=true 表示保存成功后调用,保留已保存配置 */
  const cancelFlow = (keepPending = false) => {
    if (!keepPending && !editingConfig && pendingConfigId) {
      deleteConfig(pendingConfigId)
    }
    setPendingConfigId(null)
    setEditingConfig(null)
    setNewConfig({ vendor: '', customUrl: '', apiKey: '', name: '', protocol: 'openai', orgId: '', timeout: '', headersText: '' })
    setHeadersError('')
    setConnError('')
    setFetchError('')
    setModelStep(1)
    setAvailableModels([])
    setSelectedModels(new Set())
    setMetaDrafts({})
    setExpandedMeta(new Set())
    setTestResult(null)
    setManualModel('')
  }

  // 离开设置页时清理未完成的临时配置(新增流程中途退出产生的孤儿配置)
  useEffect(() => {
    return () => {
      // 使用 ref 读取最新 pendingConfigId,避免闭包捕获过期值
      if (pendingConfigIdRef.current && !editingConfigRef.current) {
        deleteConfig(pendingConfigIdRef.current).catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAddConfig = async () => {
    const targetId = editingConfig ? editingConfig.id : pendingConfigId
    if (!targetId) return
    try {
      const isCustom = newConfig.vendor === 'custom'
      const headers = isCustom ? parseHeadersText() : undefined
      if (headers === null) return
      // 仅自定义厂商保存模型级元数据(能力标注/别名/上下文/最大输出/备注)
      let modelMeta: Record<string, ModelMeta> | undefined
      if (isCustom) {
        modelMeta = {}
        for (const [mid, meta] of Object.entries(metaDrafts)) {
          const cleaned: ModelMeta = {
            alias: meta.alias?.trim() || undefined,
            capability: meta.capability && meta.capability !== 'auto' ? meta.capability : undefined,
            contextWindow: meta.contextWindow && meta.contextWindow > 0 ? meta.contextWindow : undefined,
            maxOutput: meta.maxOutput && meta.maxOutput > 0 ? meta.maxOutput : undefined,
            note: meta.note?.trim() || undefined
          }
          if (Object.values(cleaned).some((v) => v !== undefined)) {
            modelMeta[mid] = cleaned
          }
        }
      }
      await updateConfig(targetId, {
        vendor: newConfig.vendor as VendorType,
        // 配置名称优先,缺省用厂商名
        vendorLabel: newConfig.name || VENDOR_INFO[newConfig.vendor as VendorType]?.label || '',
        apiKey: newConfig.apiKey,
        baseUrl: isCustom ? newConfig.customUrl : VENDOR_INFO[newConfig.vendor as VendorType]?.defaultBaseUrl || '',
        protocol: isCustom ? newConfig.protocol : undefined,
        name: newConfig.name || VENDOR_INFO[newConfig.vendor as VendorType]?.label || '',
        models: [...selectedModels],
        defaultModel: [...selectedModels][0] || '',
        status: 'connected',
        // 仅自定义厂商保存高级选项与模型元数据
        ...(isCustom ? {
          orgId: newConfig.orgId.trim(),
          timeout: newConfig.timeout ? Math.max(0, parseInt(newConfig.timeout, 10) || 0) : 0,
          headers,
          modelMeta
        } : {})
      })
      cancelFlow(true)
      fetchConfigs()
    } catch (e) {
      console.error(e)
    }
  }

  const maskKey = (key: string) => {
    if (key.length <= 8) return '****'
    return key.slice(0, 4) + '****' + key.slice(-4)
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
      <div style={{
        width: '200px',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)',
        padding: '20px 12px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 8px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '12px'
        }}>
          <Settings2 size={18} style={{ color: 'var(--brand)' }} />
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--fg)' }}>设置</span>
        </div>
        {sidebarItems.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.key
          return (
            <button
              key={item.key}
              onClick={() => setActiveSection(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '10px 12px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                background: isActive ? 'var(--brand-glow)' : 'transparent',
                color: isActive ? 'var(--brand)' : 'var(--fg-muted)',
                fontWeight: isActive ? 600 : 400,
                fontSize: '13px',
                marginBottom: '2px',
                transition: 'all 0.15s',
                boxShadow: isActive ? '0 0 12px var(--brand-glow)' : 'none'
              }}
            >
              <Icon size={16} />
              {item.label}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {activeSection === 'models' && (
          <div>
            {/* 标题行:左侧标题,右侧模型选择推荐卡片 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--fg)', margin: '0 0 4px 0' }}>
                  模型管理
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: '0' }}>
                  管理 AI 模型配置、测试连接和选择可用模型
                </p>
              </div>
              {/* 模型选择推荐卡片:点击查看选择指南 */}
              <div className="rec-card" onClick={() => setGuideOpen(true)} title="查看模型选择指南" style={{ cursor: 'pointer' }}>
              <svg
                viewBox="0 0 200 200"
                xmlns="http://www.w3.org/2000/svg"
                className="rec-blob"
                style={{ width: '100%', height: '100%' }}
              >
                <path
                  fill="var(--brand)"
                  opacity="0.25"
                  transform="translate(100 100)"
                  d="M39.5,-49.6C54.8,-43.2,73.2,-36.5,78.2,-24.6C83.2,-12.7,74.8,4.4,69,22.5C63.3,40.6,60.2,59.6,49.1,64.8C38.1,70,19,61.5,0.6,60.7C-17.9,59.9,-35.9,67,-47.2,61.9C-58.6,56.7,-63.4,39.5,-70,22.1C-76.6,4.7,-84.9,-12.8,-81.9,-28.1C-79,-43.3,-64.6,-56.3,-49.1,-62.5C-33.6,-68.8,-16.8,-68.3,-2.3,-65.1C12.1,-61.9,24.2,-55.9,39.5,-49.6Z"
                />
              </svg>
              <div className="rec-content">
                <p className="rec-label">模型选择推荐</p>
                <span className="rec-tip">点击查看指南</span>
              </div>
            </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              marginBottom: '24px'
            }}>
              {[
                { label: '已配置', value: modelConfigs.filter(c => c.status === 'connected' && c.models.length > 0).length, color: 'var(--brand)' },
                { label: '可用', value: modelConfigs.filter((c) => c.status === 'connected' && c.models.length > 0).length, color: '#16a34a' },
                { label: '厂商', value: new Set(modelConfigs.filter(c => c.status === 'connected' && c.models.length > 0).map((c) => c.vendor)).size, color: '#6366f1' },
                { label: '可用模型', value: modelConfigs.filter(c => c.status === 'connected').reduce((a, c) => a + c.models.length, 0), color: '#f59e0b' }
              ].map((stat) => (
                <div key={stat.label} style={{
                  background: 'var(--bg-muted)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  textAlign: 'center'
                }}>
                  <p style={{
                    fontSize: '24px',
                    fontWeight: 700,
                    color: stat.color,
                    margin: '0 0 2px 0'
                  }}>
                    {stat.value}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: 0 }}>
                    {stat.label}
                  </p>
                </div>
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
                gap: '10px',
                marginBottom: '16px'
              }}>
                {editingConfig ? (
                  <Pencil size={16} style={{ color: 'var(--brand)' }} />
                ) : (
                  <Plus size={16} style={{ color: 'var(--brand)' }} />
                )}
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg)' }}>
                  {editingConfig ? `编辑模型配置 · ${editingConfig.name || '未命名'}` : '添加模型配置'}
                </span>
                {editingConfig && (
                  <button
                    onClick={cancelFlow}
                    style={{
                      marginLeft: 'auto',
                      fontSize: '11px',
                      padding: '4px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--bg-muted)',
                      color: 'var(--fg-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    取消编辑
                  </button>
                )}
                <div style={{ display: 'flex', gap: '4px', marginLeft: editingConfig ? '0' : 'auto' }}>
                  {[1, 2, 3].map((s) => (
                    <div key={s} style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: modelStep >= s ? 'var(--brand)' : 'var(--border)',
                      transition: 'background 0.2s'
                    }} />
                  ))}
                </div>
              </div>

              {modelStep === 1 && (
                <div>
                  <label style={sectionLabel}>选择厂商{editingConfig ? '（编辑模式不可修改）' : ''}</label>
                  {/* 厂商卡片选择(点击卡片后配置,主题色配色;编辑模式锁定) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {Object.entries(VENDOR_INFO).map(([key, info]) => {
                            const vendorKey = key as VendorType
                            const active = newConfig.vendor === vendorKey
                            const hovered = hoveredVendor === vendorKey
                            return (
                              <div
                                key={key}
                                onClick={() => {
                                  if (editingConfig) return
                                  setNewConfig((c) => ({ ...c, vendor: vendorKey }))
                                }}
                                onMouseEnter={() => handleVendorHoverEnter(vendorKey)}
                                onMouseLeave={() => handleVendorHoverLeave(vendorKey)}
                                style={{
                                  width: '100%',
                                  maxWidth: '290px',
                                  height: '70px',
                                  background: active ? 'var(--brand-glow)' : 'var(--bg-muted)',
                                  border: active ? '2px solid var(--brand)' : '1px solid var(--border-subtle)',
                                  borderRadius: '20px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-start',
                                  transition: '0.3s ease-in-out',
                                  cursor: editingConfig ? 'default' : 'pointer',
                                  transform: hovered && !editingConfig ? 'scale(1.05)' : 'scale(1)',
                                  position: 'relative',
                                  boxSizing: 'border-box',
                                  overflow: 'visible',
                                  opacity: editingConfig && !active ? 0.45 : 1,
                                  zIndex: hovered ? 20 : 1
                                }}
                              >
                                {/* logo 块(白底 + 主题色细边框,无 hover 变色) */}
                                <div style={{
                                  width: '48px',
                                  height: '48px',
                                  marginLeft: '10px',
                                  borderRadius: '12px',
                                  background: '#ffffff',
                                  border: '1px solid var(--brand)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  {VENDOR_LOGOS[vendorKey] ? (
                                    <img
                                      src={VENDOR_LOGOS[vendorKey]}
                                      alt={info.label}
                                      style={{ height: '28px', maxWidth: '32px', objectFit: 'contain' }}
                                    />
                                  ) : (
                                    (() => {
                                      const Icon = vendorKey === 'custom' ? Plus : Sparkles
                                      return <Icon size={24} style={{ color: 'var(--brand)' }} />
                                    })()
                                  )}
                                </div>
                                {/* 文本区 */}
                                <div style={{ width: 'calc(100% - 90px)', marginLeft: '10px', minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                    <span style={{
                                      fontSize: '14px',
                                      fontWeight: 700,
                                      color: 'var(--fg)',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}>
                                      {info.label}
                                    </span>
                                  </div>
                                  <p style={{
                                    margin: '2px 0 0',
                                    fontSize: '11px',
                                    color: 'var(--fg-muted)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    {['openrouter', 'siliconflow', 'ofox', 'aihubmix'].includes(vendorKey) ? '聚合接入' : (vendorKey === 'custom' ? '自定义接入' : '官方 API 接入')}
                                  </p>
                                </div>
                                {/* Ofox 悬浮推广弹窗:点击跳转注册(无二维码) */}
                                {hovered && vendorKey === 'ofox' && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      // 点击跳转后关闭弹窗(鼠标离开卡片也不会再弹)
                                      if (vendorHoverTimer.current) clearTimeout(vendorHoverTimer.current)
                                      setHoveredVendor(null)
                                      window.api.paths.openExternal(OFOX_REFERRAL_URL)
                                    }}
                                    onMouseEnter={() => handleVendorHoverEnter(vendorKey)}
                                    onMouseLeave={() => handleVendorHoverLeave(vendorKey)}
                                    className="anim-popup"
                                    style={{
                                      position: 'absolute',
                                      bottom: 'calc(100% + 10px)',
                                      left: 0,
                                      zIndex: 400,
                                      width: '230px',
                                      background: '#fff',
                                      borderRadius: '14px',
                                      boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
                                      padding: '12px',
                                      cursor: 'pointer',
                                      border: '1px solid rgba(0,0,0,0.06)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                      <img src={VENDOR_LOGOS.ofox} alt="Ofox" style={{ height: '16px' }} />
                                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#2c2c2c' }}>OfvoxAI</span>
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#2c2c2c' }}>
                                      3分钟，接入世界模型
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666', margin: '2px 0 8px' }}>
                                      官方渠道 稳定高速不限流
                                    </div>
                                    <div style={{
                                      background: '#fdf3e7',
                                      borderRadius: '10px',
                                      padding: '8px 10px',
                                      marginBottom: '8px'
                                    }}>
                                      <div style={{ fontSize: '11px', color: '#8a5a2b' }}>首充 $10 即得</div>
                                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#f97316' }}>
                                        $1.00 <span style={{ fontSize: '11px', fontWeight: 500 }}>赠送 Credits</span>
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#a08a6e', marginTop: '2px' }}>
                                        有效期至 2026年9月1日
                                      </div>
                                    </div>
                                    <div style={{
                                      background: '#2c2c2c',
                                      color: '#fff',
                                      textAlign: 'center',
                                      borderRadius: '8px',
                                      padding: '7px',
                                      fontSize: '12px',
                                      fontWeight: 600
                                    }}>
                                      点击前往注册 →
                                    </div>
                                  </div>
                                )}
                                {/* MiMo 悬浮推广弹窗:点击跳转注册 */}
                                {hovered && vendorKey === 'mimo' && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      // 点击跳转后关闭弹窗(鼠标离开卡片也不会再弹)
                                      if (vendorHoverTimer.current) clearTimeout(vendorHoverTimer.current)
                                      setHoveredVendor(null)
                                      window.api.paths.openExternal(MIMO_REFERRAL_URL)
                                    }}
                                    onMouseEnter={() => handleVendorHoverEnter(vendorKey)}
                                    onMouseLeave={() => handleVendorHoverLeave(vendorKey)}
                                    className="anim-popup"
                                    style={{
                                      position: 'absolute',
                                      bottom: 'calc(100% + 10px)',
                                      left: 0,
                                      zIndex: 400,
                                      width: '230px',
                                      background: '#fff',
                                      borderRadius: '14px',
                                      boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
                                      padding: '12px',
                                      cursor: 'pointer',
                                      border: '1px solid rgba(0,0,0,0.06)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                      <img src={VENDOR_LOGOS.mimo} alt="MiMo" style={{ height: '16px' }} />
                                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#2c2c2c' }}>MiMo 开放平台</span>
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#2c2c2c' }}>
                                      体验小米顶尖模型 MiMo V2.5 等
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666', margin: '2px 0 8px' }}>
                                      通过邀请码注册，双方各得体验金
                                    </div>
                                    <div style={{
                                      background: '#fdf3e7',
                                      borderRadius: '10px',
                                      padding: '8px 10px',
                                      marginBottom: '8px'
                                    }}>
                                      <div style={{ fontSize: '11px', color: '#8a5a2b' }}>邀请码</div>
                                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#f97316', fontFamily: 'var(--font-mono)' }}>
                                        6Q7WYQ
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#a08a6e', marginTop: '2px' }}>
                                        双方各得 ¥10 API 体验金 + 首单 9 折 · 体验金 40 天有效
                                      </div>
                                    </div>
                                    <div style={{
                                      background: '#2c2c2c',
                                      color: '#fff',
                                      textAlign: 'center',
                                      borderRadius: '8px',
                                      padding: '7px',
                                      fontSize: '12px',
                                      fontWeight: 600
                                    }}>
                                      点击前往注册 →
                                    </div>
                                  </div>
                                )}
                                {/* SiliconFlow 悬浮推广弹窗:点击跳转注册 */}
                                {hovered && vendorKey === 'siliconflow' && (
                                  <div
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      // 点击跳转后关闭弹窗(鼠标离开卡片也不会再弹)
                                      if (vendorHoverTimer.current) clearTimeout(vendorHoverTimer.current)
                                      setHoveredVendor(null)
                                      window.api.paths.openExternal(SILICONFLOW_REFERRAL_URL)
                                    }}
                                    onMouseEnter={() => handleVendorHoverEnter(vendorKey)}
                                    onMouseLeave={() => handleVendorHoverLeave(vendorKey)}
                                    className="anim-popup"
                                    style={{
                                      position: 'absolute',
                                      bottom: 'calc(100% + 10px)',
                                      left: 0,
                                      zIndex: 400,
                                      width: '230px',
                                      background: '#fff',
                                      borderRadius: '14px',
                                      boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
                                      padding: '12px',
                                      cursor: 'pointer',
                                      border: '1px solid rgba(0,0,0,0.06)'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                      <img src={VENDOR_LOGOS.siliconflow} alt="SiliconFlow" style={{ height: '16px' }} />
                                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#2c2c2c' }}>硅基流动推荐官</span>
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#2c2c2c' }}>
                                      邀请好友，赚取 ¥16 奖励券
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#666', margin: '2px 0 8px' }}>
                                      完成实名认证的用户均可作为「推荐官」邀请新用户
                                    </div>
                                    <div style={{
                                      background: '#fdf3e7',
                                      borderRadius: '10px',
                                      padding: '8px 10px',
                                      marginBottom: '8px'
                                    }}>
                                      <div style={{ fontSize: '11px', color: '#8a5a2b' }}>每成功邀请 1 名新用户（注册并实名认证）</div>
                                      <div style={{ fontSize: '20px', fontWeight: 800, color: '#f97316' }}>
                                        ¥16 <span style={{ fontSize: '11px', fontWeight: 500 }}>推荐官奖励券</span>
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#a08a6e', marginTop: '2px' }}>
                                        邀请人数与奖励次数活动期内不设上限
                                      </div>
                                    </div>
                                    <div style={{
                                      background: '#2c2c2c',
                                      color: '#fff',
                                      textAlign: 'center',
                                      borderRadius: '8px',
                                      padding: '7px',
                                      fontSize: '12px',
                                      fontWeight: 600
                                    }}>
                                      点击前往注册 →
                                    </div>
                                  </div>
                                )}
                    </div>
                    )
                  })}
                  </div>
                  {newConfig.vendor === 'custom' && (
                    /* 自定义接入配置面板(仅自定义厂商显示,其他厂商保持简单流程) */
                    <div style={{
                      marginTop: '14px',
                      background: 'var(--bg-muted)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                        <Sliders size={13} style={{ color: 'var(--brand)' }} />
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--fg-secondary)' }}>
                          自定义接入配置
                        </span>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ ...sectionLabel, marginBottom: '4px', fontSize: '11px' }}>接入协议</label>
                        <Select
                          value={newConfig.protocol}
                          onChange={(v) => {
                            const protocol = v as CustomProtocol
                            setNewConfig((c) => ({
                              ...c,
                              protocol,
                              // 切换协议时自动填充该协议的默认接入地址
                              customUrl: PROTOCOL_INFO[protocol].defaultBaseUrl
                            }))
                          }}
                          options={(Object.keys(PROTOCOL_INFO) as CustomProtocol[]).map((p) => ({
                            value: p,
                            label: PROTOCOL_INFO[p].label
                          }))}
                        />
                        <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--fg-muted)' }}>
                          {PROTOCOL_INFO[newConfig.protocol].hint}
                        </p>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ ...sectionLabel, marginBottom: '4px', fontSize: '11px' }}>Base URL</label>
                        <input
                          type="text"
                          value={newConfig.customUrl}
                          onChange={(e) => setNewConfig((c) => ({ ...c, customUrl: e.target.value }))}
                          placeholder="https://your-api-endpoint.com/v1"
                          style={inputStyle}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ ...sectionLabel, marginBottom: '4px', fontSize: '11px' }}>组织 ID（Organization）</label>
                          <input
                            type="text"
                            value={newConfig.orgId}
                            onChange={(e) => setNewConfig((c) => ({ ...c, orgId: e.target.value }))}
                            placeholder="org-xxx（可选）"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          <label style={{ ...sectionLabel, marginBottom: '4px', fontSize: '11px' }}>请求超时（秒）</label>
                          <input
                            type="number"
                            min={0}
                            value={newConfig.timeout}
                            onChange={(e) => setNewConfig((c) => ({ ...c, timeout: e.target.value }))}
                            placeholder="留空 = SDK 默认"
                            style={inputStyle}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ ...sectionLabel, marginBottom: '4px', fontSize: '11px' }}>自定义请求头（JSON）</label>
                        <textarea
                          value={newConfig.headersText}
                          onChange={(e) => setNewConfig((c) => ({ ...c, headersText: e.target.value }))}
                          placeholder={'{\n  "X-Api-Key": "your-key",\n  "X-Custom-Header": "value"\n}'}
                          rows={3}
                          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.5' }}
                        />
                        {headersError && (
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#dc2626' }}>
                            {headersError}
                          </p>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--fg-muted)' }}>
                          按 JSON 键值对附加到每次请求，用于中转站/网关额外鉴权
                        </p>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: '12px' }}>
                    <label style={sectionLabel}>配置名称（可选）</label>
                    <input
                      type="text"
                      value={newConfig.name}
                      onChange={(e) => setNewConfig((c) => ({ ...c, name: e.target.value }))}
                      placeholder="My API Config"
                      style={inputStyle}
                    />
                  </div>

                  <Button
                    variant="primary"
                    onClick={() => {
                      // 仅自定义厂商进入下一步前校验:Base URL 必填 + 请求头 JSON 合法
                      if (newConfig.vendor === 'custom') {
                        if (!newConfig.customUrl.trim()) {
                          setHeadersError('请输入 Base URL（接入地址不能为空）')
                          return
                        }
                        if (parseHeadersText() === null) return
                      }
                      setModelStep(2)
                      if (!editingConfig) setPendingConfigId(null)
                    }}
                    disabled={!newConfig.vendor}
                    style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    下一步
                    <ChevronRight size={14} />
                  </Button>
                </div>
              )}

              {modelStep === 2 && (
                <div>
                  <label style={sectionLabel}>API Key</label>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={newConfig.apiKey}
                        onChange={(e) => setNewConfig((c) => ({ ...c, apiKey: e.target.value }))}
                        placeholder="sk-..."
                        style={{ ...inputStyle, paddingRight: '40px' }}
                      />
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--fg-muted)',
                          padding: '4px'
                        }}
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={handleTestConnection}
                      disabled={!newConfig.apiKey || loading}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <TestTube size={14} />
                      测试连接
                    </Button>
                  </div>
                  {testResult !== null && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: testResult.success ? '#dcfce7' : '#fee2e2',
                      marginBottom: '12px'
                    }}>
                      <Check size={14} style={{ color: testResult.success ? '#166534' : '#991b1b' }} />
                      <span style={{
                        fontSize: '12px',
                        color: testResult.success ? '#166534' : '#991b1b',
                        fontWeight: 500
                      }}>
                        {testResult.success
                          ? `连接成功！延迟 ${testResult.latency}ms`
                          : '连接失败'}
                      </span>
                    </div>
                  )}
                  {connError && (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: '#fee2e2',
                      marginBottom: '12px',
                      fontSize: '12px',
                      color: '#991b1b',
                      fontFamily: 'var(--font-mono)',
                      wordBreak: 'break-all',
                      lineHeight: '1.5'
                    }}>
                      {connError}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={() => {
                      // 编辑模式回退不删除被编辑配置
                      if (!editingConfig && pendingConfigId) {
                        deleteConfig(pendingConfigId)
                        setPendingConfigId(null)
                      }
                      setModelStep(1)
                      setTestResult(null)
                      setConnError('')
                    }}>
                      上一步
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => { setModelStep(3); handleFetchModels() }}
                      disabled={!newConfig.apiKey}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <RefreshCw size={14} />
                      获取模型列表
                    </Button>
                  </div>
                </div>
              )}

              {modelStep === 3 && (
                <div>
                  <label style={sectionLabel}>选择可用模型</label>
                  {newConfig.vendor === 'custom' ? (
                    <p style={{ margin: '-4px 0 10px', fontSize: '12px', color: 'var(--fg-muted)' }}>
                      勾选要启用的模型；可为每个模型标注「能力」并配置高级参数，标注将优先于自动识别
                    </p>
                  ) : (
                    <p style={{ margin: '-4px 0 10px', fontSize: '12px', color: 'var(--fg-muted)' }}>
                      勾选要启用的模型，完成配置
                    </p>
                  )}
                  {availableModels.length > 0 ? (
                    <div style={{
                      maxHeight: newConfig.vendor === 'custom' ? '320px' : '200px',
                      overflow: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px',
                      marginBottom: '14px'
                    }}>
                      {availableModels.map((model) => {
                        // 非自定义厂商:保持原始简单勾选列表(无能力标注/高级配置)
                        if (newConfig.vendor !== 'custom') {
                          return (
                            <label
                              key={model.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-muted)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <Checkbox
                                checked={selectedModels.has(model.id)}
                                onChange={() => {
                                  setSelectedModels((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(model.id)) next.delete(model.id)
                                    else next.add(model.id)
                                    return next
                                  })
                                }}
                              />
                              <div>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg)' }}>
                                  {model.name}
                                </span>
                                {model.description && (
                                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)', marginLeft: '8px' }}>
                                    {model.description}
                                  </span>
                                )}
                              </div>
                            </label>
                          )
                        }
                        // 自定义厂商:带能力标注与高级配置的完整列表
                        const meta = metaDrafts[model.id] || {}
                        const isExpanded = expandedMeta.has(model.id)
                        return (
                          <div
                            key={model.id}
                            style={{
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-md)',
                              marginBottom: '8px',
                              overflow: 'hidden'
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 10px',
                                cursor: 'pointer',
                                transition: 'background 0.15s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-muted)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              onClick={() => {
                                setSelectedModels((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(model.id)) next.delete(model.id)
                                  else next.add(model.id)
                                  return next
                                })
                              }}
                            >
                              <Checkbox
                                checked={selectedModels.has(model.id)}
                                onChange={() => {
                                  setSelectedModels((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(model.id)) next.delete(model.id)
                                    else next.add(model.id)
                                    return next
                                  })
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg)' }}>
                                    {model.name}
                                  </span>
                                  {model.contextWindow ? (
                                    <span style={{
                                      fontSize: '10px',
                                      padding: '1px 6px',
                                      borderRadius: 'var(--radius-full)',
                                      background: 'var(--brand-glow)',
                                      color: 'var(--brand)',
                                      whiteSpace: 'nowrap'
                                    }}>
                                      上下文 {(model.contextWindow / 1000).toFixed(0)}k
                                    </span>
                                  ) : null}
                                </div>
                                {model.description && (
                                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>
                                    {model.description}
                                  </span>
                                )}
                              </div>
                              {/* 模型能力标注 */}
                              <div style={{ width: '120px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                <Select
                                  value={meta.capability || 'auto'}
                                  onChange={(v) => updateMetaDraft(model.id, { capability: v as ModelCapability })}
                                  options={(Object.keys(CAPABILITY_LABELS) as ModelCapability[]).map((c) => ({
                                    value: c,
                                    label: CAPABILITY_LABELS[c]
                                  }))}
                                />
                              </div>
                              {/* 展开高级配置 */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleExpandMeta(model.id)
                                }}
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: 'var(--fg-muted)',
                                  transition: 'transform 0.2s',
                                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)'
                                }}
                                title="模型高级配置"
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>
                            {/* 模型高级配置(别名/上下文/最大输出/备注) */}
                            {isExpanded && (
                              <div style={{
                                padding: '10px 12px',
                                background: 'var(--bg-muted)',
                                borderTop: '1px solid var(--border-subtle)',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '8px'
                              }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: '4px' }}>
                                    显示别名（可选）
                                  </label>
                                  <input
                                    type="text"
                                    value={meta.alias || ''}
                                    onChange={(e) => updateMetaDraft(model.id, { alias: e.target.value })}
                                    placeholder="如：主力生图模型"
                                    style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: '4px' }}>
                                    上下文窗口（tokens）
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={meta.contextWindow ?? ''}
                                    onChange={(e) => updateMetaDraft(model.id, { contextWindow: e.target.value ? Number(e.target.value) : undefined })}
                                    placeholder={model.contextWindow ? String(model.contextWindow) : '自动'}
                                    style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: '4px' }}>
                                    最大输出（tokens）
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={meta.maxOutput ?? ''}
                                    onChange={(e) => updateMetaDraft(model.id, { maxOutput: e.target.value ? Number(e.target.value) : undefined })}
                                    placeholder="默认 4000"
                                    style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                                  />
                                </div>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--fg-secondary)', marginBottom: '4px' }}>
                                    备注（可选）
                                  </label>
                                  <input
                                    type="text"
                                    value={meta.note || ''}
                                    onChange={(e) => updateMetaDraft(model.id, { note: e.target.value })}
                                    placeholder="记录用途/限制"
                                    style={{ ...inputStyle, fontSize: '12px', padding: '6px 10px' }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: 'var(--fg-muted)',
                      fontSize: '13px',
                      background: 'var(--bg-muted)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '14px'
                    }}>
                      {loading ? '正在获取模型列表...' : '暂无可用模型'}
                    </div>
                  )}
                  {fetchError && (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: '#fef3c7',
                      color: '#92400e',
                      fontSize: '12px',
                      marginBottom: '10px',
                      lineHeight: '1.5',
                      wordBreak: 'break-all'
                    }}>
                      {fetchError}
                    </div>
                  )}
                  {/* 手动添加模型(中转站无 /models 接口时的兜底) */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <input
                      type="text"
                      value={manualModel}
                      onChange={(e) => setManualModel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleManualAddModel()
                        }
                      }}
                      placeholder="手动输入模型名（如 gpt-4o / flux-1.1-pro）"
                      style={inputStyle}
                    />
                    <Button
                      variant="secondary"
                      onClick={handleManualAddModel}
                      disabled={!manualModel.trim()}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                      <Plus size={14} />
                      添加
                    </Button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Button variant="ghost" onClick={() => {
                      // 编辑模式回退不删除被编辑配置
                      if (!editingConfig && pendingConfigId) {
                        deleteConfig(pendingConfigId)
                        setPendingConfigId(null)
                      }
                      setModelStep(1)
                      setAvailableModels([])
                      setSelectedModels(new Set())
                      setMetaDrafts({})
                      setExpandedMeta(new Set())
                      setFetchError('')
                    }}>
                      上一步
                    </Button>
                    <Button
                      variant="primary"
                      onClick={handleAddConfig}
                      disabled={selectedModels.size === 0 || loading}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Plus size={14} />
                      {editingConfig ? '保存修改' : '添加已选模型'} ({selectedModels.size})
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <h3 style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--fg)',
                margin: '0 0 12px 0'
              }}>
                已配置模型
              </h3>
              {modelConfigs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {modelConfigs.map((config) => (
                    <ModelConfigCard
                      key={config.id}
                      config={config}
                      onDelete={() => setDeleteTarget(config)}
                      onEdit={() => startEdit(config)}
                      testConnection={testConnection}
                      maskKey={maskKey}
                    />
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '32px',
                  textAlign: 'center',
                  background: 'var(--bg-muted)',
                  borderRadius: 'var(--radius-lg)',
                  color: 'var(--fg-muted)',
                  fontSize: '13px'
                }}>
                  <Cpu size={32} style={{ marginBottom: '8px', opacity: 0.4 }} />
                  <p style={{ margin: 0 }}>尚未配置任何模型，点击上方添加</p>
                </div>
              )}
            </div>
          </div>
        )}

                {/* 模型选择指南弹窗 */}
        <Modal
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          title="模型选择指南"
        >
          <div style={{ fontSize: '13px', lineHeight: 1.9, color: 'var(--fg)' }}>
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontWeight: 700, margin: '0 0 6px 0', color: 'var(--brand)' }}>文案模型（分析商品图 + 撰写文案）怎么选</p>
              <p style={{ margin: '0 0 4px 0' }}>· 文案任务需要识别商品图片，必须选支持视觉理解的多模态模型：GPT-4o、Gemini、通义千问 VL（qwen-vl）、GLM-4V、Kimi、MiniMax 等。</p>
              <p style={{ margin: '0 0 4px 0' }}>· 纯文本模型（如部分 DeepSeek 版本）无法识图，只能做纯文字创作，不适合本工作台的商品文案任务。</p>
              <p style={{ margin: '0' }}>· 文案模型还承担「产品分析」：分析出的产品特征描述会用于所有后续生成，选上下文窗口大、输出上限高的模型，特征还原更准确。</p>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <p style={{ fontWeight: 700, margin: '0 0 6px 0', color: 'var(--brand)' }}>生图模型（基于商品图生成新图）怎么选</p>
              <p style={{ margin: '0 0 4px 0' }}>· 需要图生图（以商品参考图为基础生成），必须选支持图生图 / 图像编辑的模型：qwen-image-edit、Seedream、gpt-image、Gemini 图像等。</p>
              <p style={{ margin: '0 0 4px 0' }}>· 编辑模式模型（Gemini 图像 / gpt-image）：带参考图时输出尺寸跟随参考图，参考图比例与所选尺寸不一致时会提示裁剪；建议先用「图片编辑」把参考图裁剪成目标比例再生成。</p>
              <p style={{ margin: '0 0 4px 0' }}>· 纯文生图模型（不支持参考图）无法保持商品一致性，生成结果可能与商品不符。</p>
              <p style={{ margin: '0 0 4px 0' }}>· MiniMax image-01 的人物参考仅支持人像，不适合商品图生图。</p>
              <p style={{ margin: '0 0 4px 0' }}>· 清晰度与尺寸：不同模型支持的输出档位不同（如 Seedream 有 1K / 2K / 4K 档，部分模型仅支持固定比例），档位越高越清晰，但生成更慢、消耗更多。</p>
              <p style={{ margin: '0' }}>· 「白底图生成」工具建议优先选编辑保真强的模型，背景简单的产品图效果最好。</p>
            </div>
            <div>
              <p style={{ fontWeight: 700, margin: '0 0 6px 0', color: 'var(--brand)' }}>注意事项</p>
              <p style={{ margin: '0 0 4px 0' }}>· 生成前先确认所选输出尺寸与清晰度档位在该模型支持范围内，避免生成失败或图片被强制缩放变形。</p>
              <p style={{ margin: '0 0 4px 0' }}>· 商品一致性依赖参考图与文字描述：图生图时请上传清晰、背景干净的商品图，并在描述中写明材质、颜色、形状等关键特征。</p>
              <p style={{ margin: '0 0 4px 0' }}>· API Key 余额不足或触发限流会导致生成失败，失败原因会显示在任务详情中。</p>
              <p style={{ margin: '0 0 4px 0' }}>· 部分模型有提示词字数上限（如 MiniMax 单次约 1500 字），超长会自动裁剪并尽量保留商品特征。</p>
              <p style={{ margin: '0' }}>· 提示词不是越长越好：关键特征（材质、颜色、形状、光线、构图）描述越具体，生成结果越贴近预期；堆砌无关细节或互相矛盾的描述反而会降低图片质量。</p>
            </div>
          </div>
        </Modal>
        {/* 删除配置确认弹窗 */}
        <Modal
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="删除模型配置"
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (deleteTarget) {
                    deleteConfig(deleteTarget.id)
                    // 若删除的正是编辑中的配置,退出编辑模式
                    if (editingConfig?.id === deleteTarget.id) {
                      cancelFlow()
                    }
                  }
                  setDeleteTarget(null)
                }}
              >
                确认删除
              </Button>
            </>
          }
        >
          <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--fg)' }}>
            确定删除配置「{deleteTarget?.name || deleteTarget?.vendor}」吗？
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--fg-muted)' }}>
            删除后该配置下的 {deleteTarget?.models.length ?? 0} 个模型将不再可用，此操作不可恢复。
          </p>
        </Modal>

        {activeSection === 'advanced' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--fg)', margin: '0 0 4px 0' }}>
              高级设置
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--fg-muted)', margin: '0 0 24px 0' }}>
              配置存储路径与高级选项
            </p>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <FolderCog size={15} style={{ color: 'var(--brand)' }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--fg)' }}>
                  文件路径
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--bg-muted)',
                  fontSize: '11px',
                  color: 'var(--fg-muted)'
                }}>
                  {pathsPlatform === 'mac' ? 'macOS' : 'Windows'}
                </span>
              </div>

              {pathsLoading ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--fg-muted)', fontSize: '13px' }}>
                  加载中...
                </div>
              ) : (
                Object.entries(paths).map(([key, pathData]) => {
                  const Icon = PATH_ICONS[key] || FolderOpen
                  const isModified = savedPaths[key] !== undefined && pathData.current !== savedPaths[key]
                  const isSaving = pathSaving === key
                  return (
                    <div key={key} style={{
                      marginBottom: '12px',
                      padding: '12px 14px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-lg)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <Icon size={14} style={{ color: 'var(--brand)' }} />
                        <label style={sectionLabel}>{PATH_LABELS[key] || key}</label>
                        {isModified && (
                          <span style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--brand-glow)',
                            color: 'var(--brand)',
                            fontWeight: 600
                          }}>
                            已修改
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: '0 0 8px 0' }}>
                        {PATH_DESCS[key] || ''}
                      </p>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={pathData.current}
                          onChange={(e) => setPaths((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], current: e.target.value }
                          }))}
                          style={{
                            flex: 1,
                            padding: '7px 12px',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg)',
                            color: 'var(--fg)',
                            fontSize: '13px',
                            outline: 'none',
                            fontFamily: 'var(--font-mono)'
                          }}
                        />
                        <Button
                          variant="secondary"
                          onClick={() => handleBrowsePath(key)}
                          style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <FolderOpen size={14} />
                          选择
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => handleSavePath(key)}
                          disabled={!isModified || isSaving}
                          style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {isSaving ? <RefreshCw size={12} className="anim-spin" /> : <Check size={12} />}
                          {isSaving ? '保存中...' : '保存'}
                        </Button>
                        {isModified && (
                          <Button
                            variant="ghost"
                            onClick={() => handleResetPath(key)}
                            disabled={isSaving}
                            style={{ padding: '6px 10px', fontSize: '12px' }}
                          >
                            恢复默认
                          </Button>
                        )}
                        <button
                          onClick={() => handleOpenPath(pathData.current)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--fg-muted)',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)',
                            transition: 'color 0.15s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--brand)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--fg-muted)'}
                        >
                          <FolderOpen size={12} />
                          打开文件所在位置
                        </button>
                      </div>
                      {pathMessage && pathMessage.key === key && (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-md)',
                          background: pathMessage.type === 'success' ? '#dcfce7' : '#fee2e2',
                          color: pathMessage.type === 'success' ? '#166534' : '#991b1b',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          {pathMessage.type === 'success' ? <Check size={12} /> : <Zap size={12} />}
                          {pathMessage.text}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 0',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-secondary)' }}>
                  软件日志
                </span>
                <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: '2px 0 0' }}>
                  查看应用运行日志，用于问题排查
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={openLogViewer} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} />
                查看日志
              </Button>
            </div>

            <div style={{
              borderTop: '1px solid var(--border-subtle)',
              padding: '16px 0',
              marginTop: '8px'
            }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg)' }}>
                备份与恢复
              </span>
              <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: '4px 0 14px 0' }}>
                备份已配置模型、设置与项目记录，可导出文件或按计划自动备份
              </p>

              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                <Button variant="secondary" size="sm" onClick={handleExportBackup} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FolderOpen size={14} />
                  导出配置备份
                </Button>
                <Button variant="secondary" size="sm" onClick={handleImportBackup} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <RefreshCw size={14} />
                  导入并还原
                </Button>
              </div>

              {backupMsg && (
                <p style={{
                  fontSize: '12px',
                  color: backupMsg.type === 'success' ? 'var(--brand)' : '#ef4444',
                  margin: '0 0 12px 0',
                  wordBreak: 'break-all'
                }}>
                  {backupMsg.text}
                </p>
              )}

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderTop: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg-secondary)' }}>
                    自动备份
                  </span>
                  <p style={{ fontSize: '12px', color: 'var(--fg-muted)', margin: '2px 0 0' }}>
                    按计划自动备份配置到指定位置
                  </p>
                </div>
                <Toggle checked={backupConfig.enabled} onChange={handleToggleBackup} />
              </div>

              {backupConfig.enabled && (
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '12px 0',
                  borderTop: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end'
                }}>
                  <div style={{ width: '120px' }}>
                    <label style={sectionLabel}>备份时间</label>
                    <Select
                      value={backupConfig.time}
                      onChange={handleChangeBackupTime}
                      options={[
                        { value: '00:00', label: '00:00' },
                        { value: '02:00', label: '02:00' },
                        { value: '04:00', label: '04:00' },
                        { value: '06:00', label: '06:00' },
                        { value: '08:00', label: '08:00' },
                        { value: '09:00', label: '09:00' },
                        { value: '10:00', label: '10:00' },
                        { value: '12:00', label: '12:00' },
                        { value: '14:00', label: '14:00' },
                        { value: '16:00', label: '16:00' },
                        { value: '18:00', label: '18:00' },
                        { value: '20:00', label: '20:00' },
                        { value: '22:00', label: '22:00' }
                      ]}
                    />
                  </div>
                  <div style={{ flex: '1', minWidth: '160px' }}>
                    <label style={sectionLabel}>备份位置</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <div style={{
                        flex: '1',
                        padding: '8px 12px',
                        background: 'var(--bg-muted)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '12px',
                        color: backupConfig.dir ? 'var(--fg)' : 'var(--fg-muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {backupConfig.dir || '未选择目录'}
                      </div>
                      <Button variant="secondary" size="sm" onClick={handleChooseBackupDir}>
                        选择
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'about' && (
          <div>
            <style>{`
              .upd-btn {
                --line_color: var(--brand);
                --back_color: var(--brand-glow);
                position: relative;
                z-index: 0;
                width: 180px;
                height: 48px;
                text-decoration: none;
                font-size: 13px;
                font-weight: bold;
                color: var(--line_color);
                letter-spacing: 2px;
                transition: all 0.3s ease;
                display: inline-flex;
              }
              .upd-btn__text {
                display: flex;
                justify-content: center;
                align-items: center;
                width: 100%;
                height: 100%;
              }
              .upd-btn::before, .upd-btn::after, .upd-btn__text::before, .upd-btn__text::after {
                content: ""; position: absolute; height: 3px; border-radius: 2px; background: var(--line_color); transition: all 0.5s ease;
              }
              .upd-btn::before { top: 0; left: 48px; width: calc(100% - 48px * 2 - 16px); }
              .upd-btn::after { top: 0; right: 48px; width: 8px; }
              .upd-btn__text::before { bottom: 0; right: 48px; width: calc(100% - 48px * 2 - 16px); }
              .upd-btn__text::after { bottom: 0; left: 48px; width: 8px; }
              .upd-btn__line { position: absolute; top: 0; width: 48px; height: 100%; overflow: hidden; }
              .upd-btn__line::before { content: ""; position: absolute; top: 0; width: 150%; height: 100%; box-sizing: border-box; border-radius: 300px; border: solid 3px var(--line_color); }
              .upd-btn__line:nth-child(1), .upd-btn__line:nth-child(1)::before { left: 0; }
              .upd-btn__line:nth-child(2), .upd-btn__line:nth-child(2)::before { right: 0; }
              .upd-btn:hover { letter-spacing: 6px; }
              .upd-btn:hover::before, .upd-btn:hover .upd-btn__text::before { width: 8px; }
              .upd-btn:hover::after, .upd-btn:hover .upd-btn__text::after { width: calc(100% - 48px * 2 - 16px); }
              .upd-btn__drow1, .upd-btn__drow2 { position: absolute; z-index: -1; border-radius: 16px; transform-origin: 16px 16px; opacity: 0; }
              .upd-btn__drow1 { top: -16px; left: 30px; width: 32px; height: 0; transform: rotate(30deg); }
              .upd-btn__drow2 { top: 34px; left: 62px; width: 32px; height: 0; transform: rotate(-127deg); }
              .upd-btn__drow1::before, .upd-btn__drow1::after, .upd-btn__drow2::before, .upd-btn__drow2::after { content: ""; position: absolute; }
              .upd-btn__drow1::before { bottom: 0; left: 0; width: 0; height: 32px; border-radius: 16px; transform-origin: 16px 16px; transform: rotate(-60deg); }
              .upd-btn__drow1::after { top: -10px; left: 45px; width: 0; height: 32px; border-radius: 16px; transform-origin: 16px 16px; transform: rotate(69deg); }
              .upd-btn__drow2::before { bottom: 0; left: 0; width: 0; height: 32px; border-radius: 16px; transform-origin: 16px 16px; transform: rotate(-146deg); }
              .upd-btn__drow2::after { bottom: 26px; left: -40px; width: 0; height: 32px; border-radius: 16px; transform-origin: 16px 16px; transform: rotate(-262deg); }
              .upd-btn__drow1, .upd-btn__drow1::before, .upd-btn__drow1::after, .upd-btn__drow2, .upd-btn__drow2::before, .upd-btn__drow2::after { background: var(--back_color); }
              /* 装饰元素平时隐藏,仅 hover 时出现,避免与相邻按钮互相遮挡 */
              .upd-btn:hover .upd-btn__drow1, .upd-btn:hover .upd-btn__drow2 { opacity: 1; }
              .upd-btn:hover .upd-btn__drow1 { animation: upd-drow1 ease-in 0.06s; animation-fill-mode: forwards; }
              .upd-btn:hover .upd-btn__drow1::before { animation: upd-drow2 linear 0.08s 0.06s; animation-fill-mode: forwards; }
              .upd-btn:hover .upd-btn__drow1::after { animation: upd-drow3 linear 0.03s 0.14s; animation-fill-mode: forwards; }
              .upd-btn:hover .upd-btn__drow2 { animation: upd-drow4 linear 0.06s 0.2s; animation-fill-mode: forwards; }
              .upd-btn:hover .upd-btn__drow2::before { animation: upd-drow3 linear 0.03s 0.26s; animation-fill-mode: forwards; }
              .upd-btn:hover .upd-btn__drow2::after { animation: upd-drow5 linear 0.06s 0.32s; animation-fill-mode: forwards; }
              @keyframes upd-drow1 { 0% { height: 0; } 100% { height: 100px; } }
              @keyframes upd-drow2 { 0% { width: 0; opacity: 0; } 10% { opacity: 0; } 11% { opacity: 1; } 100% { width: 120px; } }
              @keyframes upd-drow3 { 0% { width: 0; } 100% { width: 80px; } }
              @keyframes upd-drow4 { 0% { height: 0; } 100% { height: 120px; } }
              @keyframes upd-drow5 { 0% { width: 0; } 100% { width: 124px; } }

              .ver-holo {
                position: relative;
                width: 240px;
                height: 72px;
                display: flex;
                align-items: center;
                justify-content: center;
                perspective: 900px;
                transform-style: preserve-3d;
                animation: ver-wobble 6.2s ease-in-out infinite;
                pointer-events: none;
              }
              @keyframes ver-wobble {
                0% { transform: rotateX(16deg) rotateY(-18deg); }
                50% { transform: rotateX(18deg) rotateY(18deg); }
                100% { transform: rotateX(16deg) rotateY(-18deg); }
              }
              .ver-holo__layer {
                position: absolute;
                font-weight: 900;
                font-size: 60px;
                letter-spacing: -2px;
                line-height: 1;
                white-space: nowrap;
                -webkit-text-stroke: 1px color-mix(in srgb, var(--brand) 70%, transparent);
                background: linear-gradient(90deg,
                  color-mix(in srgb, var(--brand) 18%, transparent) 0%,
                  color-mix(in srgb, var(--brand) 92%, transparent) 35%,
                  color-mix(in srgb, var(--brand) 70%, transparent) 60%,
                  color-mix(in srgb, var(--brand) 22%, transparent) 100%);
                -webkit-background-clip: text;
                background-clip: text;
                color: transparent;
                filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.55));
                opacity: 0.95;
                transform-style: preserve-3d;
              }
              .ver-holo__layer--back { opacity: 0.18; filter: blur(1px); transform: translateZ(-70px); -webkit-text-stroke: 1px color-mix(in srgb, var(--brand) 45%, transparent); }
              .ver-holo__layer--mid { opacity: 0.42; filter: blur(0.4px); transform: translateZ(-34px); -webkit-text-stroke: 1px color-mix(in srgb, var(--brand) 55%, transparent); }
              .ver-holo__layer--front { opacity: 0.98; transform: translateZ(0px); -webkit-text-stroke: 1px color-mix(in srgb, var(--brand) 78%, transparent); }
            `}</style>

            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <BrandLogo size={120} />
                <HoloVersion text={`v${appVersion || '1.0.0'}`} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <UpdateButton
                    text={
                      updateState === 'checking' ? '检查中...'
                        : updateState === 'available' ? '下载更新'
                        : updateState === 'downloading' ? `下载中 ${updateProgress}%`
                        : updateState === 'downloaded' ? '立即重启安装'
                        : updateState === 'latest' ? '已是最新版本'
                        : updateState === 'error' ? '重试检查'
                        : '检查更新'
                    }
                    onClick={
                      updateState === 'available' ? handleDownloadUpdate
                        : updateState === 'downloaded' ? handleQuitAndInstall
                        : handleCheckUpdate
                    }
                  />
                  {/* 网盘下载:国内用户手动更新兜底(链接硬编码,点击浏览器跳转) */}
                  <UpdateButton text="网盘下载" onClick={handleOpenMirror} />
                  {updateState === 'downloaded' && updateVersion && (
                    <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>
                      新版本 v{updateVersion} 已下载
                    </span>
                  )}
                </div>
                {/* 下载进度条 */}
                {updateState === 'downloading' && (
                  <div style={{
                    width: '220px', height: '6px', borderRadius: '3px',
                    background: 'var(--bg-muted)', overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%', width: `${updateProgress}%`,
                      background: 'var(--brand)', borderRadius: '3px',
                      transition: 'width 0.2s ease'
                    }} />
                  </div>
                )}
                {mirrorMsg && (
                  <span style={{ fontSize: '11px', color: 'var(--fg-muted)' }}>{mirrorMsg}</span>
                )}
                {updateError && (
                  <span style={{ fontSize: '11px', color: 'var(--danger)', maxWidth: '260px' }}>
                    {updateError}
                  </span>
                )}
              </div>
            </div>

            {/* 网盘下载确认弹窗:告知提取码,用户确认后跳转 */}
            <Modal
              open={mirrorConfirmOpen}
              onClose={() => setMirrorConfirmOpen(false)}
              title="网盘下载"
              footer={
                <>
                  <Button variant="secondary" onClick={() => setMirrorConfirmOpen(false)}>取消</Button>
                  <Button variant="primary" onClick={handleConfirmMirror}>确定跳转</Button>
                </>
              }
            >
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <Download size={20} style={{ color: 'var(--brand)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--fg)', lineHeight: '1.7' }}>
                    即将打开网盘下载页面，下载安装包后覆盖安装即可完成更新。
                  </p>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--fg)', lineHeight: '1.7', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    网盘提取码：
                    <strong style={{ color: 'var(--brand)' }}>{MIRROR_DOWNLOAD_CODE}</strong>
                    <button
                      onClick={handleCopyMirrorCode}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 500,
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--bg-muted)',
                        color: 'var(--fg-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <Copy size={11} />
                      {codeCopied ? '已复制' : '点击复制'}
                    </button>
                  </p>
                </div>
              </div>
            </Modal>

            <div style={{ display: 'flex', gap: '24px', alignItems: 'stretch', justifyContent: 'space-between', marginBottom: '24px' }}>
              {/* Changelog（可滚动，高度与开发者卡片一致） */}
              <div style={{
                flex: '0 1 590px',
                minWidth: 0,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                height: '310px',
                overflowY: 'auto',
                boxSizing: 'border-box'
              }}>
                <h4 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
                  更新日志
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>v1.0.1</span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '11px',
                        fontWeight: 500,
                        background: 'var(--brand-glow)',
                        color: 'var(--brand)'
                      }}>
                        最新
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--fg-muted)' }}>2026-08-17</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.8', color: 'var(--fg-muted)' }}>
                      <li>AI 一键生成主图 / 详情图 / 广告图</li>
                      <li>风格复刻：参考爆款设计图，AI 智能复刻风格</li>
                      <li>其他功能：图片编辑、白底图生成</li>
                      <li>支持 14 家主流 AI 厂商模型接入</li>
                      <li>在线更新与数据自动备份</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Developer Card (3D Flip) */}
              <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0, marginRight: '60px' }}>
              <div
                style={{ width: '260px', height: '310px', perspective: '800px', cursor: 'pointer' }}
                onMouseEnter={() => setAboutFlipped(true)}
                onMouseLeave={() => setAboutFlipped(false)}
              >
                <div style={{
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  transformStyle: 'preserve-3d',
                  transition: 'transform 1500ms',
                  borderRadius: 'var(--radius-xl)',
                  background: 'var(--bg-surface)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                  transform: aboutFlipped ? 'rotateX(180deg) rotateZ(-180deg)' : 'rotateX(0) rotateZ(0)'
                }}>
                  {/* Top glow */}
                  <div style={{
                    position: 'absolute',
                    top: '-2px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '50%',
                    height: '12px',
                    background: 'transparent',
                    border: '2px solid var(--brand)',
                    borderTop: 'none',
                    borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                    boxShadow: '0 0 10px 5px rgba(201,100,66,0.4)'
                  }} />
                  {/* Front */}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 'var(--radius-xl)',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    backfaceVisibility: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                  }}>
                    <div style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      background: 'var(--brand-glow)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '3px solid var(--brand)',
                      overflow: 'hidden'
                    }}>
                      <img
                        src="https://avatars.githubusercontent.com/u/193763116?s=400&u=5a690fa2dfcb56d8117538cca0df76c8e2552a5e&v=4"
                        alt="Pixmart Team"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-display)' }}>
                        Pixmart —Mirror
                      </h4>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 14px',
                      background: 'var(--bg-muted)',
                      borderRadius: 'var(--radius-full)'
                    }}>
                      <Sparkles size={14} style={{ color: 'var(--brand)' }} />
                      <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--fg-muted)' }}>
                        悬停翻转
                      </span>
                    </div>
                  </div>
                  {/* Back */}
                  <div style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 'var(--radius-xl)',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    backfaceVisibility: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    transform: 'rotateX(180deg) rotateZ(-180deg)'
                  }}>
                    <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-display)' }}>
                      联系我们
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
                      {/* WeChat（点击复制微信号） */}
                      <button
                        type="button"
                        onClick={handleCopyWechat}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          padding: '10px 20px',
                          background: 'var(--bg-muted)',
                          borderRadius: 'var(--radius-md)',
                          width: '210px',
                          border: 'none',
                          color: 'inherit',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--brand-glow)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <svg viewBox="0 0 1024 1024" width="18" height="18" fill="currentColor" style={{ color: 'var(--brand)' }}>
                            <path d="M249.173333 335.872c0 10.922667 4.437333 21.504 11.946667 29.013333 7.509333 7.509333 18.432 11.946667 29.013333 11.946667 10.922667 0 21.504-4.437333 29.013333-11.946667 7.509333-7.509333 11.946667-18.432 11.946667-29.013333 0-10.922667-4.437333-21.504-11.946667-29.013333-7.509333-7.509333-18.432-11.946667-29.013333-11.946667-10.922667 0-21.504 4.437333-29.013333 11.946667C253.610667 314.368 249.173333 325.290667 249.173333 335.872L249.173333 335.872zM249.173333 335.872M569.344 548.864c0 8.533333 3.413333 16.725333 9.557333 22.869333 5.802667 5.802667 14.336 9.557333 22.869333 9.557333 8.533333 0 16.725333-3.413333 22.869333-9.557333 5.802667-5.802667 9.557333-14.336 9.557333-22.869333 0-8.533333-3.413333-16.725333-9.557333-22.869333-5.802667-5.802667-14.336-9.557333-22.869333-9.557333-8.533333 0-16.725333 3.413333-22.869333 9.557333C573.098667 531.797333 569.344 540.330667 569.344 548.864L569.344 548.864zM569.344 548.864M459.093333 335.872c0 10.922667 4.437333 21.504 11.946667 29.013333 7.509333 7.509333 18.432 11.946667 29.013333 11.946667 10.922667 0 21.504-4.437333 29.013333-11.946667 7.509333-7.509333 11.946667-18.432 11.946667-29.013333 0-10.922667-4.437333-21.504-11.946667-29.013333-7.509333-7.509333-18.432-11.946667-29.013333-11.946667-10.922667 0-21.504 4.437333-29.013333 11.946667C463.530667 314.368 459.093333 325.290667 459.093333 335.872L459.093333 335.872zM459.093333 335.872M842.069333 27.306667 181.930667 27.306667C94.549333 27.306667 23.893333 98.304 23.893333 186.026667l0 659.456c0 87.722667 70.997333 158.72 158.378667 158.72l660.138667 0c87.381333 0 158.378667-70.997333 158.378667-158.72L1000.789333 186.026667C1000.448 98.304 929.450667 27.306667 842.069333 27.306667L842.069333 27.306667zM390.144 681.642667c-36.864 0-66.56-7.509333-103.765333-15.018667l-103.424 51.882667 29.696-89.088c-74.069333-51.882667-118.442667-118.442667-118.442667-200.021333 0-140.970667 133.461333-251.904 296.277333-251.904 145.749333 0 273.066667 88.746667 298.666667 207.872-9.557333-1.024-18.773333-1.706667-28.672-1.706667-140.629333 0-251.904 105.130667-251.904 234.496 0 21.504 3.413333 42.325333 9.216 62.122667C408.917333 681.301333 399.701333 681.642667 390.144 681.642667L390.144 681.642667zM827.050667 785.408l22.186667 74.069333-81.237333-44.373333c-29.696 7.509333-59.392 15.018667-88.746667 15.018667-140.970667 0-251.904-96.256-251.904-215.04 0-118.442667 110.933333-215.04 251.904-215.04 133.12 0 251.562667 96.597333 251.562667 215.04C930.816 681.642667 886.442667 741.034667 827.050667 785.408L827.050667 785.408zM827.050667 785.408M730.794667 548.864c0 8.533333 3.413333 16.725333 9.557333 22.869333 5.802667 5.802667 14.336 9.557333 22.869333 9.557333 8.533333 0 16.725333-3.413333 22.869333-9.557333 5.802667-5.802667 9.557333-14.336 9.557333-22.869333 0-8.533333-3.413333-16.725333-9.557333-22.869333-5.802667-5.802667-14.336-9.557333-22.869333-9.557333-8.533333 0-16.725333 3.413333-22.869333 9.557333C734.208 531.797333 730.794667 540.330667 730.794667 548.864L730.794667 548.864zM730.794667 548.864" />
                          </svg>
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: 'var(--fg)' }}>微信</p>
                          <p style={{ margin: 0, fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>
                            {wechatCopied ? '已复制 ✓' : 'lan89an89'}
                          </p>
                        </div>
                      </button>
                      {/* GitHub */}
                      <a href="https://github.com/mirror9933" target="_blank" rel="noreferrer" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        textDecoration: 'none',
                        padding: '10px 20px',
                        background: 'var(--bg-muted)',
                        borderRadius: 'var(--radius-md)',
                        width: '210px',
                        transition: 'all 0.15s'
                      }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--brand-glow)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <svg viewBox="0 0 1024 1024" width="18" height="18" fill="currentColor" style={{ color: 'var(--brand)' }}>
                            <path d="M20.48 503.72608c0 214.4256 137.4208 396.73856 328.94976 463.6672 25.8048 6.5536 21.87264-11.8784 21.87264-24.33024v-85.07392c-148.93056 17.44896-154.86976-81.1008-164.94592-97.52576-20.23424-34.52928-67.91168-43.33568-53.69856-59.76064 33.91488-17.44896 68.48512 4.42368 108.46208 63.61088 28.95872 42.88512 85.44256 35.6352 114.15552 28.4672a138.8544 138.8544 0 0 1 38.0928-66.7648c-154.25536-27.60704-218.60352-121.77408-218.60352-233.79968 0-54.31296 17.94048-104.2432 53.0432-144.54784-22.36416-66.43712 2.08896-123.24864 5.3248-131.6864 63.81568-5.7344 130.00704 45.6704 135.168 49.68448 36.2496-9.78944 77.57824-14.9504 123.82208-14.9504 46.4896 0 88.064 5.3248 124.5184 15.23712 12.288-9.4208 73.80992-53.53472 133.12-48.128 3.15392 8.43776 27.0336 63.93856 6.02112 129.4336 35.59424 40.38656 53.69856 90.76736 53.69856 145.24416 0 112.18944-64.7168 206.4384-219.42272 233.71776a140.0832 140.0832 0 0 1 41.7792 99.9424v123.4944c0.86016 9.87136 0 19.6608 16.50688 19.6608 194.31424-65.49504 334.2336-249.15968 334.2336-465.5104C1002.57792 232.48896 782.66368 12.77952 511.5904 12.77952 240.18944 12.65664 20.48 232.40704 20.48 503.72608z" />
                          </svg>
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: 'var(--fg)' }}>GitHub</p>
                          <p style={{ margin: 0, fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>github.com/mirror9933</p>
                        </div>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>

            {/* Copyright */}
            <p style={{
              margin: '24px 0 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--fg-muted)'
            }}>
              &copy; 2026
              <BrandLogo size={70} />
              All rights reserved.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ModelConfigCard({
  config, onDelete, onEdit, testConnection, maskKey
}: {
  config: ModelConfig
  onDelete: () => void
  onEdit: () => void
  testConnection: (id: string) => Promise<{ success: boolean; latency: number; error?: string }>
  maskKey: (k: string) => string
}) {
  const [cardTestResult, setCardTestResult] = useState<{ success: boolean; latency: number; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const vendorLabels: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google AI',
    openrouter: 'OpenRouter',
    agnes: 'Agnes AI',
    ofox: 'Ofox',
    aihubmix: 'AIHubMix',
    siliconflow: 'SiliconFlow',
    volcengine: '火山方舟',
    bailian: '阿里云百炼',
    mimo: '小米 MiMo',
    kimi: 'Kimi',
    minimax: 'MiniMax',
    custom: '自定义'
  }

  // 连接状态徽章(所有配置都展示,包括未连接/未测试的)
  const statusBadge = (() => {
    if (config.isActive) {
      return { text: '已启用', bg: '#dcfce7', color: '#166534' }
    }
    if (config.status === 'error') {
      return { text: '连接失败', bg: '#fee2e2', color: '#991b1b' }
    }
    if (config.status === 'untested') {
      return { text: '未测试', bg: '#fef9c3', color: '#854d0e' }
    }
    return { text: '已禁用', bg: '#fee2e2', color: '#991b1b' }
  })()

  const handleTest = async () => {
    setTesting(true)
    setCardTestResult(null)
    try {
      const result = await testConnection(config.id)
      setCardTestResult(result)
    } catch {
      setCardTestResult({ success: false, latency: 0, error: '测试请求失败' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="anim-card" style={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      padding: '14px 16px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)'
    }}>
      {VENDOR_LOGOS[config.vendor] ? (
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: '#ffffff',
          border: '1px solid var(--brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <img
            src={VENDOR_LOGOS[config.vendor]}
            alt=""
            style={{ height: '28px', maxWidth: '32px', objectFit: 'contain' }}
          />
        </div>
      ) : (
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '12px',
          background: '#ffffff',
          border: '1px solid var(--brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Server size={24} style={{ color: 'var(--brand)' }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--fg)' }}>
            {config.name || vendorLabels[config.vendor] || config.vendor}
          </span>
          <span style={{
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            background: statusBadge.bg,
            color: statusBadge.color,
            fontWeight: 600
          }}>
            {statusBadge.text}
          </span>
          <span style={{
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-muted)',
            color: 'var(--fg-muted)'
          }}>
            {vendorLabels[config.vendor] || config.vendor}
          </span>
          {(config as any).vendor === 'custom' && (config as any).protocol && (
            <span style={{
              fontSize: '10px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--brand-glow)',
              color: 'var(--brand)'
            }}>
              {PROTOCOL_INFO[(config as any).protocol as CustomProtocol]?.label || (config as any).protocol}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--fg-muted)', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            Key: {maskKey(config.apiKey)}
          </span>
          {config.baseUrl && (
            <span style={{ fontFamily: 'var(--font-mono)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {config.baseUrl}
            </span>
          )}
          {config.models.length > 0 && (
            <span>模型: {config.models.length} 个</span>
          )}
          {config.orgId && (
            <span>Org: {config.orgId}</span>
          )}
          {config.timeout ? (
            <span>超时: {config.timeout}s</span>
          ) : null}
          {config.headers && Object.keys(config.headers).length > 0 && (
            <span>请求头: {Object.keys(config.headers).length} 个</span>
          )}
        </div>
        {config.models.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
            {config.models.slice(0, 4).map((m) => {
              const meta = (config as any).modelMeta?.[m]
              const cap = meta?.capability
              return (
                <span key={m} style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  background: 'var(--bg-muted)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--fg-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {m}
                  {cap && cap !== 'auto' && (
                    <span style={{
                      padding: '0 5px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '9px',
                      fontWeight: 600,
                      background: cap === 'image' ? '#dcfce7' : cap === 'vision' ? '#dbeafe' : '#fef9c3',
                      color: cap === 'image' ? '#166534' : cap === 'vision' ? '#1e40af' : '#854d0e'
                    }}>
                      {CAPABILITY_LABELS[cap]}
                    </span>
                  )}
                  {meta?.alias && (
                    <span style={{ color: 'var(--brand)', fontStyle: 'italic' }}>
                      {meta.alias}
                    </span>
                  )}
                </span>
              )
            })}
            {config.models.length > 4 && (
              <span style={{ fontSize: '10px', color: 'var(--fg-muted)' }}>
                +{config.models.length - 4}
              </span>
            )}
          </div>
        )}
        {cardTestResult && (
          <div style={{
            marginTop: '8px',
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: cardTestResult.success ? '#dcfce7' : '#fee2e2',
            color: cardTestResult.success ? '#166534' : '#991b1b',
            fontSize: '11px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={11} />
              {cardTestResult.success
                ? `连接成功 · 延迟 ${cardTestResult.latency}ms`
                : '连接失败'}
            </span>
            {!cardTestResult.success && cardTestResult.error && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', wordBreak: 'break-all' }}>
                {cardTestResult.error}
              </span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
        {testing && (
          <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--fg-muted)' }} />
        )}
        <button onClick={handleTest} style={iconBtnStyle} title="测试连接" disabled={testing}>
          <TestTube size={14} />
        </button>
        <button onClick={onEdit} style={iconBtnStyle} title="编辑配置">
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} style={iconBtnStyle} title="删除配置">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--fg-secondary)',
  marginBottom: '8px'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 14px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--bg)',
  color: 'var(--fg)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box'
}

const iconBtnStyle: React.CSSProperties = {
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
  transition: 'all 0.15s'
}

/** 检查更新/下载更新按钮（uiverse wise-shrimp-26 动画样式，主题化配色） */
function UpdateButton({ text, onClick }: { text: string; onClick?: () => void }) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
      }}
      className="upd-btn"
    >
      <div className="upd-btn__line" />
      <div className="upd-btn__line" />
      <span className="upd-btn__text">{text}</span>
      <div className="upd-btn__drow1" />
      <div className="upd-btn__drow2" />
    </a>
  )
}

/** 3D 全息版本号（uiverse helpless-penguin-80 分层效果，主题化配色） */
function HoloVersion({ text }: { text: string }) {
  return (
    <div className="ver-holo" aria-label={text}>
      <span className="ver-holo__layer ver-holo__layer--back">{text}</span>
      <span className="ver-holo__layer ver-holo__layer--mid">{text}</span>
      <span className="ver-holo__layer ver-holo__layer--front">{text}</span>
    </div>
  )
}

/** 软件品牌 logo（与导航栏左上角一致） */
function BrandLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 800 800" style={{ color: 'var(--brand)', flexShrink: 0 }}>
      <g transform="translate(0,800) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M2258 4529 c-46 -24 -68 -64 -68 -122 0 -129 182 -176 250 -64 41 67 16 158 -53 190 -45 22 -83 21 -129 -4z"/>
        <path d="M1320 4408 l-25 -14 -3 -409 c-3 -485 -14 -445 127 -445 124 0 131 7 131 119 l0 88 128 6 c148 6 206 21 282 75 161 112 183 351 43 483 -88 84 -152 100 -433 105 -175 4 -231 2 -250 -8z m443 -212 c45 -19 68 -48 74 -94 12 -92 -50 -136 -192 -137 l-90 0 -3 123 -3 122 91 0 c54 0 104 -5 123 -14z"/>
        <path d="M6260 4351 c-5 -11 -10 -49 -10 -85 l0 -66 -50 0 c-60 0 -70 -14 -70 -99 0 -74 14 -91 76 -91 l44 0 0 -128 c0 -166 14 -217 79 -282 51 -51 107 -72 195 -72 87 0 179 36 192 74 3 10 -9 44 -28 80 -35 67 -45 72 -109 54 -18 -5 -32 -2 -50 12 -23 19 -24 27 -28 141 l-3 121 70 0 c86 0 102 15 102 98 0 85 -8 92 -95 92 l-75 0 0 73 c0 43 -5 78 -12 85 -8 8 -48 12 -115 12 -91 0 -103 -2 -113 -19z"/>
        <path d="M3757 4236 c-27 -7 -61 -22 -76 -33 l-27 -21 -17 29 c-16 29 -17 29 -111 29 -73 0 -98 -4 -110 -16 -14 -13 -16 -58 -16 -334 0 -377 -10 -350 127 -350 124 0 123 -2 123 210 0 133 3 178 16 210 19 47 55 70 109 70 91 0 105 -34 105 -268 0 -138 3 -183 14 -198 12 -16 29 -20 104 -22 133 -6 132 -8 132 208 0 133 3 178 16 210 36 90 159 99 199 15 12 -26 15 -71 15 -212 0 -223 -3 -217 114 -222 68 -2 92 0 112 14 l25 16 -3 232 c-3 217 -4 235 -26 282 -30 65 -73 108 -136 137 -42 19 -67 23 -141 22 -98 -1 -153 -18 -211 -67 l-31 -26 -24 26 c-54 58 -186 86 -282 59z"/>
        <path d="M4970 4243 c-40 -7 -122 -34 -162 -55 -29 -14 -38 -24 -38 -44 0 -31 59 -132 81 -139 9 -3 38 5 65 17 68 30 190 32 230 3 15 -11 31 -31 35 -43 8 -22 8 -22 -104 -22 -176 0 -269 -33 -318 -114 -24 -39 -26 -134 -3 -182 37 -78 139 -134 244 -134 52 0 141 24 177 47 21 14 23 14 23 -1 0 -24 41 -36 124 -36 109 0 106 -8 106 257 0 140 -4 232 -12 254 -32 94 -109 160 -217 185 -53 13 -175 16 -231 7z m218 -450 c2 -13 -8 -34 -26 -54 -24 -27 -37 -33 -84 -37 -47 -4 -59 -1 -77 17 -29 29 -25 71 9 88 15 8 54 12 100 11 68 -3 75 -5 78 -25z"/>
        <path d="M5946 4235 c-22 -8 -52 -23 -67 -34 -34 -26 -39 -26 -39 -3 0 35 -21 42 -120 42 -81 0 -100 -3 -113 -18 -15 -16 -17 -55 -17 -335 0 -374 -10 -347 130 -347 129 0 124 -8 130 208 5 163 7 183 26 209 38 51 81 73 145 73 l59 0 0 98 c0 63 -4 102 -12 110 -16 16 -73 15 -122 -3z"/>
        <path d="M2212 4228 c-9 -9 -12 -97 -12 -334 0 -280 2 -325 16 -338 12 -12 37 -16 105 -16 138 0 129 -24 129 353 0 375 11 347 -131 347 -61 0 -99 -4 -107 -12z"/>
        <path d="M2576 4219 c-8 -12 -12 -29 -9 -38 6 -15 106 -152 172 -235 17 -21 31 -45 31 -53 0 -8 -43 -71 -96 -141 -121 -159 -126 -168 -95 -193 19 -15 40 -19 111 -19 103 0 118 8 180 100 22 32 44 61 48 64 5 3 32 -28 61 -69 28 -41 60 -79 71 -85 10 -5 61 -10 113 -10 78 0 97 3 110 18 10 10 17 25 17 32 0 7 -46 74 -102 149 -57 74 -106 141 -110 147 -5 7 36 70 102 160 102 136 109 149 96 168 -12 19 -25 21 -119 24 l-106 3 -58 -80 c-32 -44 -61 -81 -64 -81 -4 0 -21 21 -37 48 -17 26 -45 62 -63 80 l-31 32 -104 0 c-93 0 -104 -2 -118 -21z"/>
      </g>
    </svg>
  )
}
