export type SettingValue = string | number | boolean | null

export interface SettingsMap {
  theme: 'light' | 'dark' | 'system'
  language: string
  animation: string
  autoSave: boolean
  maxConcurrentJobs: number
  imageQuality: 'low' | 'medium' | 'high'
  defaultModel?: string
  exportFormat?: 'png' | 'jpg' | 'webp'
  exportQuality?: number
  [key: string]: SettingValue | undefined
}
