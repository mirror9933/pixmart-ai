import { create } from 'zustand'
import type { Project, ProjectParams, ProjectCategory, ProjectStatus } from '../types/project'

interface ProjectState {
  projects: Project[]
  selectedProject: Project | null
  selectedIds: string[]
  filters: ProjectParams
  loading: boolean
  error: string | null

  fetchProjects: (params?: ProjectParams) => Promise<void>
  createProject: (data: Partial<Project>) => Promise<Project>
  updateProject: (id: string, data: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  deleteSelected: () => Promise<void>
  setFilter: (key: keyof ProjectParams, value: any) => void
  setSearch: (search: string) => void
  selectProject: (project: Project | null) => void
  toggleSelect: (id: string) => void
  selectAll: () => void
  clearSelection: () => void
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedProject: null,
  selectedIds: [],
  filters: {},
  loading: false,
  error: null,

  fetchProjects: async (params?: ProjectParams) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.projects.getAll(params || get().filters)
      set({ projects: result, loading: false })
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  createProject: async (data: Partial<Project>) => {
    set({ loading: true, error: null })
    try {
      const project = await window.api.projects.create(data)
      set((state) => ({ projects: [project, ...state.projects], loading: false }))
      return project
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
      throw error
    }
  },

  updateProject: async (id: string, data: Partial<Project>) => {
    set({ loading: true, error: null })
    try {
      const updated = await window.api.projects.update(id, data)
      set((state) => ({
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        selectedProject: state.selectedProject?.id === id ? updated : state.selectedProject,
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  deleteProject: async (id: string) => {
    set({ loading: true, error: null })
    try {
      await window.api.projects.delete(id)
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        selectedProject: state.selectedProject?.id === id ? null : state.selectedProject,
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  deleteSelected: async () => {
    const { selectedIds } = get()
    if (selectedIds.length === 0) return
    set({ loading: true, error: null })
    try {
      await window.api.projects.deleteMany(selectedIds)
      set((state) => ({
        projects: state.projects.filter((p) => !selectedIds.includes(p.id)),
        selectedIds: [],
        loading: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, loading: false })
    }
  },

  setFilter: (key, value) => {
    set((state) => ({ filters: { ...state.filters, [key]: value } }))
  },

  setSearch: (search: string) => {
    set((state) => ({ filters: { ...state.filters, search } }))
  },

  selectProject: (project) => set({ selectedProject: project }),

  toggleSelect: (id) => {
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((i) => i !== id)
        : [...state.selectedIds, id],
    }))
  },

  selectAll: () => {
    set((state) => ({ selectedIds: state.projects.map((p) => p.id) }))
  },

  clearSelection: () => set({ selectedIds: [] }),
}))
