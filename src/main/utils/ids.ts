import crypto from 'crypto'

export function v4(): string {
  return crypto.randomUUID()
}
