import { create } from 'zustand'
import type { ModelConfig, ModelInfo } from '../types/model'

interface ModelState {
  modelConfigs: ModelConfig[]
  version: number
  loading: boolean
  error: string | null

  getAvailableModelOptions: () => Array<{ value: string; label: string }>
  getTextModels: () => Array<{ value: string; label: string }>
  getImageModels: () => Array<{ value: string; label: string }>
  fetchConfigs: () => Promise<void>
  addConfig: (data: Partial<ModelConfig>) => Promise<ModelConfig>
  updateConfig: (id: string, data: Partial<ModelConfig>) => Promise<void>
  deleteConfig: (id: string) => Promise<void>
  testConnection: (id: string) => Promise<{ success: boolean; latency: number }>
  fetchModels: (id: string) => Promise<ModelInfo[]>
}

export const useModelStore = create<ModelState>((set, get) => ({
  modelConfigs: [],
  version: 0,
  loading: false,
  error: null,

  getAvailableModelOptions: () => {
    const { modelConfigs } = get()
    const connected = modelConfigs.filter(c => c.status === 'connected' && c.models.length > 0)
    const options: Array<{ value: string; label: string }> = []
    const seen = new Set<string>()
    for (const config of connected) {
      const vendorLabel = config.name || config.vendor
      for (const model of config.models) {
        if (!seen.has(model)) {
          seen.add(model)
          options.push({ value: model, label: `${model} (${vendorLabel})` })
        }
      }
    }
    return options
  },

  getTextModels: () => {
    const { modelConfigs } = get()
    const connected = modelConfigs.filter(c => c.status === 'connected' && c.models.length > 0)
    const options: Array<{ value: string; label: string }> = []
    const seen = new Set<string>()
    const isImageModel = (id: string) => /dall-e|imagen|agnes-image|gemini.*image/i.test(id)
    for (const config of connected) {
      const vendorLabel = config.name || config.vendor
      for (const model of config.models) {
        if (!seen.has(model) && !isImageModel(model)) {
          seen.add(model)
          options.push({ value: model, label: `${model} (${vendorLabel})` })
        }
      }
    }
    return options
  },

  getImageModels: () => {
    const { modelConfigs } = get()
    const connected = modelConfigs.filter(c => c.status === 'connected' && c.models.length > 0)
    const options: Array<{ value: string; label: string }> = []
    const seen = new Set<string>()
    const isImageModel = (id: string) => /dall-e|imagen|agnes-image|gemini.*image/i.test(id)
    for (const config of connected) {
      const vendorLabel = config.name || config.vendor
      for (const model of config.models) {
        if (!seen.has(model) && isImageModel(model)) {
          seen.add(model)
          options.push({ value: model, label: `${model} (${vendorLabel})` })
        }
      }
    }
    return options
  },

  fetchConfigs: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.models.getAll()
      set((s) => ({ modelConfigs: result, version: s.version + 1, loading: false }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  addConfig: async (data: Partial<ModelConfig>) => {
    set({ loading: true, error: null })
    try {
      const config = await window.api.models.create(data)
      set((state) => ({ modelConfigs: [...state.modelConfigs, config], version: state.version + 1, loading: false }))
      return config
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  updateConfig: async (id: string, data: Partial<ModelConfig>) => {
    set({ loading: true, error: null })
    try {
      const updated = await window.api.models.update(id, data)
      set((state) => ({
        modelConfigs: state.modelConfigs.map((c) => (c.id === id ? { ...c, ...updated } : c)),
        version: state.version + 1,
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  deleteConfig: async (id: string) => {
    set({ loading: true, error: null })
    try {
      await window.api.models.delete(id)
      set((state) => ({
        modelConfigs: state.modelConfigs.filter((c) => c.id !== id),
        version: state.version + 1,
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  testConnection: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.models.testConnection(id)
      set((state) => ({
        modelConfigs: state.modelConfigs.map(c =>
          c.id === id
            ? { ...c, status: result.success ? 'connected' : 'error', latency: result.latency }
            : c
        ),
        version: state.version + 1,
        loading: false
      }))
      return result
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      return { success: false, latency: 0 }
    }
  },

  fetchModels: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const models = await window.api.models.fetchModels(id)
      set((state) => ({
        modelConfigs: state.modelConfigs.map(c =>
          c.id === id ? { ...c, models } : c
        ),
        version: state.version + 1,
        loading: false
      }))
      return models
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      return []
    }
  },
}))
