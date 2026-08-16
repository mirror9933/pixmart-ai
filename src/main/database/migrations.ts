import type { Database as SqlJsDatabase } from 'sql.js'
import { logger } from '../utils/logger'

const DEMO_PROJECTS = [
  {
    id: 'demo-001',
    title: '夏季清凉饮品海报',
    category: 'food',
    category_label: '美食饮品',
    status: 'completed',
    status_label: '已完成',
    image_count: 4,
    description: '为夏季新品清凉饮品系列设计电商主图，风格清新自然，突出冰凉感',
    params: JSON.stringify({ quality: '2K 高清', style: '写实摄影', aspectRatio: '1:1' }),
    source_images: JSON.stringify([]),
    output_images: JSON.stringify(['summer_drink_1.png', 'summer_drink_2.png', 'summer_drink_3.png', 'summer_drink_4.png']),
    preview_color: '#06b6d4',
    points: 120,
    error_message: null,
    created_at: '2026-07-20 10:30:00',
    updated_at: '2026-07-20 11:45:00'
  },
  {
    id: 'demo-002',
    title: '智能手表产品展示',
    category: 'electronics',
    category_label: '数码电子',
    status: 'processing',
    status_label: '生成中',
    image_count: 0,
    description: '为新款智能手表设计多角度产品展示图，科技感强，深色背景',
    params: JSON.stringify({ quality: '4K 超清', style: '3D渲染', aspectRatio: '16:9' }),
    source_images: JSON.stringify(['watch_source_1.jpg']),
    output_images: JSON.stringify([]),
    preview_color: '#8b5cf6',
    points: 0,
    error_message: null,
    created_at: '2026-07-22 14:00:00',
    updated_at: '2026-07-22 14:30:00'
  },
  {
    id: 'demo-003',
    title: '护肤品套装详情页',
    category: 'beauty',
    category_label: '美妆护肤',
    status: 'failed',
    status_label: '失败',
    image_count: 0,
    description: '为高端护肤品套装设计详情页配图，优雅质感，浅色系背景',
    params: JSON.stringify({ quality: '2K 高清', style: '柔光摄影', aspectRatio: '3:4' }),
    source_images: JSON.stringify(['skincare_1.jpg', 'skincare_2.jpg']),
    output_images: JSON.stringify([]),
    preview_color: '#ec4899',
    points: 0,
    error_message: 'API 调用超时，请检查网络连接后重试',
    created_at: '2026-07-21 09:15:00',
    updated_at: '2026-07-21 09:50:00'
  }
]

export function runMigrations(db: SqlJsDatabase): void {
  logger.info('Running database migrations...')

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      category_label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      status_label TEXT NOT NULL DEFAULT '待处理',
      image_count INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      params TEXT NOT NULL DEFAULT '{}',
      source_images TEXT NOT NULL DEFAULT '[]',
      output_images TEXT NOT NULL DEFAULT '[]',
      preview_color TEXT NOT NULL DEFAULT '#6366f1',
      points INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS model_configs (
      id TEXT PRIMARY KEY,
      vendor TEXT NOT NULL,
      vendor_label TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      protocol TEXT NOT NULL DEFAULT 'openai',
      org_id TEXT NOT NULL DEFAULT '',
      headers TEXT NOT NULL DEFAULT '{}',
      timeout INTEGER NOT NULL DEFAULT 0,
      model_meta TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'untested',
      latency INTEGER NOT NULL DEFAULT 0,
      tested_at TEXT,
      models TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // 兼容旧库：为已存在的 model_configs 表补充 protocol 列
  try {
    db.exec(`ALTER TABLE model_configs ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openai'`)
  } catch {}

  // 兼容旧库：补充高级配置列（组织ID/自定义请求头/请求超时/模型级元数据）
  try {
    db.exec(`ALTER TABLE model_configs ADD COLUMN org_id TEXT NOT NULL DEFAULT ''`)
  } catch {}
  try {
    db.exec(`ALTER TABLE model_configs ADD COLUMN headers TEXT NOT NULL DEFAULT '{}'`)
  } catch {}
  try {
    db.exec(`ALTER TABLE model_configs ADD COLUMN timeout INTEGER NOT NULL DEFAULT 0`)
  } catch {}
  try {
    db.exec(`ALTER TABLE model_configs ADD COLUMN model_meta TEXT NOT NULL DEFAULT '{}'`)
  } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_model_configs_vendor ON model_configs(vendor)
  `)

  const defaultSettings: Record<string, string> = {
    theme: 'light',
    language: '简体中文',
    font_size: '默认',
    animation: 'true',
    default_quality: '2K 高清',
    dev_mode: 'false'
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value])
  }

  const projectCountResult = db.exec('SELECT COUNT(*) as count FROM projects')
  const projectCount = projectCountResult.length > 0 ? projectCountResult[0].values[0][0] as number : 0
  
  if (projectCount === 0) {
    for (const project of DEMO_PROJECTS) {
      db.run(`
        INSERT INTO projects (id, title, category, category_label, status, status_label, image_count, description, params, source_images, output_images, preview_color, points, error_message, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        project.id,
        project.title,
        project.category,
        project.category_label,
        project.status,
        project.status_label,
        project.image_count,
        project.description,
        project.params,
        project.source_images,
        project.output_images,
        project.preview_color,
        project.points,
        project.error_message,
        project.created_at,
        project.updated_at
      ])
    }
    logger.info(`Inserted ${DEMO_PROJECTS.length} demo projects`)
  }

  logger.info('Database migrations completed')
}
