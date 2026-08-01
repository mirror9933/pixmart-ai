export const IPC_CHANNELS = {
  PROJECTS: {
    GET_ALL: 'projects:getAll',
    GET_BY_ID: 'projects:getById',
    CREATE: 'projects:create',
    UPDATE: 'projects:update',
    DELETE: 'projects:delete',
    DELETE_MANY: 'projects:deleteMany',
    GET_STATS: 'projects:getStats',
  },
  SETTINGS: {
    GET_ALL: 'settings:getAll',
    GET: 'settings:get',
    SET: 'settings:set',
    SET_MANY: 'settings:setMany',
  },
  MODELS: {
    GET_ALL: 'models:getAll',
    CREATE: 'models:create',
    UPDATE: 'models:update',
    DELETE: 'models:delete',
    TEST_CONNECTION: 'models:testConnection',
    FETCH_MODELS: 'models:fetchModels',
  },
  FILES: {
    SELECT_IMAGES: 'files:selectImages',
    SAVE_IMAGE: 'files:saveImage',
    GET_IMAGE_PATH: 'files:getImagePath',
    OPEN_PATH: 'files:openPath',
    SELECT_DIRECTORY: 'files:selectDirectory',
    EXPORT_IMAGES: 'files:exportImages',
  },
  AI: {
    ANALYZE_PRODUCT: 'ai:analyzeProduct',
    GENERATE_IMAGES: 'ai:generateImages',
    AI_WRITE: 'ai:aiWrite',
  },
} as const

export const APP_NAME = 'Pixmart AI'
export const APP_VERSION = '1.0.0'

export const BRAND_COLOR = '#c96442'

export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const

export const VENDORS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  OPENROUTER: 'openrouter',
  CUSTOM: 'custom',
} as const

export const PROJECT_CATEGORIES = {
  PRODUCT: 'product',
  LIFESTYLE: 'lifestyle',
  STUDIO: 'studio',
  CREATIVE: 'creative',
} as const

export const PROJECT_STATUS = {
  DRAFT: 'draft',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
} as const

export const DEFAULT_SETTINGS = {
  theme: 'system',
  language: 'en',
  autoSave: true,
  maxConcurrentJobs: 3,
  imageQuality: 'high',
} as const
