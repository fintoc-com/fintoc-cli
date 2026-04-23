import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { clearConfig } from '../../lib/config.js'
import { success } from '../../lib/output.js'
import { logoutCommand } from '../logout.js'

vi.mock('../../lib/config.js', () => ({
  clearConfig: vi.fn(),
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
  logoutCommand(program)
  return program
}

describe('logout command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('clears config and prints confirmation', async () => {
    const program = createProgram()
    await program.parseAsync(['logout'], { from: 'user' })

    expect(clearConfig).toHaveBeenCalled()
    expect(success).toHaveBeenCalledWith('Credentials removed from /mock-home/.fintoc/config.toml')
  })
})
