import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Buffer } from 'node:buffer'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { hostname } from 'node:os'
import { z } from 'zod'
import { openInBrowser } from './browser.js'
import {
  BROWSER_LOGIN_SUGGESTED_EXPIRATION,
  BROWSER_LOGIN_TIMEOUT_MS,
  DASHBOARD_AUTHORIZE_URL,
  DASHBOARD_ORIGIN,
} from './constants.js'

export type BrowserLoginMode = 'test' | 'live'

export type BrowserLoginResult = {
  secret: string
  organizationName: string
  mode: BrowserLoginMode
  keyName?: string
  expiresAt?: string
}

export type BrowserLoginOptions = {
  mode: BrowserLoginMode
  timeoutMs?: number
}

export type BrowserLoginSession = {
  url: string
  result: Promise<BrowserLoginResult>
  cancel: () => void
}

export type BrowserLoginErrorReason = 'denied' | 'timeout' | 'mismatch'

export class BrowserLoginError extends Error {
  reason: BrowserLoginErrorReason

  constructor(reason: BrowserLoginErrorReason, message: string) {
    super(message)
    this.name = 'BrowserLoginError'
    this.reason = reason
  }
}

const MAX_BODY_BYTES = 64 * 1024

const sanitizeHostname = (name: string) => {
  const cleaned = name
    .toLowerCase()
    .replace(/\.local$/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'unknown'
}

const getSuggestedName = () => `${sanitizeHostname(hostname())}-cli`

export const buildAuthorizeUrl = ({
  mode,
  state,
  callback,
  suggestedName,
}: {
  mode: BrowserLoginMode
  state: string
  callback: string
  suggestedName: string
}) => {
  const url = new URL(DASHBOARD_AUTHORIZE_URL)
  url.searchParams.set('mode', mode)
  url.searchParams.set('state', state)
  url.searchParams.set('callback', callback)
  url.searchParams.set('suggested_name', suggestedName)
  url.searchParams.set('suggested_expiration', BROWSER_LOGIN_SUGGESTED_EXPIRATION)
  return url.toString()
}

const isValidState = (received: unknown, expected: string) => {
  if (typeof received !== 'string' || received.length !== expected.length) {
    return false
  }
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

const readJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    total += buf.length
    if (total > MAX_BODY_BYTES) {
      throw new Error('Body too large')
    }
    chunks.push(buf)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'))
}

const setCorsHeaders = (res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', DASHBOARD_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
}

const respond = (res: ServerResponse, status: number) => {
  res.writeHead(status)
  res.end()
}

export type CallbackOutcome =
  | { kind: 'invalid' }
  | { kind: 'denied' }
  | { kind: 'mismatch'; actual: string }
  | { kind: 'ok'; result: BrowserLoginResult }

const deniedPayloadSchema = z.object({
  state: z.string(),
  error: z.literal('access_denied'),
})

const successPayloadSchema = z.object({
  state: z.string(),
  secret: z.string(),
  organization_name: z.string(),
  mode: z.string(),
  key_name: z.string().optional(),
  expires_at: z.string().optional(),
})

const callbackPayloadSchema = z.union([deniedPayloadSchema, successPayloadSchema])

export const parseCallback = (
  body: unknown,
  expectedState: string,
  expectedMode: BrowserLoginMode,
): CallbackOutcome => {
  const parsed = callbackPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return { kind: 'invalid' }
  }

  const data = parsed.data
  if (!isValidState(data.state, expectedState)) {
    return { kind: 'invalid' }
  }

  if ('error' in data) {
    return { kind: 'denied' }
  }

  if (data.mode !== expectedMode) {
    return { kind: 'mismatch', actual: data.mode }
  }

  return {
    kind: 'ok',
    result: {
      secret: data.secret,
      organizationName: data.organization_name,
      mode: expectedMode,
      keyName: data.key_name,
      expiresAt: data.expires_at,
    },
  }
}

const startServer = (): Promise<{ server: Server; port: number; callbackUrl: string }> =>
  new Promise((resolve, reject) => {
    const server = createServer()
    const onError = (err: Error) => reject(err)
    server.once('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      const { port } = server.address() as AddressInfo
      resolve({ server, port, callbackUrl: `http://127.0.0.1:${port}/callback` })
    })
  })

export const startBrowserLogin = async (
  options: BrowserLoginOptions,
): Promise<BrowserLoginSession> => {
  const timeoutMs = options.timeoutMs ?? BROWSER_LOGIN_TIMEOUT_MS
  const state = randomBytes(32).toString('hex')
  const { server, port, callbackUrl } = await startServer()
  const url = buildAuthorizeUrl({
    mode: options.mode,
    state,
    callback: callbackUrl,
    suggestedName: getSuggestedName(),
  })

  const { promise: baseResult, resolve, reject } = Promise.withResolvers<BrowserLoginResult>()

  const timeout = setTimeout(() => {
    reject(new BrowserLoginError('timeout', 'Timed out waiting for authorization'))
  }, timeoutMs)
  timeout.unref()

  const cancel = () => reject(new Error('Browser login cancelled'))

  const result = baseResult.finally(() => {
    clearTimeout(timeout)
    server.close()
    setImmediate(() => server.closeAllConnections())
  })

  server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    if (req.headers.host !== `127.0.0.1:${port}`) {
      respond(res, 400)
      return
    }
    let reqUrl: URL
    try {
      reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
    } catch {
      respond(res, 400)
      return
    }
    if (reqUrl.pathname !== '/callback') {
      respond(res, 404)
      return
    }
    if (req.headers.origin !== DASHBOARD_ORIGIN) {
      respond(res, 403)
      return
    }

    setCorsHeaders(res)

    if (req.method === 'OPTIONS') {
      respond(res, 204)
      return
    }

    if (req.method !== 'POST') {
      respond(res, 405)
      return
    }

    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      respond(res, 400)
      return
    }

    const outcome = parseCallback(body, state, options.mode)
    switch (outcome.kind) {
      case 'invalid':
        respond(res, 400)
        return
      case 'denied':
        respond(res, 204)
        reject(new BrowserLoginError('denied', 'Authorization was denied in the browser'))
        return
      case 'mismatch':
        respond(res, 204)
        reject(
          new BrowserLoginError(
            'mismatch',
            `Dashboard returned mode '${outcome.actual}' but expected '${options.mode}'`,
          ),
        )
        return
      case 'ok':
        respond(res, 204)
        resolve(outcome.result)
        return
      default:
        outcome satisfies never
    }
  })

  openInBrowser(url).catch(() => {})

  return { url, result, cancel }
}
