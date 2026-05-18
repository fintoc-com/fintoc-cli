import { readFileSync } from 'node:fs'
import { isPlainObject } from 'es-toolkit/compat'
import { error } from './output.js'

export const readJsonBody = (fromJson: string): Record<string, unknown> => {
  if (fromJson === '-' && process.stdin.isTTY) {
    error('--from-json -: no input on stdin. Pipe a file or use a path instead')
    process.exit(1)
  }

  let raw: string
  try {
    raw = fromJson === '-' ? readFileSync(0, 'utf-8') : readFileSync(fromJson, 'utf-8')
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      error(`--from-json: file '${fromJson}' not found`)
      process.exit(1)
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    error(`--from-json: invalid JSON${fromJson !== '-' ? ` in ${fromJson}` : ''}`)
    process.exit(1)
  }

  if (!isPlainObject(parsed)) {
    error('--from-json must contain a JSON object')
    process.exit(1)
  }

  return parsed as Record<string, unknown>
}
