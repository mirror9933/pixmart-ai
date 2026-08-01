export type ProjectCategory = 'product' | 'lifestyle' | 'studio' | 'creative'

export type ProjectStatus = 'draft' | 'processing' | 'done' | 'failed'

export interface Project {
  id: string
  name: string
  description: string
  category: ProjectCategory
  status: ProjectStatus
  images: string[]
  tags: string[]
  aiPrompt?: string
  aiResult?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface ProjectParams {
  page?: number
  limit?: number
  category?: ProjectCategory
  status?: ProjectStatus
  search?: string
  sortBy?: 'name' | 'createdAt' | 'updatedAt'
  sortOrder?: 'asc' | 'desc'
}
