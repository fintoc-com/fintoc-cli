import { API_HOST } from './constants.js'
import { getCliVersion } from './version.js'

type ApiRequestOptions = {
  method: 'GET' | 'POST'
  secretKey: string
  body?: Record<string, unknown>
  signal?: AbortSignal
}

const apiBaseUrl = () => {
  if (API_HOST.includes('localhost')) {
    return `http://${API_HOST}`
  }
  return `https://${API_HOST}`
}

export const apiUrl = (path: string) => new URL(path, apiBaseUrl()).toString()

export const apiRequest = async (path: string, options: ApiRequestOptions): Promise<unknown> => {
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method: options.method,
      signal: options.signal,
      headers: {
        Authorization: options.secretKey,
        'Content-Type': 'application/json',
        'User-Agent': `fintoc-cli/${getCliVersion()}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
  } catch (err) {
    if (err instanceof Error) {
      ;(err as Error & { code?: string }).code = 'ERR_NETWORK'
    }
    throw err
  }

  if (response.status === 204) {
    return undefined
  }

  const data = (await response.json().catch(() => ({}))) as unknown
  if (!response.ok) {
    const err = new Error(response.statusText || 'API request failed') as Error & {
      response?: { data?: unknown }
    }
    err.response = { data }
    throw err
  }

  return data
}
