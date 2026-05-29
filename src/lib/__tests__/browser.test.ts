import { execFile } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { openInBrowser } from '../browser.js'
import { DASHBOARD_URL } from '../constants.js'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

const URL_TO_OPEN = DASHBOARD_URL

const setPlatform = (value: string) => {
  Object.defineProperty(process, 'platform', { value })
}

const mockExecFile = (err: Error | null) =>
  vi.mocked(execFile).mockImplementation(((
    _cmd: string,
    _args: readonly string[],
    callback: (err: Error | null) => void,
  ) => {
    callback(err)
    return undefined as never
  }) as unknown as typeof execFile)

describe('openInBrowser', () => {
  let originalPlatform: string

  beforeEach(() => {
    vi.clearAllMocks()
    originalPlatform = process.platform
    mockExecFile(null)
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  describe('when on macOS', () => {
    test('invokes the open binary with the URL', async () => {
      setPlatform('darwin')

      await openInBrowser(URL_TO_OPEN)

      expect(execFile).toHaveBeenCalledWith('open', [URL_TO_OPEN], expect.any(Function))
    })
  })

  describe('when on Linux', () => {
    test('invokes xdg-open with the URL', async () => {
      setPlatform('linux')

      await openInBrowser(URL_TO_OPEN)

      expect(execFile).toHaveBeenCalledWith('xdg-open', [URL_TO_OPEN], expect.any(Function))
    })
  })

  describe('when on Windows', () => {
    test('invokes cmd with the start arguments', async () => {
      setPlatform('win32')

      await openInBrowser(URL_TO_OPEN)

      expect(execFile).toHaveBeenCalledWith(
        'cmd',
        ['/c', 'start', '', URL_TO_OPEN],
        expect.any(Function),
      )
    })
  })

  describe('when the platform is unsupported', () => {
    test('rejects without spawning anything', async () => {
      setPlatform('freebsd')

      await expect(openInBrowser(URL_TO_OPEN)).rejects.toThrow('Unsupported platform: freebsd')
      expect(execFile).not.toHaveBeenCalled()
    })
  })

  describe('when the spawned process errors', () => {
    test('rejects with the underlying error', async () => {
      setPlatform('darwin')
      mockExecFile(new Error('spawn open ENOENT'))

      await expect(openInBrowser(URL_TO_OPEN)).rejects.toThrow('spawn open ENOENT')
    })
  })
})
