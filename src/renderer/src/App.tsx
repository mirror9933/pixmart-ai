import { useEffect } from 'react'
import { createHashRouter, createRoutesFromElements, Route, RouterProvider } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import ProductImages from '@/pages/ProductImages'
import BatchTasks from '@/pages/BatchTasks'
import ConfirmPlan from '@/pages/ConfirmPlan'
import StyleReplication from '@/pages/StyleReplication'
import OtherTools from '@/pages/OtherTools'
import ProjectHistory from '@/pages/ProjectHistory'
import Settings from '@/pages/Settings'
import LogViewer from '@/components/ui/LogViewer'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useModelStore } from '@/stores/useModelStore'
import { useLogViewerStore } from '@/stores/useLogViewerStore'

const router = createHashRouter(
  createRoutesFromElements(
    <Route path="/" element={<Layout />}>
      <Route index element={<ProductImages />} />
      <Route path="batch-tasks" element={<BatchTasks />} />
      <Route path="confirm-plan" element={<ConfirmPlan />} />
      <Route path="style-replication" element={<StyleReplication />} />
      <Route path="other-tools" element={<OtherTools />} />
      <Route path="project-history" element={<ProjectHistory />} />
      <Route path="settings" element={<Settings />} />
    </Route>
  )
)

export default function App() {
  const fetchSettings = useSettingsStore((s) => s.fetchSettings)
  const fetchConfigs = useModelStore((s) => s.fetchConfigs)
  const logOpen = useLogViewerStore((s) => s.open)
  const closeLogViewer = useLogViewerStore((s) => s.closeLogViewer)

  useEffect(() => {
    async function init() {
      // One-shot cleanup — must complete before fetchConfigs
      const cleaned = localStorage.getItem('pixmart-models-cleaned')
      if (!cleaned) {
        try { await window.api.models.clearAll() } catch {}
        localStorage.setItem('pixmart-models-cleaned', '1')
      }

      await fetchSettings()
      const theme = useSettingsStore.getState().settings.theme || 'system'
      const root = document.documentElement
      if (theme === 'system') {
        const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        root.setAttribute('data-theme', sys)
      } else {
        root.setAttribute('data-theme', theme)
      }

      await fetchConfigs()
    }
    init()
  }, [fetchSettings, fetchConfigs])

  return (
    <>
      <RouterProvider router={router} />
      <LogViewer open={logOpen} onClose={closeLogViewer} />
    </>
  )
}
