import { contextBridge, ipcRenderer } from 'electron'

const api = {
  projects: {
    getAll: (params?: any) => ipcRenderer.invoke('projects:getAll', params),
    getById: (id: string) => ipcRenderer.invoke('projects:getById', id),
    create: (data: any) => ipcRenderer.invoke('projects:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('projects:delete', id),
    deleteMany: (ids: string[]) => ipcRenderer.invoke('projects:deleteMany', ids),
    getStats: () => ipcRenderer.invoke('projects:getStats'),
  },
  settings: {
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('settings:set', key, value),
    setMany: (entries: Record<string, any>) => ipcRenderer.invoke('settings:setMany', entries),
  },
  models: {
    getAll: () => ipcRenderer.invoke('models:getAll'),
    create: (data: any) => ipcRenderer.invoke('models:create', data),
    update: (id: string, data: any) => ipcRenderer.invoke('models:update', id, data),
    delete: (id: string) => ipcRenderer.invoke('models:delete', id),
    testConnection: (id: string) => ipcRenderer.invoke('models:testConnection', id),
    fetchModels: (id: string, opts?: { persist?: boolean }) => ipcRenderer.invoke('models:fetchModels', id, opts),
    clearAll: () => ipcRenderer.invoke('models:clearAll'),
    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('models:changed', handler)
      return () => { ipcRenderer.removeListener('models:changed', handler) }
    },
  },
  files: {
    selectImages: () => ipcRenderer.invoke('files:selectImages'),
    saveImage: (data: any) => ipcRenderer.invoke('files:saveImage', data),
    saveImageFromDataUrl: (projectId: string, dataUrl: string) => ipcRenderer.invoke('files:saveImageFromDataUrl', projectId, dataUrl),
    saveToExports: (dataUrl: string) => ipcRenderer.invoke('files:saveToExports', dataUrl),
    getImagePath: (projectId: string, filename: string) => ipcRenderer.invoke('files:getImagePath', projectId, filename),
    getImageDataUrl: (projectId: string, relativePath: string) => ipcRenderer.invoke('files:getImageDataUrl', projectId, relativePath),
    openPath: (path: string) => ipcRenderer.invoke('files:openPath', path),
    selectDirectory: () => ipcRenderer.invoke('files:selectDirectory'),
    exportImages: (data: any) => ipcRenderer.invoke('files:exportImages', data),
    readAsDataUrl: (filePath: string) => ipcRenderer.invoke('files:readAsDataUrl', filePath),
    saveTempState: (key: string, data: any) => ipcRenderer.invoke('files:saveTempState', key, data),
    loadTempState: (key: string) => ipcRenderer.invoke('files:loadTempState', key),
    clearTempState: () => ipcRenderer.invoke('files:clearTempState'),
  },
  paths: {
    getAll: () => ipcRenderer.invoke('paths:getAll'),
    update: (key: string, newPath: string) => ipcRenderer.invoke('paths:update', key, newPath),
    selectDirectory: (title?: string) => ipcRenderer.invoke('paths:selectDirectory', title),
    openDirectory: (dirPath: string) => ipcRenderer.invoke('paths:openDirectory', dirPath),
    openExternal: (url: string) => ipcRenderer.invoke('paths:openExternal', url),
    resetToDefault: (key: string) => ipcRenderer.invoke('paths:resetToDefault', key),
    getLogs: () => ipcRenderer.invoke('paths:getLogs'),
    getLogFile: (filename: string) => ipcRenderer.invoke('paths:getLogFile', filename),
    clearLogs: () => ipcRenderer.invoke('paths:clearLogs'),
    exportLogs: () => ipcRenderer.invoke('paths:exportLogs'),
  },
  backup: {
    getConfig: () => ipcRenderer.invoke('backup:getConfig'),
    setConfig: (config: any) => ipcRenderer.invoke('backup:setConfig', config),
    export: () => ipcRenderer.invoke('backup:export'),
    import: () => ipcRenderer.invoke('backup:import'),
  },
  ai: {
    analyzeProduct: (data: any) => ipcRenderer.invoke('ai:analyzeProduct', data),
    generateImages: (data: any) => ipcRenderer.invoke('ai:generateImages', data),
    aiWrite: (data: any) => ipcRenderer.invoke('ai:aiWrite', data),
    getTaskStatus: (taskId: string) => ipcRenderer.invoke('ai:getTaskStatus', taskId),
    checkSize: (data: { model?: string; size?: string }) => ipcRenderer.invoke('ai:checkSize', data),
    onTaskUpdate: (callback: (task: any) => void) => {
      const handler = (_event: any, task: any) => callback(task)
      ipcRenderer.on('ai:taskUpdate', handler)
      return () => { ipcRenderer.removeListener('ai:taskUpdate', handler) }
    },
  },
  theme: {
    apply: (theme: string) => ipcRenderer.send('theme:apply', theme),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    getState: () => ipcRenderer.invoke('updater:getState'),
    onStatus: (callback: (status: any) => void) => {
      const handler = (_event: any, status: any) => callback(status)
      ipcRenderer.on('updater:status', handler)
      return () => { ipcRenderer.removeListener('updater:status', handler) }
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type PixmartAPI = typeof api
