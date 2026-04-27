import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resolveAuth, whoami } from '../../lib/auth.js'
import { readConfig, writeConfig } from '../../lib/config.js'
import { error, log, success, warn } from '../../lib/output.js'
import { configCommand } from '../config.js'

vi.mock('../../lib/auth.js', () => ({
  resolveAuth: vi.fn(),
  whoami: vi.fn(),
  maskKey: vi.fn((k: string) => `${k.slice(0, 8)}····`),
}))

vi.mock('../../lib/config.js', () => ({
  CONFIG_PATH: '/mock-home/.fintoc/config.toml',
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

const createProgram = () => {
  const program = new Command()
  program.exitOverride()
  configCommand(program)
  return program
}

describe('config command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('shows full config when authenticated', async () => {
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

  test('shows not authenticated when no key', async () => {
    vi.mocked(resolveAuth).mockImplementation(() => {
      throw new Error('No API key found')
    })

    const program = createProgram()
    await program.parseAsync(['config'], { from: 'user' })

    expect(log).toHaveBeenCalledWith(expect.stringContaining('Not authenticated'))
  })

  test('degrades gracefully when API is unreachable', async () => {
    vi.mocked(resolveAuth).mockReturnValue({
      secretKey: 'sk_test_abc123',
      source: 'env',
    })
    vi.mocked(whoami).mockRejectedValue(new Error('Network error'))

    const program = createProgram()
    await program.parseAsync(['config'], { from: 'user' })

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unable to reach Fintoc API'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('(unknown)'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('env var'))
  })
})

describe('config set command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  test('rejects unknown config keys', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`exit ${code}`)
    })

    const program = createProgram()
    await expect(
      program.parseAsync(['config', 'set', 'unknown_key', 'value'], { from: 'user' }),
    ).rejects.toThrow('exit 1')

    expect(error).toHaveBeenCalledWith(expect.stringContaining("Unknown config key: 'unknown_key'"))
    expect(writeConfig).not.toHaveBeenCalled()

    mockExit.mockRestore()
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
