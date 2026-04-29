import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resolveAuth, whoami } from '../../lib/auth.js'
import { readConfig, writeConfig } from '../../lib/config.js'
import { error, hint, log, printJson, success, warn } from '../../lib/output.js'
import { configCommand } from '../config.js'

vi.mock('../../lib/auth.js', () => ({
  resolveAuth: vi.fn(),
  whoami: vi.fn(),
  maskKey: vi.fn(() => 'sk_test_····'),
}))

vi.mock('../../lib/config.js', () => ({
  CONFIG_PATH: '/mock-home/.fintoc/config.toml',
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  hint: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  printJson: vi.fn(),
}))

const createProgram = () => {
  const program = new Command()
  program.exitOverride()
  program.option('--json', 'Output as JSON')
  configCommand(program)
  return program
}

describe('config command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when authenticated', () => {
    test('shows full config', async () => {
      vi.mocked(resolveAuth).mockReturnValue({
        secretKey: 'sk_test_abc123',
        source: 'config',
      })
      vi.mocked(whoami).mockResolvedValue({
        organizationName: 'Acme Corp',
        mode: 'test',
        apiVersion: '2023-03-15',
      })

      const program = createProgram()
      await program.parseAsync(['config'], { from: 'user' })

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('test'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('config file'))
    })
  })

  describe('when --json is passed', () => {
    test('outputs JSON when authenticated', async () => {
      vi.mocked(resolveAuth).mockReturnValue({
        secretKey: 'sk_test_abc123',
        source: 'config',
      })
      vi.mocked(whoami).mockResolvedValue({
        organizationName: 'Acme Corp',
        mode: 'test',
        apiVersion: '2023-03-15',
      })

      const program = createProgram()
      await program.parseAsync(['--json', 'config'], { from: 'user' })

      expect(printJson).toHaveBeenCalledWith(
        expect.objectContaining({
          authenticated: true,
          organization: 'Acme Corp',
          mode: 'test',
          api_version: '2023-03-15',
          source: 'config file',
          api_reachable: true,
        }),
      )
      expect(log).not.toHaveBeenCalled()
    })

    test('outputs JSON with nulls when API is unreachable', async () => {
      vi.mocked(resolveAuth).mockReturnValue({
        secretKey: 'sk_test_abc123',
        source: 'config',
      })
      vi.mocked(whoami).mockRejectedValue(new Error('Network error'))

      const program = createProgram()
      await program.parseAsync(['--json', 'config'], { from: 'user' })

      expect(printJson).toHaveBeenCalledWith(
        expect.objectContaining({
          authenticated: true,
          organization: null,
          mode: null,
          api_version: null,
          api_reachable: false,
        }),
      )
      expect(warn).not.toHaveBeenCalled()
    })

    test('outputs JSON when not authenticated', async () => {
      vi.mocked(resolveAuth).mockImplementation(() => {
        throw new Error('No API key found')
      })

      const program = createProgram()
      await program.parseAsync(['--json', 'config'], { from: 'user' })

      expect(printJson).toHaveBeenCalledWith(expect.objectContaining({ authenticated: false }))
      expect(log).not.toHaveBeenCalled()
    })
  })

  describe('when not authenticated', () => {
    test('shows not authenticated message', async () => {
      vi.mocked(resolveAuth).mockImplementation(() => {
        throw new Error('No API key found')
      })

      const program = createProgram()
      await program.parseAsync(['config'], { from: 'user' })

      expect(hint).toHaveBeenCalledWith(expect.stringContaining('Not authenticated'))
    })
  })

  describe('when API is unreachable', () => {
    test('degrades gracefully', async () => {
      vi.mocked(resolveAuth).mockReturnValue({
        secretKey: 'sk_test_abc123',
        source: 'env',
      })
      vi.mocked(whoami).mockRejectedValue(new Error('Network error'))

      const program = createProgram()
      await program.parseAsync(['config'], { from: 'user' })

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unable to reach Fintoc API'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('  -'))
      expect(log).toHaveBeenCalledWith(expect.stringContaining('env var'))
    })
  })
})

describe('config set command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when setting valid keys', () => {
    test('sets jws_private_key in config', async () => {
      vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_abc123' })

      const program = createProgram()
      await program.parseAsync(['config', 'set', 'jws_private_key', '/path/to/key.pem'], {
        from: 'user',
      })

      expect(writeConfig).toHaveBeenCalledWith({
        secret_key: 'sk_test_abc123',
        jws_private_key: '/path/to/key.pem',
      })
      expect(success).toHaveBeenCalledWith('Config updated: jws_private_key')
    })

    test('sets secret_key in config', async () => {
      vi.mocked(readConfig).mockReturnValue({})

      const program = createProgram()
      await program.parseAsync(['config', 'set', 'secret_key', 'sk_test_newkey'], {
        from: 'user',
      })

      expect(writeConfig).toHaveBeenCalledWith({ secret_key: 'sk_test_newkey' })
      expect(success).toHaveBeenCalledWith('Config updated: secret_key')
    })

    test('preserves existing config values when setting a new key', async () => {
      vi.mocked(readConfig).mockReturnValue({
        secret_key: 'sk_test_existing',
        jws_private_key: '/old/path.pem',
      })

      const program = createProgram()
      await program.parseAsync(['config', 'set', 'jws_private_key', '/new/path.pem'], {
        from: 'user',
      })

      expect(writeConfig).toHaveBeenCalledWith({
        secret_key: 'sk_test_existing',
        jws_private_key: '/new/path.pem',
      })
    })
  })

  describe('when key is unknown', () => {
    test('rejects and does not write', async () => {
      const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit ${code}`)
      })

      const program = createProgram()
      await expect(
        program.parseAsync(['config', 'set', 'unknown_key', 'value'], { from: 'user' }),
      ).rejects.toThrow('exit 1')

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining("Unknown config key: 'unknown_key'"),
      )
      expect(writeConfig).not.toHaveBeenCalled()

      mockExit.mockRestore()
    })
  })
})
