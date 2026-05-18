import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createClient, resolveAuth } from '../../lib/auth.js'
import { handleError } from '../../lib/errors.js'
import { printDetail, printJson, success } from '../../lib/output.js'
import { triggerCommand } from '../trigger.js'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}))

vi.mock('../../lib/auth.js', () => ({
  resolveAuth: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('../../lib/errors.js', () => ({
  handleError: vi.fn((err: unknown) => {
    throw err
  }),
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  hint: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  printJson: vi.fn(),
  printDetail: vi.fn(),
}))

const createTriggerStub = () => {
  const trigger = vi.fn().mockResolvedValue({
    serialize: () => ({ id: 'evt_123', type: 'payment_intent.succeeded' }),
  })
  vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc', source: 'config' })
  vi.mocked(createClient).mockReturnValue({
    events: { trigger },
  } as unknown as ReturnType<typeof createClient>)
  return trigger
}

const createProgram = () => {
  const program = new Command()
  program.exitOverride().option('--api-key <key>').option('--json')
  triggerCommand(program)
  return program
}

describe('trigger command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('with no overrides', () => {
    test('calls events.trigger with only the event type', async () => {
      const trigger = createTriggerStub()
      const program = createProgram()

      await program.parseAsync(['trigger', 'payment_intent.succeeded'], { from: 'user' })

      expect(trigger).toHaveBeenCalledWith({ type: 'payment_intent.succeeded' })
      expect(handleError).not.toHaveBeenCalled()
    })

    test('prints a success line and the event details by default', async () => {
      createTriggerStub()
      const program = createProgram()

      await program.parseAsync(['trigger', 'payment_intent.succeeded'], { from: 'user' })

      expect(success).toHaveBeenCalledWith(expect.stringContaining('payment_intent.succeeded'))
      expect(printDetail).toHaveBeenCalledWith({
        id: 'evt_123',
        type: 'payment_intent.succeeded',
      })
      expect(printJson).not.toHaveBeenCalled()
    })
  })

  describe('with --json on the root program', () => {
    test('prints the serialized event as JSON and skips success/detail', async () => {
      createTriggerStub()
      const program = createProgram()

      await program.parseAsync(['--json', 'trigger', 'payment_intent.succeeded'], { from: 'user' })

      expect(printJson).toHaveBeenCalledWith({
        id: 'evt_123',
        type: 'payment_intent.succeeded',
      })
      expect(success).not.toHaveBeenCalled()
      expect(printDetail).not.toHaveBeenCalled()
    })
  })

  describe('with a single --override flag', () => {
    test('passes overrides object containing that key/value to the SDK', async () => {
      const trigger = createTriggerStub()
      const program = createProgram()

      await program.parseAsync(
        ['trigger', 'payment_intent.succeeded', '--override', 'currency=CLP'],
        { from: 'user' },
      )

      expect(trigger).toHaveBeenCalledWith({
        type: 'payment_intent.succeeded',
        overrides: { currency: 'CLP' },
      })
    })
  })

  describe('with dot-notation in --override key', () => {
    test('builds a nested overrides object', async () => {
      const trigger = createTriggerStub()
      const program = createProgram()

      await program.parseAsync(
        ['trigger', 'payment_intent.succeeded', '--override', 'metadata.order_id=abc123'],
        { from: 'user' },
      )

      expect(trigger).toHaveBeenCalledWith({
        type: 'payment_intent.succeeded',
        overrides: { metadata: { order_id: 'abc123' } },
      })
    })
  })

  describe('with --from-json pointing at a file', () => {
    test('reads the file and uses it as the overrides object', async () => {
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ amount: 1000, metadata: { foo: 'bar' } }),
      )
      const trigger = createTriggerStub()
      const program = createProgram()

      await program.parseAsync(
        ['trigger', 'payment_intent.succeeded', '--from-json', '/tmp/overrides.json'],
        { from: 'user' },
      )

      expect(readFileSync).toHaveBeenCalledWith('/tmp/overrides.json', 'utf-8')
      expect(trigger).toHaveBeenCalledWith({
        type: 'payment_intent.succeeded',
        overrides: { amount: 1000, metadata: { foo: 'bar' } },
      })
    })
  })

  describe('with both --from-json and --override', () => {
    test('deep-merges with --override taking precedence on conflicting leaves', async () => {
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          amount: 1000,
          metadata: { foo: 'bar', keep: 'me' },
          currency: 'CLP',
        }),
      )
      const trigger = createTriggerStub()
      const program = createProgram()

      await program.parseAsync(
        [
          'trigger',
          'payment_intent.succeeded',
          '--from-json',
          '/tmp/base.json',
          '--override',
          'amount=5000',
          '--override',
          'metadata.foo=overridden',
        ],
        { from: 'user' },
      )

      expect(trigger).toHaveBeenCalledWith({
        type: 'payment_intent.succeeded',
        overrides: {
          amount: 5000,
          currency: 'CLP',
          metadata: { foo: 'overridden', keep: 'me' },
        },
      })
    })
  })

  describe('when the SDK throws', () => {
    test('passes the error through handleError with the json flag', async () => {
      const sdkError = new Error('API down')
      vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc', source: 'config' })
      vi.mocked(createClient).mockReturnValue({
        events: { trigger: vi.fn().mockRejectedValue(sdkError) },
      } as unknown as ReturnType<typeof createClient>)
      const program = createProgram()

      await expect(
        program.parseAsync(['--json', 'trigger', 'payment_intent.succeeded'], { from: 'user' }),
      ).rejects.toBe(sdkError)

      expect(handleError).toHaveBeenCalledWith(sdkError, { json: true })
    })
  })

  describe('with a malformed --override flag', () => {
    test('rejects values without an = separator', async () => {
      createTriggerStub()
      const program = createProgram()

      await expect(
        program.parseAsync(
          ['trigger', 'payment_intent.succeeded', '--override', 'no-equals-sign'],
          { from: 'user' },
        ),
      ).rejects.toThrow(/--override.*key=value/i)
    })
  })

  describe('value type inference', () => {
    test('coerces JSON-parseable values to their JSON type, leaving plain strings alone', async () => {
      const trigger = createTriggerStub()
      const program = createProgram()

      await program.parseAsync(
        [
          'trigger',
          'payment_intent.succeeded',
          '--override',
          'amount=5000',
          '--override',
          'paid=true',
          '--override',
          'tags=["a","b"]',
          '--override',
          'metadata.tag=urgent',
          '--override',
          'name="5000"',
        ],
        { from: 'user' },
      )

      expect(trigger).toHaveBeenCalledWith({
        type: 'payment_intent.succeeded',
        overrides: {
          amount: 5000,
          paid: true,
          tags: ['a', 'b'],
          metadata: { tag: 'urgent' },
          name: '5000',
        },
      })
    })
  })

  describe('with multiple --override flags', () => {
    test('merges them into one overrides object', async () => {
      const trigger = createTriggerStub()
      const program = createProgram()

      await program.parseAsync(
        [
          'trigger',
          'payment_intent.succeeded',
          '--override',
          'currency=CLP',
          '--override',
          'metadata.order_id=abc123',
          '--override',
          'metadata.tag=urgent',
        ],
        { from: 'user' },
      )

      expect(trigger).toHaveBeenCalledWith({
        type: 'payment_intent.succeeded',
        overrides: {
          currency: 'CLP',
          metadata: { order_id: 'abc123', tag: 'urgent' },
        },
      })
    })
  })
})
