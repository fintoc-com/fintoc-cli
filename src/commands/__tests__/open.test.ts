import { exec } from 'node:child_process'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { error, success } from '../../lib/output.js'
import { openCommand } from '../open.js'

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}))

vi.mock('../../lib/output.js', () => ({
  success: vi.fn(),
  error: vi.fn(),
}))

const createProgram = () => {
  const program = new Command()
  program.exitOverride()
  openCommand(program)
  return program
}

describe('open command', () => {
  let originalPlatform: string

  beforeEach(() => {
    vi.clearAllMocks()
    originalPlatform = process.platform
    vi.mocked(exec).mockImplementation((_cmd, callback) => {
      ;(callback as (err: Error | null) => void)(null)
      return undefined as never
    })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  const setPlatform = (value: string) => {
    Object.defineProperty(process, 'platform', { value })
  }

  describe('open dashboard', () => {
    test('opens dashboard URL in browser on macOS', async () => {
      setPlatform('darwin')

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(exec).toHaveBeenCalledWith(
        'open "https://dashboard.fintoc.com/"',
        expect.any(Function),
      )
      expect(success).toHaveBeenCalledWith(expect.stringContaining('https://dashboard.fintoc.com/'))
    })

    test('uses xdg-open on Linux', async () => {
      setPlatform('linux')

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(exec).toHaveBeenCalledWith(
        'xdg-open "https://dashboard.fintoc.com/"',
        expect.any(Function),
      )
    })

    test('uses start on Windows', async () => {
      setPlatform('win32')

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(exec).toHaveBeenCalledWith(
        'start "" "https://dashboard.fintoc.com/"',
        expect.any(Function),
      )
    })

    test('logs error when browser fails to open', async () => {
      setPlatform('darwin')

      vi.mocked(exec).mockImplementation((_cmd, callback) => {
        ;(callback as (err: Error | null) => void)(new Error('spawn open ENOENT'))
        return undefined as never
      })

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to open browser'))
      expect(success).not.toHaveBeenCalled()
    })

    test('shows friendly error on unsupported platform', async () => {
      setPlatform('freebsd')

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(exec).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Unsupported platform'))
      expect(success).not.toHaveBeenCalled()
    })
  })
})
