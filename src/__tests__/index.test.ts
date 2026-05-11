import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = resolve(__dirname, '..', '..', 'dist', 'index.js')

const run = (args: string[], expectFail = false) => {
  try {
    const stdout = execFileSync('node', [CLI_PATH, ...args], {
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
    }).trim()
    return { stdout, stderr: '', exitCode: 0 }
  } catch (err) {
    if (!expectFail) {
      throw err
    }
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: (e.stdout ?? '').trim(),
      stderr: (e.stderr ?? '').trim(),
      exitCode: e.status ?? 1,
    }
  }
}

describe('cli smoke test', () => {
  test('shows version with --version flag', () => {
    const { stdout } = run(['--version'])
    expect(stdout).toMatch(/^fintoc\/\d+\.\d+\.\d+ \w+ node-v\d+/)
  })

  test('shows help with --help flag', () => {
    const { stdout } = run(['--help'])
    expect(stdout).toContain('Fintoc CLI')
    expect(stdout).toContain('fintoc')
  })
})

describe('help consistency', () => {
  describe('when called without arguments', () => {
    test('exits 0 and shows root help', () => {
      const { stdout, exitCode } = run([])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('Fintoc CLI')
      expect(stdout).toContain('Auth:')
      expect(stdout).toContain('Resources:')
      expect(stdout).toContain('Utilities:')
      expect(stdout).toContain('webhooks')
      expect(stdout).toContain('Get started: fintoc login')
    })
  })

  describe('when resource is called without a verb', () => {
    test('exits 0 and shows resource help with commands', () => {
      const { stdout, exitCode } = run(['payment_intents'])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('Manage payment intents')
      expect(stdout).toContain('Commands:')
      expect(stdout).toContain('get')
      expect(stdout).toContain('list')
    })

    test('shows global options in resource help', () => {
      const { stdout } = run(['payment_intents'])
      expect(stdout).toContain('Global Options:')
      expect(stdout).toContain('--api-key')
      expect(stdout).toContain('--json')
    })
  })

  describe('when webhooks command is called without a verb', () => {
    test('exits 0 and shows webhooks help', () => {
      const { stdout, exitCode } = run(['webhooks'])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('Listen for webhook events')
      expect(stdout).toContain('listen')
    })

    test('shows listen options', () => {
      const { stdout, exitCode } = run(['webhooks', 'listen', '--help'])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('--forward-to')
      expect(stdout).toContain('--events')
    })

    test('validates listen events before running the command', () => {
      const { stderr, exitCode } = run(
        ['webhooks', 'listen', '--events', 'payment.succeeded,'],
        true,
      )
      expect(exitCode).toBe(1)
      expect(stderr).toContain('Events must be a comma-separated list of non-empty strings')
    })
  })

  describe('when operation --help is shown', () => {
    test('shows operation-specific options and global options', () => {
      const { stdout, exitCode } = run(['payment_intents', 'list', '--help'])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('List payment intents')
      expect(stdout).toContain('Options:')
      expect(stdout).toContain('--limit')
      expect(stdout).toContain('--status')
      expect(stdout).toContain('Global Options:')
      expect(stdout).toContain('--api-key')
      expect(stdout).toContain('--json')
    })

    test('shows argument in usage line for get command', () => {
      const { stdout } = run(['payment_intents', 'get', '--help'])
      expect(stdout).toContain('fintoc payment_intents get')
      expect(stdout).toContain('<id>')
    })
  })

  describe('when v2 resource is called', () => {
    test('exits 0 and shows v2 resource help', () => {
      const { stdout, exitCode } = run(['v2', 'transfers'])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('Manage transfers')
      expect(stdout).toContain('Commands:')
      expect(stdout).toContain('create')
      expect(stdout).toContain('get')
      expect(stdout).toContain('list')
    })

    test('v2 without resource exits 0 and shows v2 help', () => {
      const { stdout, exitCode } = run(['v2'])
      expect(exitCode).toBe(0)
      expect(stdout).toContain('transfers')
      expect(stdout).toContain('accounts')
    })
  })

  describe('when status flag help is shown', () => {
    test('links to docs instead of hardcoding values', () => {
      const { stdout } = run(['payment_intents', 'list', '--help'])
      expect(stdout).toContain('docs.fintoc.com')
      expect(stdout).not.toContain('pending, succeeded, failed, expired')
    })
  })
})

describe('error formatting', () => {
  describe('when an unknown command is used', () => {
    test('shows error with ✘ prefix and exits 1', () => {
      const { stderr, exitCode } = run(['bogus_command'], true)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('✘')
      expect(stderr).toContain('bogus_command')
    })
  })

  describe('when an unknown verb is used for a resource', () => {
    test('shows error with ✘ prefix and exits 1', () => {
      const { stderr, exitCode } = run(['payment_intents', 'bogus_verb'], true)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('✘')
      expect(stderr).toContain('bogus_verb')
    })
  })

  describe('when an unknown option is used', () => {
    test('shows error with ✘ prefix and exits 1', () => {
      const { stderr, exitCode } = run(['payment_intents', 'list', '--bogus'], true)
      expect(exitCode).toBe(1)
      expect(stderr).toContain('✘')
      expect(stderr).toContain('--bogus')
    })
  })
})
