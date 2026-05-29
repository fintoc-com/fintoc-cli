import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { openInBrowser } from '../../lib/browser.js'
import { hint, success } from '../../lib/output.js'
import { openCommand } from '../open.js'

vi.mock('../../lib/browser.js', () => ({
  openInBrowser: vi.fn(),
}))

vi.mock('../../lib/output.js', () => ({
  success: vi.fn(),
  hint: vi.fn(),
}))

const createProgram = () => {
  const program = new Command()
  program.exitOverride()
  openCommand(program)
  return program
}

describe('open command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(openInBrowser).mockResolvedValue(undefined)
  })

  describe('when called without subcommand', () => {
    test('shows help instead of erroring', async () => {
      const program = createProgram()

      await expect(program.parseAsync(['open'], { from: 'user' })).rejects.toMatchObject({
        exitCode: 0,
        code: 'commander.help',
      })

      expect(openInBrowser).not.toHaveBeenCalled()
    })
  })

  describe('open dashboard', () => {
    test('opens the dashboard URL in the browser', async () => {
      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(openInBrowser).toHaveBeenCalledWith('https://dashboard.fintoc.com/')
      expect(success).toHaveBeenCalledWith(expect.stringContaining('https://dashboard.fintoc.com/'))
    })

    test('falls back to printing the URL when the browser fails to open', async () => {
      vi.mocked(openInBrowser).mockRejectedValue(new Error('spawn open ENOENT'))

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(hint).toHaveBeenCalledWith(expect.stringContaining('https://dashboard.fintoc.com/'))
      expect(success).not.toHaveBeenCalled()
    })
  })
})
