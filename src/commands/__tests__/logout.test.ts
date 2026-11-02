import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { clearConfig } from '../../lib/config.js'
import { printJson, success } from '../../lib/output.js'
import { logoutCommand } from '../logout.js'

vi.mock('../../lib/config.js', () => ({
  clearConfig: vi.fn(),
  CONFIG_PATH: '/mock-home/.fintoc/config.toml',
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  hint: vi.fn(),
  success: vi.fn(),
  printJson: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

const createProgram = () => {
  const program = new Command()
  program.exitOverride().option('--json', 'Output as JSON')
  logoutCommand(program)
  return program
}

describe('logout command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.each([false, true])('clears config and keeps stdout empty (json=%s)', async (json) => {
    const program = createProgram()
    await program.parseAsync(['logout', ...(json ? ['--json'] : [])], { from: 'user' })

    expect(clearConfig).toHaveBeenCalled()
    expect(printJson).not.toHaveBeenCalled()
    expect(success).toHaveBeenCalledWith('Credentials removed from /mock-home/.fintoc/config.toml')
  })
})
