import { useSettingsStore } from '@/stores/useSettingsStore'
import { Sun, Moon, Monitor } from 'lucide-react'

type Theme = 'light' | 'dark' | 'system'

export function ThemeToggle() {
  const settings = useSettingsStore((s) => s.settings)
  const currentTheme = (settings.theme || 'system') as Theme

  const cycleTheme = () => {
    const next: Theme = currentTheme === 'light' ? 'dark' : currentTheme === 'dark' ? 'system' : 'light'

    const root = document.documentElement
    if (next === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.setAttribute('data-theme', systemTheme)
    } else {
      root.setAttribute('data-theme', next)
    }

    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, theme: next },
    }))

    window.api.settings.set('theme', next).catch(() => {})
    ;(window as any).api?.theme?.apply?.(next)
  }

  return (
    <div
      className="theme-toggle-wrap"
      data-theme-pref={currentTheme}
      onClick={cycleTheme}
      role="button"
      aria-label="切换主题"
    >
      <span className="theme-icon theme-icon--sun">
        <Sun size={18} />
      </span>
      <span className="theme-icon theme-icon--moon">
        <Moon size={18} />
      </span>
      <span className="theme-icon theme-icon--system">
        <Monitor size={18} />
      </span>
    </div>
  )
}

export default ThemeToggle
