import { create } from 'zustand'

interface LogViewerState {
  open: boolean
  openLogViewer: () => void
  closeLogViewer: () => void
  toggleLogViewer: () => void
}

export const useLogViewerStore = create<LogViewerState>((set) => ({
  open: false,
  openLogViewer: () => set({ open: true }),
  closeLogViewer: () => set({ open: false }),
  toggleLogViewer: () => set((s) => ({ open: !s.open })),
}))
