import { Buffer } from 'node:buffer'
import { describe, expect, test } from 'vitest'
import {
  createSubscribeCommand,
  createSubscriptionIdentifier,
  originForWebSocketUrl,
  parseActionCableMessage,
} from '../action-cable.js'

describe('ActionCable relay', () => {
  test('creates subscription identifier with session credentials', () => {
    expect(JSON.parse(createSubscriptionIdentifier('clisess_123', 'whsec_test_123'))).toEqual({
      channel: 'CliSessionsChannel',
      session_id: 'clisess_123',
      secret: 'whsec_test_123',
    })
  })

  test('creates ActionCable subscribe command', () => {
    const payload = JSON.parse(createSubscribeCommand('clisess_123', 'whsec_test_123'))

    expect(payload).toEqual({
      command: 'subscribe',
      identifier: createSubscriptionIdentifier('clisess_123', 'whsec_test_123'),
    })
  })

  test('derives an allowed Origin from the websocket URL', () => {
    expect(originForWebSocketUrl('ws://api.localhost:3000/cable')).toBe('http://api.localhost:3000')
    expect(originForWebSocketUrl('wss://api.fintoc.com/cable')).toBe('https://api.fintoc.com')
  })

  test('parses valid ActionCable messages', () => {
    const payload = {
      identifier: 'subscription-id',
      message: {
        type: 'webhook_event',
        event: { id: 'evt_123' },
      },
    }

    expect(parseActionCableMessage(Buffer.from(JSON.stringify(payload)))).toEqual({
      message: payload.message,
    })
  })

  test('ignores invalid JSON', () => {
    expect(parseActionCableMessage(Buffer.from('{'))).toBeUndefined()
  })

  test('ignores malformed ActionCable messages', () => {
    expect(
      parseActionCableMessage(
        Buffer.from(
          JSON.stringify({
            message: {
              type: 123,
            },
          }),
        ),
      ),
    ).toBeUndefined()
  })
})
