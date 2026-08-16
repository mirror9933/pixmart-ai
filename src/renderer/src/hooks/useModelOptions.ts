import { useEffect, useState } from 'react'

export interface ModelOption {
  value: string
  label: string
  configId: string
}

type Capability = 'auto' | 'text' | 'image' | 'vision'

/** 模型能力标注:标注了能力的模型返回标注值,否则返回 'auto' */
function capOf(config: any, model: string): Capability {
  return config?.modelMeta?.[model]?.capability || 'auto'
}

function aliasOf(config: any, model: string): string | undefined {
  const alias = config?.modelMeta?.[model]?.alias
  return alias && alias.trim() ? alias.trim() : undefined
}

function computeOptions(configs: any[], mode?: 'text' | 'image') {
  const withModels = configs.filter(c => Array.isArray(c.models) && c.models.length > 0)
  const allModels: ModelOption[] = []
  const seen = new Set<string>()

  // 能力标注优先:有标注时只收集标注匹配的模型;无标注时回退正则
  const tagged: Array<{ config: any; model: string }> = []
  for (const config of withModels) {
    for (const model of config.models) {
      const cap = capOf(config, model)
      if (mode === 'text' && (cap === 'text' || cap === 'vision')) tagged.push({ config, model })
      else if (mode === 'image' && cap === 'image') tagged.push({ config, model })
    }
  }

  const useTagged = mode !== undefined && tagged.length > 0
  const source = useTagged
    ? tagged
    : withModels.flatMap(config => config.models.map((model: string) => ({ config, model })))

  for (const { config, model } of source) {
    if (seen.has(model)) continue
    const cap = capOf(config, model)
    // 无标注时的兜底正则过滤
    if (mode !== undefined && !useTagged) {
      const isImageByRegex = /dall-e|imagen|agnes-image|gemini.*image|gpt-image|qwen-image|flux|kolors|seedream|stable|image|^wan|wanx|z-image|zimage|kling|vidu/i.test(model)
      if (mode === 'text' && isImageByRegex) continue
      if (mode === 'image' && !isImageByRegex) continue
    }
    seen.add(model)
    const vendorLabel = config.name || config.vendorLabel || config.vendor
    const alias = aliasOf(config, model)
    const capSuffix = cap && cap !== 'auto' ? ` · ${cap === 'image' ? '生图' : cap === 'vision' ? '理解' : '文本'}` : ''
    allModels.push({
      value: model,
      label: alias ? `${alias} (${model})${capSuffix}` : `${model} (${vendorLabel})${capSuffix}`,
      configId: config.id
    })
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
