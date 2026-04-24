import { Command } from 'commander'
import { beforeEach, describe, expect, test, vi } from 'vitest'
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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('open dashboard', () => {
    test('opens dashboard URL in browser on macOS', async () => {
      const { exec } = await import('node:child_process')
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'darwin' })

      vi.mocked(exec).mockImplementation((_cmd, callback) => {
        ;(callback as (err: Error | null) => void)(null)
        return undefined as never
      })

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(exec).toHaveBeenCalledWith(
        'open "https://dashboard.fintoc.com/"',
        expect.any(Function),
      )
      expect(success).toHaveBeenCalledWith(expect.stringContaining('https://dashboard.fintoc.com/'))

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    test('uses xdg-open on Linux', async () => {
      const { exec } = await import('node:child_process')
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })

      vi.mocked(exec).mockImplementation((_cmd, callback) => {
        ;(callback as (err: Error | null) => void)(null)
        return undefined as never
      })

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(exec).toHaveBeenCalledWith(
        'xdg-open "https://dashboard.fintoc.com/"',
        expect.any(Function),
      )

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    test('uses start on Windows', async () => {
      const { exec } = await import('node:child_process')
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32' })

      vi.mocked(exec).mockImplementation((_cmd, callback) => {
        ;(callback as (err: Error | null) => void)(null)
        return undefined as never
      })

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(exec).toHaveBeenCalledWith(
        'start "" "https://dashboard.fintoc.com/"',
        expect.any(Function),
      )

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    test('logs error when browser fails to open', async () => {
      const { exec } = await import('node:child_process')
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'darwin' })

      vi.mocked(exec).mockImplementation((_cmd, callback) => {
        ;(callback as (err: Error | null) => void)(new Error('spawn open ENOENT'))
        return undefined as never
      })

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(error).toHaveBeenCalledWith(expect.stringContaining('Failed to open browser'))
      expect(success).not.toHaveBeenCalled()

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })

    test('shows friendly error on unsupported platform', async () => {
      const { exec } = await import('node:child_process')
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'freebsd' })

      const program = createProgram()
      await program.parseAsync(['open', 'dashboard'], { from: 'user' })

      expect(exec).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Unsupported platform'))
      expect(success).not.toHaveBeenCalled()

      Object.defineProperty(process, 'platform', { value: originalPlatform })
    })
  })
})
