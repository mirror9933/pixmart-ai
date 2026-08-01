import fs from 'fs'
import path from 'path'
import { app } from 'electron'

enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private logFile: string | null = null
  private level: LogLevel = LogLevel.DEBUG

  private getLogFile(): string {
    if (!this.logFile) {
      const logsDir = path.join(app.getPath('userData'), 'logs')
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true })
      }
      const date = new Date().toISOString().split('T')[0]
      this.logFile = path.join(logsDir, `pixmart-${date}.log`)
    }
    return this.logFile
  }

  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString()
    const formattedArgs = args.length > 0
      ? ' ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
      : ''
    return `[${timestamp}] [${level}] ${message}${formattedArgs}`
  }

  private write(level: LogLevel, levelStr: string, message: string, ...args: unknown[]): void {
    if (level < this.level) return

    const formatted = this.formatMessage(levelStr, message, ...args)

    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = level === LogLevel.ERROR ? 'error'
        : level === LogLevel.WARN ? 'warn'
        : 'log'
      console[consoleMethod](formatted)
    }

    try {
      fs.appendFileSync(this.getLogFile(), formatted + '\n')
    } catch {
      // ignore write errors
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.write(LogLevel.DEBUG, 'DEBUG', message, ...args)
  }

  info(message: string, ...args: unknown[]): void {
    this.write(LogLevel.INFO, 'INFO', message, ...args)
  }

  warn(message: string, ...args: unknown[]): void {
    this.write(LogLevel.WARN, 'WARN', message, ...args)
  }

  error(message: string, ...args: unknown[]): void {
    this.write(LogLevel.ERROR, 'ERROR', message, ...args)
  }

  setLevel(level: LogLevel): void {
    this.level = level
  }
}

export const logger = new Logger()
export { LogLevel }
