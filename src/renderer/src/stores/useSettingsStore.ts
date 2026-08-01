import { create } from 'zustand'
import type { SettingsMap, SettingValue } from '../types/settings'

interface SettingsState {
  settings: Partial<SettingsMap>
  loading: boolean
  error: string | null

  fetchSettings: () => Promise<void>
  updateSetting: <K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) => Promise<void>
  updateSettings: (entries: Partial<SettingsMap>) => Promise<void>
  getSetting: <K extends keyof SettingsMap>(key: K) => SettingsMap[K] | undefined
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {},
  loading: false,
  error: null,

  fetchSettings: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.settings.getAll()
      set({ settings: result, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  updateSetting: async (key, value) => {
    set({ loading: true, error: null })
    try {
      await window.api.settings.set(key, value)
      set((state) => ({
        settings: { ...state.settings, [key]: value },
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  updateSettings: async (entries) => {
    set({ loading: true, error: null })
    try {
      await window.api.settings.setMany(entries)
      set((state) => ({
        settings: { ...state.settings, ...entries },
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  getSetting: (key) => {
    return get().settings[key]
  },
}))
