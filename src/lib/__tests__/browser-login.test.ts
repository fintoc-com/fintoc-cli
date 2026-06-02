import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  BrowserLoginError,
  buildAuthorizeUrl,
  parseCallback,
  startBrowserLogin,
} from '../browser-login.js'
import { DASHBOARD_ORIGIN } from '../constants.js'

vi.mock('../browser.js', () => ({
  openInBrowser: vi.fn(async () => {}),
}))

type RunOptions = {
  mode?: 'test' | 'live'
  timeoutMs?: number
}

const runWithCallback = async (
  options: RunOptions,
  request: (callbackUrl: string, state: string) => Promise<Response>,
) => {
  const session = await startBrowserLogin({
    mode: options.mode ?? 'test',
    timeoutMs: options.timeoutMs,
  })

  const parsed = new URL(session.url)
  const callbackUrl = parsed.searchParams.get('callback') ?? ''
  const state = parsed.searchParams.get('state') ?? ''

  setImmediate(() => {
    request(callbackUrl, state).catch(() => {})
  })

  return session.result
}

const postCallback = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: DASHBOARD_ORIGIN, ...headers },
    body: JSON.stringify(body),
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildAuthorizeUrl', () => {
  test('includes all required query params', () => {
    const url = buildAuthorizeUrl({
      mode: 'live',
      state: 'abc123',
      callback: 'http://127.0.0.1:5555/callback',
      suggestedName: 'my-host-cli',
    })

    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://dashboard.fintoc.com/cli/authorize')
    expect(parsed.searchParams.get('mode')).toBe('live')
    expect(parsed.searchParams.get('state')).toBe('abc123')
    expect(parsed.searchParams.get('callback')).toBe('http://127.0.0.1:5555/callback')
    expect(parsed.searchParams.get('suggested_name')).toBe('my-host-cli')
    expect(parsed.searchParams.get('suggested_expiration')).toBe('90d')
  })
})

describe('parseCallback', () => {
  const state = 'a'.repeat(64)
  const otherState = 'b'.repeat(64)

  describe('when body is not an object', () => {
    test('returns invalid', () => {
      expect(parseCallback(null, state, 'test')).toEqual({ kind: 'invalid' })
      expect(parseCallback('foo', state, 'test')).toEqual({ kind: 'invalid' })
    })
  })

  describe('when state does not match', () => {
    test('returns invalid even with otherwise valid fields', () => {
      expect(
        parseCallback(
          { state: otherState, secret: 'sk', organization_name: 'A', mode: 'test' },
          state,
          'test',
        ),
      ).toEqual({ kind: 'invalid' })
    })
  })

  describe('when payload has an access_denied error', () => {
    test('returns denied', () => {
      expect(parseCallback({ state, error: 'access_denied' }, state, 'test')).toEqual({
        kind: 'denied',
      })
    })
  })

  describe('when required fields are missing or wrong type', () => {
    test('returns invalid', () => {
      expect(parseCallback({ state, secret: 'sk', organization_name: 'A' }, state, 'test')).toEqual(
        { kind: 'invalid' },
      )
      expect(
        parseCallback({ state, secret: 1, organization_name: 'A', mode: 'test' }, state, 'test'),
      ).toEqual({ kind: 'invalid' })
    })
  })

  describe('when mode differs from expected', () => {
    test('returns mismatch with the actual mode', () => {
      expect(
        parseCallback({ state, secret: 'sk', organization_name: 'A', mode: 'test' }, state, 'live'),
      ).toEqual({ kind: 'mismatch', actual: 'test' })
    })
  })

  describe('when payload is valid', () => {
    test('returns ok with full result', () => {
      expect(
        parseCallback(
          {
            state,
            secret: 'sk_test_abc',
            organization_name: 'Acme',
            mode: 'test',
            key_name: 'my-cli',
            expires_at: '2026-01-01',
          },
          state,
          'test',
        ),
      ).toEqual({
        kind: 'ok',
        result: {
          secret: 'sk_test_abc',
          organizationName: 'Acme',
          mode: 'test',
          keyName: 'my-cli',
          expiresAt: '2026-01-01',
        },
      })
    })

    test('leaves keyName and expiresAt undefined when omitted', () => {
      const outcome = parseCallback(
        { state, secret: 'sk', organization_name: 'A', mode: 'test' },
        state,
        'test',
      )
      expect(outcome).toEqual({
        kind: 'ok',
        result: {
          secret: 'sk',
          organizationName: 'A',
          mode: 'test',
          keyName: undefined,
          expiresAt: undefined,
        },
      })
    })
  })
})

