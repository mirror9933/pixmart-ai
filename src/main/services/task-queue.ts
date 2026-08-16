import { logger } from '../utils/logger'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Task {
  id: string
  projectId: string
  type: 'generate' | 'analyze' | 'write'
  status: TaskStatus
  progress: number
  result?: unknown
  error?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export type TaskCallback = (task: Task) => void

class TaskQueue {
  private tasks: Map<string, Task> = new Map()
  private queue: string[] = []
  private runningCount = 0
  /** 并发上限:4(避免触发 API QPS 限流) */
  private maxConcurrent = 4
  private taskHandlers: Map<string, () => Promise<unknown>> = new Map()
  private listeners: Set<TaskCallback> = new Set()

  setMaxConcurrent(max: number): void {
    this.maxConcurrent = max
    this.processQueue()
  }

  onTaskUpdate(callback: TaskCallback): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  private notifyListeners(task: Task): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...task })
      } catch (error) {
        logger.error('Task listener error:', error)
      }
    }
  }

  private updateTask(id: string, updates: Partial<Task>): void {
    const task = this.tasks.get(id)
    if (!task) return

    Object.assign(task, updates)
    this.notifyListeners(task)
  }

  addTask(
    projectId: string,
    type: Task['type'],
    handler: () => Promise<unknown>
  ): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const task: Task = {
      id,
      projectId,
      type,
      status: 'pending',
      progress: 0,
      createdAt: Date.now()
    }

    this.tasks.set(id, task)
    this.taskHandlers.set(id, handler)
    this.queue.push(id)

    logger.info(`Task added: ${id} (${type}) for project ${projectId}`)
    this.processQueue()

    return id
  }

  cancelTask(id: string): boolean {
    const task = this.tasks.get(id)
    if (!task) return false

    if (task.status === 'pending') {
      this.queue = this.queue.filter(qid => qid !== id)
      this.updateTask(id, { status: 'cancelled' })
      this.taskHandlers.delete(id)
      return true
    }

    if (task.status === 'running') {
      this.updateTask(id, { status: 'cancelled' })
      this.runningCount--
      this.processQueue()
      return true
    }

    return false
  }

  private async processQueue(): Promise<void> {
    while (this.runningCount < this.maxConcurrent && this.queue.length > 0) {
      const taskId = this.queue.shift()
      if (!taskId) break

      const task = this.tasks.get(taskId)
      const handler = this.taskHandlers.get(taskId)

      if (!task || !handler || task.status === 'cancelled') {
        this.taskHandlers.delete(taskId)
        continue
      }

      this.runningCount++
      this.updateTask(taskId, {
        status: 'running',
        startedAt: Date.now()
      })

      this.executeTask(taskId, handler)
    }
  }

  private async executeTask(taskId: string, handler: () => Promise<unknown>): Promise<void> {
    try {
      const result = await handler()
      const task = this.tasks.get(taskId)

      if (task?.status === 'cancelled') {
        this.runningCount--
        this.processQueue()
        return
      }

      this.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result,
        completedAt: Date.now()
      })

      logger.info(`Task completed: ${taskId}`)
    } catch (error) {
      const task = this.tasks.get(taskId)

      if (task?.status === 'cancelled') {
        this.runningCount--
        this.processQueue()
        return
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.updateTask(taskId, {
        status: 'failed',
        error: errorMessage,
        completedAt: Date.now()
      })

      logger.error(`Task failed: ${taskId}`, error)
    } finally {
      this.runningCount--
      this.taskHandlers.delete(taskId)
      this.processQueue()
    }
  }

  updateProgress(id: string, progress: number): void {
    this.updateTask(id, { progress })
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id)
  }

  getTasksByProject(projectId: string): Task[] {
    return Array.from(this.tasks.values())
      .filter(t => t.projectId === projectId)
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  getPendingCount(): number {
    return this.queue.length
  }

  getRunningCount(): number {
    return this.runningCount
  }

  clearCompleted(): void {
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        this.tasks.delete(id)
      }
    }
  }
}

export const taskQueue = new TaskQueue()
