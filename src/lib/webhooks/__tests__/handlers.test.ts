import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { printJson } from '../../output.js'
import { createWebhookRelayHandlers } from '../handlers.js'

vi.mock('../../output.js', () => ({
  printJson: vi.fn(),
}))

describe('webhook relay handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('pretty-prints the full event for webhook messages', async () => {
    const event = JSON.stringify({ id: 'evt_123' })
    const message = {
      type: 'webhook_event',
      event,
      signature: 'test_signature',
      event_type: 'payment_intent.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({}).webhook_event!(message)

    expect(printJson).toHaveBeenCalledWith({ id: 'evt_123' })
  })

  test('prints the full relay message in JSON mode', async () => {
    const message = {
      type: 'webhook_event',
      id: 'wem_123',
      status: 'pending',
      event: JSON.stringify({ id: 'evt_123' }),
      signature: 'test_signature',
      event_type: 'payment_intent.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({ json: true }).webhook_event!(message)

    expect(printJson).toHaveBeenCalledWith({ id: 'evt_123' })
  })

  test('forwards the raw event with the webhook signature', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const event = JSON.stringify({ id: 'evt_123' })
    const message = {
      type: 'webhook_event',
      event,
      signature: 'test_signature',
      event_type: 'payment_intent.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({
      forwardTo: 'https://example.test/webhooks',
    }).webhook_event!(message)

    expect(fetchMock).toHaveBeenCalledWith('https://example.test/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Fintoc-Signature': 'test_signature',
      },
      body: event,
    })
    expect(printJson).toHaveBeenCalledWith({ id: 'evt_123' })
  })

  test('handles events included in the event filter', async () => {
    const event = JSON.stringify({ id: 'evt_123', type: 'payment.succeeded' })
    const message = {
      type: 'webhook_event',
      event,
      signature: 'test_signature',
      event_type: 'payment.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({ events: ['payment.succeeded'] }).webhook_event!(message)

    expect(printJson).toHaveBeenCalledWith({
      id: 'evt_123',
      type: 'payment.succeeded',
    })
  })

  test('skips events not included in the event filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const message = {
      type: 'webhook_event',
      event: JSON.stringify({ id: 'evt_123', type: 'payment.failed' }),
      signature: 'test_signature',
      event_type: 'payment.failed',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({
      events: ['payment.succeeded'],
      forwardTo: 'https://example.test/webhooks',
    }).webhook_event!(message)

    expect(printJson).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('skips filtered events without a type key', async () => {
    const message = {
      type: 'webhook_event',
      event: JSON.stringify({ id: 'evt_123' }),
      signature: 'test_signature',
      event_type: 'payment.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({ events: ['payment.succeeded'] }).webhook_event!(message)

    expect(printJson).not.toHaveBeenCalled()
  })

  test('rejects webhook event payloads that are not records', async () => {
    await expect(
      createWebhookRelayHandlers({}).webhook_event!({
        type: 'webhook_event',
        event: JSON.stringify('evt_123'),
        signature: 'test_signature',
        event_type: 'payment_intent.succeeded',
        timestamp: 1_234,
      }),
    ).rejects.toThrow('Invalid webhook event payload')
  })

  test('rejects malformed webhook messages', async () => {
    await expect(
      createWebhookRelayHandlers({}).webhook_event!({
        type: 'webhook_event',
        event: '{}',
        signature: 'test_signature',
        event_type: 'payment_intent.succeeded',
        timestamp: 1.2,
      }),
    ).rejects.toThrow('Invalid webhook event message')
  })
})
