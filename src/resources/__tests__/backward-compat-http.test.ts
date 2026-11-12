import type { CommandSurface, Surface } from './cli-surface.js'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { httpAdapter } from './http-adapter.js'

const cli = fileURLToPath(new URL('../../../dist/index.js', import.meta.url))
const adapter = `data:text/javascript,${encodeURIComponent(httpAdapter)}`
const published = JSON.parse(
  readFileSync(new URL('./fixtures/published-surface.json', import.meta.url), 'utf-8'),
) as { source: string; commands: Surface }
const contract = JSON.parse(
  readFileSync(new URL('./fixtures/published-http.json', import.meta.url), 'utf-8'),
) as {
  source: string
  response: Record<string, unknown>
  commands: Record<string, { request: unknown; output: 'empty' | 'list' | 'object' }>
}

const commandArgs = (command: string, surface: CommandSurface) => [
  ...command.split(' '),
  ...surface.args.map((arg) => `test_${arg}`),
  ...Object.entries(surface.flags).flatMap(([name, flag]) => [
    `--${name}`,
    flag.type === 'integer'
      ? '7'
      : flag.type === 'json'
        ? '{"fixture":"value"}'
        : flag.type === 'string[]'
          ? 'first,second'
          : flag.type === 'boolean'
            ? 'true'
            : `test_${name.replace(/-/g, '_')}`,
  ]),
  ...(surface.confirm ? ['--yes'] : []),
]

const run = (args: string[], response: unknown, apiError = false, input?: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'fintoc-compat-'))
  const requestsPath = join(dir, 'requests.jsonl')
  try {
    const result = spawnSync(
      process.execPath,
      ['--import', adapter, cli, ...args, '--json', '--api-key', 'sk_test_contract'],
      {
        encoding: 'utf-8',
        input,
        timeout: 10_000,
        env: {
          ...process.env,
          NO_COLOR: '1',
          FINTOC_TEST_CLI: cli,
          FINTOC_TEST_DIR: dir,
          FINTOC_TEST_REQUESTS: requestsPath,
          FINTOC_TEST_RESPONSE: JSON.stringify(response),
          FINTOC_TEST_API_ERROR: apiError ? '1' : '',
        },
      },
    )
    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    const requests = readFileSync(requestsPath, 'utf-8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    return { ...result, requests }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('published CLI HTTP and output contract', () => {
  test('covers every published resource command from the same baseline', () => {
    expect(contract.source).toBe(published.source)
    expect(Object.keys(contract.commands).sort()).toEqual(Object.keys(published.commands).sort())
  })

  test.each(Object.entries(contract.commands))(
    '%s preserves its request and JSON output',
    (command, expected) => {
      const response = expected.output === 'list' ? [contract.response] : contract.response
      const result = run(commandArgs(command, published.commands[command]), response)

      expect(result.status, result.stderr).toBe(0)
      expect(result.requests).toEqual([expected.request])
      if (expected.output === 'empty') {
        expect(result.stdout).toBe('')
      } else {
        expect(JSON.parse(result.stdout)).toEqual(response)
        expect(result.stderr).toBe('')
      }
    },
  )

  test.each(['payment_intents get', 'v2 transfers get'])(
    '%s preserves API errors and exit 1',
    (command) => {
      const response = {
        error: {
          type: 'invalid_request_error',
          code: 'missing_resource',
          message: 'Resource not found',
        },
      }
      const result = run(commandArgs(command, published.commands[command]), response, true)

      expect(result.status).toBe(1)
      expect(result.stdout).toBe('')
      expect(JSON.parse(result.stderr)).toEqual(response)
      expect(result.requests).toEqual([contract.commands[command].request])
    },
  )

  test('sends the single-use payment link limit to the API', () => {
    const result = run(
      [
        'payment_links',
        'create',
        '--amount',
        '100',
        '--currency',
        'CLP',
        '--max-completed-sessions',
        '1',
      ],
      { id: 'pl_fixture', max_completed_sessions: 1 },
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.requests).toEqual([
      {
        method: 'post',
        path: '/v1/payment_links',
        params: {},
        body: { amount: 100, currency: 'CLP', max_completed_sessions: 1 },
      },
    ])
    expect(JSON.parse(result.stdout)).toEqual({ id: 'pl_fixture', max_completed_sessions: 1 })
  })

  test.each([
    ['id', { type: 'invalid_request_error', code: 'invalid_parameter', message: 'Invalid type' }],
    [
      'recipient_account.type',
      {
        type: 'invalid_request_error: invalid_parameter (recipient_account.type)',
        message: 'invalid_request_error: invalid_parameter (recipient_account.type)\nInvalid type',
      },
    ],
  ])('preserves the published API error JSON for parameter %s', (param, expected) => {
    const response = {
      error: {
        type: 'invalid_request_error',
        code: 'invalid_parameter',
        param,
        message: 'Invalid type',
      },
    }
    const result = run(['payment_intents', 'get', 'pi_fixture'], response, true)

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(JSON.parse(result.stderr)).toEqual({ error: expected })
  })

  test('preserves stdin bodies, flag precedence and replacement of repeated lists', () => {
    const result = run(
      [
        'webhook_endpoints',
        'create',
        '--from-json',
        '-',
        '--enabled-events',
        'discarded',
        '--enabled-events',
        'first,second',
      ],
      contract.response,
      false,
      JSON.stringify({
        url: 'https://example.com/webhook',
        enabled_events: ['old'],
        description: 'kept',
      }),
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.requests).toEqual([
      {
        method: 'post',
        path: '/v1/webhook_endpoints',
        params: {},
        body: {
          url: 'https://example.com/webhook',
          enabled_events: ['first', 'second'],
          description: 'kept',
        },
      },
    ])
    expect(JSON.parse(result.stdout)).toEqual(contract.response)
  })
})
