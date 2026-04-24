import { password } from '@inquirer/prompts'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { whoami } from '../../lib/auth.js'
import { readConfig, writeConfig } from '../../lib/config.js'
import { error, success } from '../../lib/output.js'
import { loginCommand } from '../login.js'

vi.mock('../../lib/auth.js', () => ({
  whoami: vi.fn(),
  maskKey: vi.fn((k: string) => `${k.slice(0, 7)}····`),
}))

vi.mock('../../lib/config.js', () => ({
  readConfig: vi.fn(() => ({})),
  writeConfig: vi.fn(),
  CONFIG_PATH: '/mock-home/.fintoc/config.toml',
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  password: vi.fn(),
}))

const createProgram = () => {
  const program = new Command()
  program.exitOverride()
  program.option('--api-key <key>', 'Override API key for this command')
  loginCommand(program)
  return program
}

describe('login command', () => {
  const originalIsTTY = process.stdin.isTTY

  beforeEach(() => {
    vi.clearAllMocks()
    process.stdin.isTTY = true
  })

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY
  })

  test('authenticates successfully with interactive prompt', async () => {
    vi.mocked(password).mockResolvedValue('sk_test_valid123')
    vi.mocked(whoami).mockResolvedValue({
      organizationName: 'Acme Corp',
      mode: 'test',
      apiVersion: '2023-03-15',
    })

    const program = createProgram()
    await program.parseAsync(['login'], { from: 'user' })

    expect(password).toHaveBeenCalled()
    expect(whoami).toHaveBeenCalledWith('sk_test_valid123')
    expect(readConfig).toHaveBeenCalled()
    expect(writeConfig).toHaveBeenCalledWith({ secret_key: 'sk_test_valid123' })
    expect(success).toHaveBeenCalledWith('Authenticated as Acme Corp (test mode)')
  })

  test('preserves existing config fields when writing', async () => {
    vi.mocked(password).mockResolvedValue('sk_test_new')
    vi.mocked(readConfig).mockReturnValue({ jws_private_key: '/path/to/key.pem' })
    vi.mocked(whoami).mockResolvedValue({
      organizationName: 'Acme Corp',
      mode: 'test',
      apiVersion: '2023-03-15',
    })

    const program = createProgram()
    await program.parseAsync(['login'], { from: 'user' })

    expect(writeConfig).toHaveBeenCalledWith({
      jws_private_key: '/path/to/key.pem',
      secret_key: 'sk_test_new',
    })
  })

  test('exits with error on invalid key', async () => {
    vi.mocked(password).mockResolvedValue('sk_test_invalid')
    vi.mocked(whoami).mockRejectedValue(new Error('Invalid API key'))

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const program = createProgram()

    await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow('process.exit')

    expect(writeConfig).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith('Invalid API key')

    exitSpy.mockRestore()
  })

  test('exits with error on non-TTY without --api-key', async () => {
    process.stdin.isTTY = false as unknown as boolean

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const program = createProgram()

    await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow('process.exit')

    expect(error).toHaveBeenCalledWith('Non-interactive terminal detected. Pass the key via flag:')

    exitSpy.mockRestore()
  })

  test('authenticates with --api-key flag skipping prompt', async () => {
    vi.mocked(readConfig).mockReturnValue({})
    vi.mocked(whoami).mockResolvedValue({
      organizationName: 'Acme Corp',
      mode: 'test',
      apiVersion: '2023-03-15',
    })

    const program = createProgram()
    await program.parseAsync(['login', '--api-key', 'sk_test_flag123'], { from: 'user' })

    expect(password).not.toHaveBeenCalled()
    expect(whoami).toHaveBeenCalledWith('sk_test_flag123')
    expect(writeConfig).toHaveBeenCalledWith({ secret_key: 'sk_test_flag123' })
    expect(success).toHaveBeenCalledWith('Authenticated as Acme Corp (test mode)')
  })
})
