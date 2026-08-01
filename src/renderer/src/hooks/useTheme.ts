import { useEffect } from 'react'
import { useSettingsStore } from '../stores/useSettingsStore'

export function useTheme() {
  const theme = useSettingsStore((state) => state.settings.theme || 'system')

  useEffect(() => {
    const root = document.documentElement

    const applyTheme = (theme: string) => {
      if (theme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        root.setAttribute('data-theme', systemTheme)
      } else {
        root.setAttribute('data-theme', theme)
      }
    }

    applyTheme(theme)

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme('system')
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  return theme
}
