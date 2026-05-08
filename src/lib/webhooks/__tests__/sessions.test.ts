import { afterEach, describe, expect, test, vi } from 'vitest'
import { createCliSession } from '../sessions.js'

vi.mock('../../version.js', () => ({
  getCliVersion: vi.fn(() => '0.1.1'),
}))

describe('CLI webhook sessions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('creates a session for all webhook events', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'clisess_123',
          object: 'cli_session',
          websocket_url: 'wss://api.fintoc.com/cable',
          websocket_id: 'ws_123',
          secret: 'a'.repeat(128),
          webhook_secret: 'whsec_test_123',
          expires_at: '2026-01-01T00:00:00.000Z',
        }),
        { status: 201 },
      ),
    )

    const session = await createCliSession({
      secretKey: 'sk_test_123',
      streamType: 'webhook_event',
    })

    expect(session).toMatchObject({
      id: 'clisess_123',
      websocket_url: 'wss://api.fintoc.com/cable',
      websocket_id: 'ws_123',
      secret: 'a'.repeat(128),
      webhook_secret: 'whsec_test_123',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/internal\/v1\/cli\/sessions$/),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'sk_test_123' }),
        body: JSON.stringify({ stream_type: 'webhook_event' }),
      }),
    )
  })

  test('accepts sessions without a webhook secret', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'clisess_123',
          websocket_url: 'wss://api.fintoc.com/cable',
          websocket_id: 'ws_123',
          secret: 'a'.repeat(128),
        }),
        { status: 201 },
      ),
    )

    const session = await createCliSession({
      secretKey: 'sk_test_123',
      streamType: 'webhook_event',
    })

    expect(session).not.toHaveProperty('webhook_secret')
  })

  test('rejects invalid session responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'clisess_123',
          websocket_url: 'https://api.fintoc.com/cable',
          websocket_id: 'ws_123',
          secret: 'a'.repeat(128),
        }),
        { status: 201 },
      ),
    )

    await expect(
      createCliSession({
        secretKey: 'sk_test_123',
        streamType: 'webhook_event',
      }),
    ).rejects.toThrow('Invalid CLI session response')
  })
})
