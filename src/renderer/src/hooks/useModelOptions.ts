import { useEffect, useState } from 'react'

export interface ModelOption {
  value: string
  label: string
  configId: string
}

function computeOptions(configs: any[]) {
  const withModels = configs.filter(c => Array.isArray(c.models) && c.models.length > 0)
  const allModels: ModelOption[] = []
  const seen = new Set<string>()

  for (const config of withModels) {
    const vendorLabel = config.name || config.vendorLabel || config.vendor
    for (const model of config.models) {
      if (seen.has(model)) continue
      seen.add(model)
      allModels.push({ value: model, label: `${model} (${vendorLabel})`, configId: config.id })
    }
  }
  return allModels
}

export function useModelOptions() {
  const [models, setModels] = useState<ModelOption[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const configs = await window.api.models.getAll()
        if (cancelled) return
        setModels(computeOptions(configs))
      } catch { /* ignore */ }
    }

    load()

    // Poll on hash change — catches SPA navigations even without unmount
    const onHashChange = () => { load() }
    window.addEventListener('hashchange', onHashChange)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  return { textModels: models, imageModels: models, allModels: models }
}
