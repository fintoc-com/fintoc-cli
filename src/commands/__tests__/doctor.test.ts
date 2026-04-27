import type { ExecSyncOptions } from 'node:child_process'
import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resolveAuth, whoami } from '../../lib/auth.js'
import { readConfig } from '../../lib/config.js'
import { error, log, success, warn } from '../../lib/output.js'
import { doctorCommand } from '../doctor.js'

const { mockExecSync, mockExistsSync, mockStatSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn<(cmd: string, opts?: ExecSyncOptions) => string>(),
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockStatSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}))

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
}))

vi.mock('../../lib/auth.js', () => ({
  resolveAuth: vi.fn(),
  whoami: vi.fn(),
  maskKey: vi.fn((k: string) => `${k.slice(0, 8)}····`),
}))

vi.mock('../../lib/config.js', () => ({
  CONFIG_PATH: '/mock-home/.fintoc/config.toml',
  readConfig: vi.fn(),
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
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
    vi.mocked(readConfig).mockReturnValue({})
  })

  describe('when all checks pass', () => {
    beforeEach(() => {
      mockExecSync.mockReturnValue('0.1.0\n')
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ mode: 0o100600 } as ReturnType<typeof mockStatSync>)
      vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc123', source: 'config' })
      vi.mocked(whoami).mockResolvedValue({
        organizationName: 'Acme Corp',
        mode: 'test',
        apiVersion: '2023-03-15',
      })
    })

    test('reports success for CLI version, config, API key, and connectivity', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(success).toHaveBeenCalledWith(expect.stringContaining('CLI version'))
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Config file'))
      expect(success).toHaveBeenCalledWith(expect.stringContaining('API key'))
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Connectivity'))
      expect(success).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'))
    })

    test('reports JWS key as not configured', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(error).toHaveBeenCalledTimes(1)
      expect(error).toHaveBeenCalledWith(expect.stringContaining('JWS private key'))
    })
  })

  describe('when API key is missing', () => {
    beforeEach(() => {
      mockExecSync.mockReturnValue('0.1.0\n')
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ mode: 0o100600 } as ReturnType<typeof mockStatSync>)
      vi.mocked(resolveAuth).mockImplementation(() => {
        throw new Error('No API key')
      })
    })

    test('skips connectivity checks', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(error).toHaveBeenCalledWith(expect.stringContaining('API key'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('skipped'))
      expect(whoami).not.toHaveBeenCalled()
    })
  })

  describe('when API is unreachable', () => {
    beforeEach(() => {
      mockExecSync.mockReturnValue('0.1.0\n')
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ mode: 0o100600 } as ReturnType<typeof mockStatSync>)
      vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc123', source: 'config' })
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
      mockExecSync.mockReturnValue('0.2.0\n')
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ mode: 0o100600 } as ReturnType<typeof mockStatSync>)
      vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc123', source: 'config' })
      vi.mocked(whoami).mockResolvedValue({
        organizationName: 'Acme Corp',
        mode: 'test',
        apiVersion: '2023-03-15',
      })
    })

    test('warns about newer version', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('latest: 0.2.0'))
    })
  })

  describe('when config file is missing', () => {
    beforeEach(() => {
      mockExecSync.mockReturnValue('0.1.0\n')
      mockExistsSync.mockReturnValue(false)
      vi.mocked(resolveAuth).mockImplementation(() => {
        throw new Error('No API key')
      })
    })

    test('reports config file not found', async () => {
      const program = createProgram()
      await program.parseAsync(['doctor'], { from: 'user' })

      expect(error).toHaveBeenCalledWith(expect.stringContaining('not found'))
    })
  })
})
