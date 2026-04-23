import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resolveAuth, whoami } from '../../lib/auth.js'
import { log, warn } from '../../lib/output.js'
import { configCommand } from '../config.js'

vi.mock('../../lib/auth.js', () => ({
  resolveAuth: vi.fn(),
  whoami: vi.fn(),
  maskKey: vi.fn((k: string) => `${k.slice(0, 8)}····`),
}))

vi.mock('../../lib/config.js', () => ({
  CONFIG_PATH: '/mock-home/.fintoc/config.toml',
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