describe('startBrowserLogin', () => {
  describe('when the dashboard POSTs a valid test-mode payload', () => {
    test('resolves with the authorize result', async () => {
      const result = await runWithCallback({ mode: 'test' }, (callback, state) =>
        postCallback(callback, {
          state,
          secret: 'sk_test_abc',
          organization_name: 'Acme Corp',
          mode: 'test',
        }),
      )

      expect(result).toEqual({
        secret: 'sk_test_abc',
        organizationName: 'Acme Corp',
        mode: 'test',
        keyName: undefined,
        expiresAt: undefined,
      })
    })
  })

  describe('when the dashboard POSTs a valid live-mode payload', () => {
    test('includes key_name and expires_at', async () => {
      const result = await runWithCallback({ mode: 'live' }, (callback, state) =>
        postCallback(callback, {
          state,
          secret: 'sk_live_xyz',
          organization_name: 'Acme Corp',
          mode: 'live',
          key_name: 'my-mac-cli',
          expires_at: '2026-08-16T12:00:00Z',
        }),
      )

      expect(result.keyName).toBe('my-mac-cli')
      expect(result.expiresAt).toBe('2026-08-16T12:00:00Z')
    })
  })

  describe('when the dashboard POSTs access_denied', () => {
    test('rejects with reason denied', async () => {
      const err = await runWithCallback({ mode: 'test' }, (callback, state) =>
        postCallback(callback, { state, error: 'access_denied' }),
      ).catch((e) => e)

      expect(err).toBeInstanceOf(BrowserLoginError)
      expect(err.reason).toBe('denied')
    })
  })

  describe('when the state does not match', () => {
    test('returns 400 and keeps waiting for a valid callback', async () => {
      let badStatus = 0
      const result = await runWithCallback({ mode: 'test' }, async (callback, state) => {
        const badRes = await postCallback(callback, {
          state: 'wrong-state',
          secret: 'sk_test_abc',
          organization_name: 'Acme',
          mode: 'test',
        })
        badStatus = badRes.status
        return postCallback(callback, {
          state,
          secret: 'sk_test_abc',
          organization_name: 'Acme',
          mode: 'test',
        })
      })

      expect(badStatus).toBe(400)
      expect(result.secret).toBe('sk_test_abc')
    })
  })

  describe('when the Origin header is wrong', () => {
    test('returns 403', async () => {
      let badStatus = 0
      await runWithCallback({ mode: 'test' }, async (callback, state) => {
        const badRes = await postCallback(
          callback,
          { state, secret: 'sk', organization_name: 'A', mode: 'test' },
          { Origin: 'https://evil.com' },
        )
        badStatus = badRes.status
        return postCallback(callback, {
          state,
          secret: 'sk_test_ok',
          organization_name: 'Acme',
          mode: 'test',
        })
      })

      expect(badStatus).toBe(403)
    })
  })

  describe('when an OPTIONS preflight is received', () => {
    test('responds 204 with CORS headers', async () => {
      let preflight: Response | null = null
      await runWithCallback({ mode: 'test' }, async (callback, state) => {
        preflight = await fetch(callback, {
          method: 'OPTIONS',
          headers: {
            Origin: DASHBOARD_ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type',
          },
        })
        return postCallback(callback, {
          state,
          secret: 'sk_test_ok',
          organization_name: 'Acme',
          mode: 'test',
        })
      })

      expect(preflight!.status).toBe(204)
      expect(preflight!.headers.get('access-control-allow-origin')).toBe(DASHBOARD_ORIGIN)
      expect(preflight!.headers.get('access-control-allow-methods')).toContain('POST')
    })
  })

  describe('when no callback arrives before timeout', () => {
    test('rejects with reason timeout', async () => {
      const session = await startBrowserLogin({
        mode: 'test',
        timeoutMs: 50,
      })

      const err = await session.result.catch((e) => e)
      expect(err).toBeInstanceOf(BrowserLoginError)
      expect(err.reason).toBe('timeout')
    })
  })

  describe('when the response mode does not match the request', () => {
    test('rejects with reason mismatch', async () => {
      const err = await runWithCallback({ mode: 'live' }, (callback, state) =>
        postCallback(callback, {
          state,
          secret: 'sk_test_x',
          organization_name: 'Acme',
          mode: 'test',
        }),
      ).catch((e) => e)

      expect(err).toBeInstanceOf(BrowserLoginError)
      expect(err.reason).toBe('mismatch')
    })
  })
})
