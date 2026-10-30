import { readFileSync } from 'node:fs'
import { isPlainObject } from 'es-toolkit/compat'
import { UsageError } from './errors.js'

export const readJsonBody = (fromJson: string): Record<string, unknown> => {
  if (fromJson === '-' && process.stdin.isTTY) {
    throw new UsageError('--from-json -: no input on stdin. Pipe a file or use a path instead', {
      code: 'missing_input',
      param: 'from-json',
    })
  }

  let raw: string
  try {
    raw = fromJson === '-' ? readFileSync(0, 'utf-8') : readFileSync(fromJson, 'utf-8')
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      throw new UsageError(`--from-json: file '${fromJson}' not found`, {
        code: 'file_not_found',
        param: 'from-json',
      })
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new UsageError(`--from-json: invalid JSON${fromJson !== '-' ? ` in ${fromJson}` : ''}`, {
      code: 'invalid_json',
      param: 'from-json',
    })
  }

  if (!isPlainObject(parsed)) {
    throw new UsageError('--from-json must contain a JSON object', {
      code: 'invalid_json',
      param: 'from-json',
    })
  }

  return parsed as Record<string, unknown>
}
