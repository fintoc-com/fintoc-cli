import { beforeEach, describe, expect, test, vi } from 'vitest'
import { printJson } from '../../output.js'
import { createWebhookRelayHandlers } from '../handlers.js'

vi.mock('../../output.js', () => ({
  printJson: vi.fn(),
}))

describe('webhook relay handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('pretty-prints the full event for webhook messages', () => {
    const event = JSON.stringify({ id: 'evt_123' })
    const message = {
      type: 'webhook_event',
      event,
      signature: 'test_signature',
      event_type: 'payment_intent.succeeded',
      timestamp: 1_234,
    } as const

    createWebhookRelayHandlers({}).webhook_event!(message)

    expect(printJson).toHaveBeenCalledWith(message)
  })

  test('prints the full relay message in JSON mode', () => {
    const message = {
      type: 'webhook_event',
      id: 'wem_123',
      status: 'pending',
      event: JSON.stringify({ id: 'evt_123' }),
      signature: 'test_signature',
      event_type: 'payment_intent.succeeded',
      timestamp: 1_234,
    } as const

    createWebhookRelayHandlers({ json: true }).webhook_event!(message)

    expect(printJson).toHaveBeenCalledWith({
      type: 'webhook_event',
      event: message.event,
      signature: message.signature,
      event_type: message.event_type,
      timestamp: message.timestamp,
    })
  })

  test('rejects malformed webhook messages', () => {
    expect(() =>
      createWebhookRelayHandlers({}).webhook_event!({
        type: 'webhook_event',
        event: '{}',
        signature: 'test_signature',
        event_type: 'payment_intent.succeeded',
        timestamp: 1.2,
      }),
    ).toThrow('Invalid webhook event message')
  })
})
