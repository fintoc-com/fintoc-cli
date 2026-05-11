import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { log, printJson } from '../../output.js'
import { createWebhookRelayHandlers } from '../handlers.js'

vi.mock('../../output.js', () => ({
  bold: vi.fn((text: string) => text),
  dim: vi.fn((text: string) => text),
  green: vi.fn((text: string) => text),
  log: vi.fn(),
  printJson: vi.fn(),
  red: vi.fn((text: string) => text),
  yellow: vi.fn((text: string) => text),
}))

const webhookEvent = {
  id: 'evt_123',
  type: 'payment.succeeded',
  created_at: '2026-05-11T14:52:12Z',
}

describe('webhook relay handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('prints a compact line for webhook messages', async () => {
    const event = JSON.stringify(webhookEvent)
    const message = {
      type: 'webhook_event',
      event,
      signature: 'test_signature',
      event_type: 'payment_intent.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({}).webhook_event!(message)

    expect(log).toHaveBeenCalledWith('2026-05-11 14:52:12  <--  payment.succeeded [evt_123]')
  })

  test('prints the full event in JSON mode', async () => {
    const message = {
      type: 'webhook_event',
      id: 'wem_123',
      status: 'pending',
      event: JSON.stringify(webhookEvent),
      signature: 'test_signature',
      event_type: 'payment_intent.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({ json: true }).webhook_event!(message)

    expect(printJson).toHaveBeenCalledWith(webhookEvent)
  })

  test('forwards the raw event with the webhook signature', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T14:52:13Z'))
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const event = JSON.stringify(webhookEvent)
    const forwardTo = 'https://webhook.site/828b463d-c4a4-4f6b-a450-7c2cdb575d63'
    const message = {
      type: 'webhook_event',
      event,
      signature: 'test_signature',
      event_type: 'payment_intent.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({
      forwardTo,
    }).webhook_event!(message)

    expect(fetchMock).toHaveBeenCalledWith(forwardTo, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Fintoc-Signature': 'test_signature',
      },
      body: event,
    })
    expect(log).toHaveBeenCalledWith('2026-05-11 14:52:12  <--  payment.succeeded [evt_123]')
    expect(log).toHaveBeenCalledWith(
      '2026-05-11 14:52:13  -->  [204] POST https://webhook.site/828b463d-c4a4-4f6b-a450-7c2cdb575d63 [evt_123]',
    )
  })

  test('handles events included in the event filter', async () => {
    const event = JSON.stringify(webhookEvent)
    const message = {
      type: 'webhook_event',
      event,
      signature: 'test_signature',
      event_type: 'payment.succeeded',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({ events: ['payment.succeeded'] }).webhook_event!(message)

    expect(log).toHaveBeenCalledWith('2026-05-11 14:52:12  <--  payment.succeeded [evt_123]')
  })

  test('skips events not included in the event filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const message = {
      type: 'webhook_event',
      event: JSON.stringify({ ...webhookEvent, type: 'payment.failed' }),
      signature: 'test_signature',
      event_type: 'payment.failed',
      timestamp: 1_234,
    } as const

    await createWebhookRelayHandlers({
      events: ['payment.succeeded'],
      forwardTo: 'https://example.test/webhooks',
    }).webhook_event!(message)

    expect(log).not.toHaveBeenCalled()
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

    expect(log).not.toHaveBeenCalled()
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
