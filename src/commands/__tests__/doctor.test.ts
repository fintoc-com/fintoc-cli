import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { resolveAuth, whoami } from '../../lib/auth.js'
import { readConfig } from '../../lib/config.js'
import { error, log, success, warn } from '../../lib/output.js'
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

  test('all checks pass', async () => {
    const { execSync } = await import('node:child_process')
    const { existsSync, statSync } = await import('node:fs')

    vi.mocked(execSync).mockReturnValue('0.1.0\n')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>)
    vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc123', source: 'config' })
    vi.mocked(whoami).mockResolvedValue({
      organizationName: 'Acme Corp',
      mode: 'test',
      apiVersion: '2023-03-15',
    })

    const program = createProgram()
    await program.parseAsync(['doctor'], { from: 'user' })

    expect(success).toHaveBeenCalledWith(expect.stringContaining('CLI version'))
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Config file'))
    expect(success).toHaveBeenCalledWith(expect.stringContaining('API key'))
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Connectivity'))
    expect(success).toHaveBeenCalledWith(expect.stringContaining('Acme Corp'))
    // JWS key is not configured in this test, so one error is expected
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('JWS private key'))
  })

  test('no API key configured — skips connectivity', async () => {
    const { execSync } = await import('node:child_process')
    const { existsSync, statSync } = await import('node:fs')

    vi.mocked(execSync).mockReturnValue('0.1.0\n')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>)
    vi.mocked(resolveAuth).mockImplementation(() => {
      throw new Error('No API key')
    })

    const program = createProgram()
    await program.parseAsync(['doctor'], { from: 'user' })

    expect(error).toHaveBeenCalledWith(expect.stringContaining('API key'))
    expect(log).toHaveBeenCalledWith(expect.stringContaining('skipped'))
    expect(whoami).not.toHaveBeenCalled()
  })

  test('API unreachable', async () => {
    const { execSync } = await import('node:child_process')
    const { existsSync, statSync } = await import('node:fs')

    vi.mocked(execSync).mockReturnValue('0.1.0\n')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>)
    vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc123', source: 'config' })
    vi.mocked(whoami).mockRejectedValue(new Error('Network error'))

    const program = createProgram()
    await program.parseAsync(['doctor'], { from: 'user' })

    expect(error).toHaveBeenCalledWith(expect.stringContaining('could not reach'))
  })

  test('outdated CLI version', async () => {
    const { execSync } = await import('node:child_process')
    const { existsSync, statSync } = await import('node:fs')

    vi.mocked(execSync).mockReturnValue('0.2.0\n')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockReturnValue({ mode: 0o100600 } as ReturnType<typeof statSync>)
    vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_abc123', source: 'config' })
    vi.mocked(whoami).mockResolvedValue({
      organizationName: 'Acme Corp',
      mode: 'test',
      apiVersion: '2023-03-15',
    })

    const program = createProgram()
    await program.parseAsync(['doctor'], { from: 'user' })

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('latest: 0.2.0'))
  })

  test('config file missing', async () => {
    const { execSync } = await import('node:child_process')
    const { existsSync } = await import('node:fs')

    vi.mocked(execSync).mockReturnValue('0.1.0\n')
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(resolveAuth).mockImplementation(() => {
      throw new Error('No API key')
    })

    const program = createProgram()
    await program.parseAsync(['doctor'], { from: 'user' })

    expect(error).toHaveBeenCalledWith(expect.stringContaining('not found'))
  })
})
