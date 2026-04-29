import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resolveAuth, whoami } from '../../lib/auth.js'
import { readConfig } from '../../lib/config.js'
import { error, hint, info, success, warn } from '../../lib/output.js'
import { doctorCommand } from '../doctor.js'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}))

vi.mock('../../lib/auth.js', () => ({
  resolveAuth: vi.fn(),
  whoami: vi.fn(),
  maskKey: vi.fn(() => 'sk_test_····'),
}))

vi.mock('../../lib/config.js', () => ({
  CONFIG_PATH: '/mock-home/.fintoc/config.toml',
  readConfig: vi.fn(),
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  hint: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}))

vi.mock('../../lib/version.js', () => ({
  getCliVersion: vi.fn(() => '0.1.0'),
}))

const createProgram = () => {
  const program = new Command()
  program.exitOverride()
  doctorCommand(program)
  return program
}

describe('doctor command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(execSync).mockReturnValue('0.1.0\n')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>)
    vi.mocked(readConfig).mockReturnValue({})
    vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc123', source: 'config' })
    vi.mocked(whoami).mockResolvedValue({
      organizationName: 'Acme Corp',
      mode: 'test',
      apiVersion: '2023-03-15',
    })
  })

  describe('when all checks pass', () => {
    test('reports success for CLI version, config, API key, and connectivity', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(success).toHaveBeenCalledWith(expect.stringContaining('CLI version'))
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Config file'))
      expect(success).toHaveBeenCalledWith(expect.stringContaining('API key'))
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Connectivity'))
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'))
    })

    test('reports JWS key as info, not error', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(error).not.toHaveBeenCalledWith(expect.stringContaining('JWS private key'))
      expect(info).toHaveBeenCalledWith(
        expect.stringContaining('JWS private key     not configured'),
      )
    })
  })

  describe('when npm version check fails', () => {
    beforeEach(() => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('npm ERR! 404')
      })
    })

    test('passes stdio pipe to suppress stderr', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(execSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
      )
    })

    test('shows version without error', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(success).toHaveBeenCalledWith(expect.stringContaining('CLI version'))
      expect(hint).toHaveBeenCalledWith(expect.stringContaining('could not check for updates'))
    })
  })

  describe('when API key is missing', () => {
    beforeEach(() => {
      vi.mocked(resolveAuth).mockImplementation(() => {
        throw new Error('No API key')
      })
    })

    test('skips connectivity checks', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(error).toHaveBeenCalledWith(expect.stringContaining('API key'))
      expect(hint).toHaveBeenCalledWith(expect.stringContaining('skipped'))
      expect(whoami).not.toHaveBeenCalled()
    })
  })

  describe('when API is unreachable', () => {
    beforeEach(() => {
      vi.mocked(whoami).mockRejectedValue(new Error('Network error'))
    })

    test('reports connectivity error', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(error).toHaveBeenCalledWith(expect.stringContaining('could not reach'))
    })
  })

  describe('when CLI version is outdated', () => {
    beforeEach(() => {
      vi.mocked(execSync).mockReturnValue('0.2.0\n')
    })

    test('warns about newer version', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('latest: 0.2.0'))
    })
  })

  describe('when config file is missing', () => {
    beforeEach(() => {
      vi.mocked(existsSync).mockReturnValue(false)
    })

    describe('when auth is resolved via env var', () => {
      beforeEach(() => {
        vi.mocked(resolveAuth).mockReturnValue({
          secretKey: 'sk_test_abc123',
          source: 'env',
        })
      })

      test('reports config file as warning, not error', async () => {
        const program = createProgram()
        await program.parseAsync(['doctor'], { from: 'user' })

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('not found (using env)'))
        expect(error).not.toHaveBeenCalledWith(expect.stringContaining('Config file'))
      })
    })

    describe('when auth is resolved via flag', () => {
      beforeEach(() => {
        vi.mocked(resolveAuth).mockReturnValue({
          secretKey: 'sk_test_abc123',
          source: 'flag',
        })
      })

      test('reports config file as warning, not error', async () => {
        const program = createProgram()
        await program.parseAsync(['doctor'], { from: 'user' })

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('not found (using flag)'))
        expect(error).not.toHaveBeenCalledWith(expect.stringContaining('Config file'))
      })
    })

    describe('when no auth is available', () => {
      beforeEach(() => {
        vi.mocked(resolveAuth).mockImplementation(() => {
          throw new Error('No API key')
        })
      })

      test('reports config file as error', async () => {
        const program = createProgram()
        await program.parseAsync(['doctor'], { from: 'user' })

        expect(error).toHaveBeenCalledWith(expect.stringContaining('not found'))
      })
    })
  })
})
