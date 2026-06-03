import type { BrowserLoginResult, BrowserLoginSession } from '../../lib/browser-login.js'
import { confirm, password } from '@inquirer/prompts'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { whoami } from '../../lib/auth.js'
import { BrowserLoginError, startBrowserLogin } from '../../lib/browser-login.js'
import { readConfig, writeConfig } from '../../lib/config.js'
import { error, hint, success, warn } from '../../lib/output.js'
import { loginCommand } from '../login.js'

vi.mock('../../lib/auth.js', () => ({
  whoami: vi.fn(),
}))

vi.mock('../../lib/browser-login.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/browser-login.js')>(
    '../../lib/browser-login.js',
  )
  return {
    ...actual,
    startBrowserLogin: vi.fn(),
  }
})

vi.mock('../../lib/config.js', () => ({
  readConfig: vi.fn(() => ({})),
  writeConfig: vi.fn(),
  CONFIG_PATH: '/mock-home/.fintoc/config.toml',
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  hint: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
  password: vi.fn(),
}))

const SESSION_URL = 'https://dashboard.fintoc.com/cli/authorize?state=stub'

const never = <T>(): Promise<T> => new Promise<T>(() => {})

const stubSession = (result: Promise<BrowserLoginResult>): BrowserLoginSession => {
  result.catch(() => {})
  return { url: SESSION_URL, result, cancel: vi.fn() }
}

const mockBrowserCallback = (result: BrowserLoginResult) =>
  vi.mocked(startBrowserLogin).mockResolvedValue(stubSession(Promise.resolve(result)))

const mockBrowserPending = () =>
  vi.mocked(startBrowserLogin).mockResolvedValue(stubSession(never<BrowserLoginResult>()))

const mockBrowserRejects = (err: unknown) =>
  vi.mocked(startBrowserLogin).mockResolvedValue(stubSession(Promise.reject(err)))

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
    // Default: the inline paste prompt hangs so the callback wins the race.
    vi.mocked(password).mockImplementation(() => never<string>())
  })

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY
  })

  describe('when called without flags', () => {
    test('runs browser flow in test mode and saves the result', async () => {
      mockBrowserCallback({
        secret: 'sk_test_browser',
        organizationName: 'Acme Corp',
        mode: 'test',
      })

      const program = createProgram()
      await program.parseAsync(['login'], { from: 'user' })

      expect(startBrowserLogin).toHaveBeenCalledWith(expect.objectContaining({ mode: 'test' }))
      expect(writeConfig).toHaveBeenCalledWith({ secret_key: 'sk_test_browser' })
      expect(success).toHaveBeenCalledWith('Authenticated as Acme Corp (test mode)')
    })
  })

  describe('when called with --mode live', () => {
    test('runs browser flow in live mode and stores key_name and expires_at', async () => {
      mockBrowserCallback({
        secret: 'sk_live_browser',
        organizationName: 'Acme Corp',
        mode: 'live',
        keyName: 'my-mac-cli',
        expiresAt: '2026-08-16T12:00:00Z',
      })

      const program = createProgram()
      await program.parseAsync(['login', '--mode', 'live'], { from: 'user' })

      expect(startBrowserLogin).toHaveBeenCalledWith(expect.objectContaining({ mode: 'live' }))
      expect(writeConfig).toHaveBeenCalledWith({
        secret_key: 'sk_live_browser',
        key_name: 'my-mac-cli',
        expires_at: '2026-08-16T12:00:00Z',
      })
      expect(success).toHaveBeenCalledWith('Authenticated as Acme Corp (live mode)')
      expect(hint).toHaveBeenCalledWith(
        `  Key 'my-mac-cli' stored in /mock-home/.fintoc/config.toml`,
      )
    })
  })

  describe('when --api-key is passed with a valid prefix', () => {
    test('skips the browser flow and uses the key directly', async () => {
      vi.mocked(whoami).mockResolvedValue({
        organizationName: 'Acme Corp',
        mode: 'test',
        apiVersion: '2023-03-15',
      })

      const program = createProgram()
      await program.parseAsync(['login', '--api-key', 'sk_test_manual'], { from: 'user' })

      expect(startBrowserLogin).not.toHaveBeenCalled()
      expect(whoami).toHaveBeenCalledWith('sk_test_manual')
      expect(writeConfig).toHaveBeenCalledWith({ secret_key: 'sk_test_manual' })
      expect(success).toHaveBeenCalledWith('Authenticated as Acme Corp (test mode)')
    })
  })

  describe('when --api-key has an invalid prefix', () => {
    test('rejects locally without calling whoami', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(
        program.parseAsync(['login', '--api-key', 'invalid_key'], { from: 'user' }),
      ).rejects.toThrow('process.exit')

      expect(whoami).not.toHaveBeenCalled()
      expect(writeConfig).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Invalid key format'))

      exitSpy.mockRestore()
    })
  })

  describe('when there is a saved key and the user does not confirm', () => {
    test('aborts without calling the browser flow', async () => {
      vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_existing' })
      vi.mocked(confirm).mockResolvedValue(false)

      const program = createProgram()
      await program.parseAsync(['login'], { from: 'user' })

      expect(confirm).toHaveBeenCalled()
      expect(startBrowserLogin).not.toHaveBeenCalled()
      expect(writeConfig).not.toHaveBeenCalled()
      expect(hint).toHaveBeenCalledWith('Login aborted.')
    })
  })

  describe('when there is a saved key and the user confirms', () => {
    test('proceeds to the browser flow', async () => {
      vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_existing' })
      vi.mocked(confirm).mockResolvedValue(true)
      mockBrowserCallback({
        secret: 'sk_test_new',
        organizationName: 'Globex',
        mode: 'test',
      })

      const program = createProgram()
      await program.parseAsync(['login'], { from: 'user' })

      expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ default: true }))
      expect(startBrowserLogin).toHaveBeenCalled()
      expect(success).toHaveBeenCalledWith('Authenticated as Globex (test mode)')
    })
  })

  describe('when --yes is passed', () => {
    test('skips the confirmation prompt', async () => {
      vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_existing' })
      mockBrowserCallback({
        secret: 'sk_test_new',
        organizationName: 'Acme',
        mode: 'test',
      })

      const program = createProgram()
      await program.parseAsync(['login', '--yes'], { from: 'user' })

      expect(confirm).not.toHaveBeenCalled()
      expect(startBrowserLogin).toHaveBeenCalled()
    })
  })

  describe('when the browser flow is denied', () => {
    test('exits with an error and hints', async () => {
      mockBrowserRejects(new BrowserLoginError('denied', 'Authorization was denied in the browser'))

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Authorization was denied in the browser')
      expect(writeConfig).not.toHaveBeenCalled()

      exitSpy.mockRestore()
    })
  })

  describe('when the dashboard returns a mismatched mode', () => {
    test('exits with a hint pointing at the right --mode flag', async () => {
      mockBrowserRejects(
        new BrowserLoginError('mismatch', "Dashboard returned mode 'live' but expected 'test'"),
      )

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow('process.exit')

      expect(hint).toHaveBeenCalledWith(expect.stringContaining('fintoc login --mode live'))
      expect(writeConfig).not.toHaveBeenCalled()

      exitSpy.mockRestore()
    })
  })

  describe('when the user pastes the key while the callback is still pending', () => {
    test('uses the pasted key and authenticates via whoami', async () => {
      mockBrowserPending()
      vi.mocked(password).mockResolvedValue('sk_test_pasted')
      vi.mocked(whoami).mockResolvedValue({
        organizationName: 'Acme Corp',
        mode: 'test',
        apiVersion: '2023-03-15',
      })

      const program = createProgram()
      await program.parseAsync(['login'], { from: 'user' })

      expect(password).toHaveBeenCalled()
      expect(whoami).toHaveBeenCalledWith('sk_test_pasted')
      expect(writeConfig).toHaveBeenCalledWith({ secret_key: 'sk_test_pasted' })
      expect(success).toHaveBeenCalledWith('Authenticated as Acme Corp (test mode)')
    })

    test('aborts cleanly when the user cancels with Ctrl+C', async () => {
      mockBrowserPending()
      const exitError = new Error('User cancelled')
      exitError.name = 'ExitPromptError'
      vi.mocked(password).mockRejectedValue(exitError)

      const program = createProgram()
      await program.parseAsync(['login'], { from: 'user' })

      expect(password).toHaveBeenCalled()
      expect(hint).toHaveBeenCalledWith('Login aborted.')
      expect(writeConfig).not.toHaveBeenCalled()
    })
  })

  describe('when the pasted key prefix does not match --mode', () => {
    test('rejects with mismatch and hints at the right --mode', async () => {
      mockBrowserPending()
      vi.mocked(password).mockResolvedValue('sk_live_pasted')

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow('process.exit')

      expect(whoami).not.toHaveBeenCalled()
      expect(writeConfig).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining("'live'"))
      expect(hint).toHaveBeenCalledWith(expect.stringContaining('fintoc login --mode live'))

      exitSpy.mockRestore()
    })

    test('rejects sk_test_ paste when --mode live was requested', async () => {
      mockBrowserPending()
      vi.mocked(password).mockResolvedValue('sk_test_pasted')

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(
        program.parseAsync(['login', '--mode', 'live'], { from: 'user' }),
      ).rejects.toThrow('process.exit')

      expect(whoami).not.toHaveBeenCalled()
      expect(writeConfig).not.toHaveBeenCalled()
      expect(hint).toHaveBeenCalledWith(expect.stringContaining('fintoc login --mode test'))

      exitSpy.mockRestore()
    })
  })

  describe('when the browser flow times out', () => {
    test('exits with an error and hints', async () => {
      mockBrowserRejects(
        new BrowserLoginError('timeout', 'Login timed out waiting for authorization.'),
      )

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow('process.exit')

      expect(error).toHaveBeenCalledWith(expect.stringContaining('timed out'))
      expect(writeConfig).not.toHaveBeenCalled()

      exitSpy.mockRestore()
    })
  })

  describe('when re-logging in with a previously stored jws_private_key', () => {
    test('preserves jws_private_key and warns that it may not apply', async () => {
      vi.mocked(readConfig).mockReturnValue({
        secret_key: 'sk_test_old',
        jws_private_key: '/path/to/key.pem',
      })
      vi.mocked(confirm).mockResolvedValue(true)
      mockBrowserCallback({
        secret: 'sk_test_new',
        organizationName: 'Globex',
        mode: 'test',
      })

      const program = createProgram()
      await program.parseAsync(['login'], { from: 'user' })

      expect(writeConfig).toHaveBeenCalledWith({
        secret_key: 'sk_test_new',
        jws_private_key: '/path/to/key.pem',
      })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('jws_private_key'))
    })

    test('does not warn when no jws_private_key was stored', async () => {
      vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_old' })
      vi.mocked(confirm).mockResolvedValue(true)
      mockBrowserCallback({
        secret: 'sk_test_new',
        organizationName: 'Globex',
        mode: 'test',
      })

      const program = createProgram()
      await program.parseAsync(['login'], { from: 'user' })

      expect(warn).not.toHaveBeenCalled()
    })

    test('does not warn on first login (no previous secret_key)', async () => {
      vi.mocked(readConfig).mockReturnValue({ jws_private_key: '/path/to/key.pem' })
      mockBrowserCallback({
        secret: 'sk_test_new',
        organizationName: 'Acme Corp',
        mode: 'test',
      })

      const program = createProgram()
      await program.parseAsync(['login'], { from: 'user' })

      expect(writeConfig).toHaveBeenCalledWith({
        secret_key: 'sk_test_new',
        jws_private_key: '/path/to/key.pem',
      })
      expect(warn).not.toHaveBeenCalled()
    })
  })

  describe('when writing the config fails after a successful auth', () => {
    test('exits with an error pointing at the config path', async () => {
      mockBrowserCallback({
        secret: 'sk_test_browser',
        organizationName: 'Acme Corp',
        mode: 'test',
      })
      vi.mocked(writeConfig).mockImplementationOnce(() => {
        throw new Error('EACCES')
      })

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow('process.exit')

      expect(error).toHaveBeenCalledWith(expect.stringContaining('could not write'))
      expect(success).not.toHaveBeenCalled()

      exitSpy.mockRestore()
    })
  })

  describe('when running in non-TTY without --api-key', () => {
    beforeEach(() => {
      process.stdin.isTTY = false
    })

    test('exits early with a hint to use --api-key', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow('process.exit')

      expect(startBrowserLogin).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Non-interactive terminal'))

      exitSpy.mockRestore()
    })
  })

  describe('when running in non-TTY with --api-key', () => {
    beforeEach(() => {
      process.stdin.isTTY = false
    })

    test('authenticates with the inline key', async () => {
      vi.mocked(whoami).mockResolvedValue({
        organizationName: 'Acme Corp',
        mode: 'test',
        apiVersion: '2023-03-15',
      })

      const program = createProgram()
      await program.parseAsync(['login', '--api-key', 'sk_test_inline'], { from: 'user' })

      expect(whoami).toHaveBeenCalledWith('sk_test_inline')
      expect(success).toHaveBeenCalledWith('Authenticated as Acme Corp (test mode)')
    })
  })

  describe('when running in non-TTY with --api-key, an existing session, and no --yes', () => {
    beforeEach(() => {
      process.stdin.isTTY = false
    })

    test('exits with an error asking for --yes', async () => {
      vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_existing' })

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })

      const program = createProgram()
      await expect(
        program.parseAsync(['login', '--api-key', 'sk_test_new'], { from: 'user' }),
      ).rejects.toThrow('process.exit')

      expect(whoami).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Non-interactive terminal'))
      expect(hint).toHaveBeenCalledWith(expect.stringContaining('Re-run with --yes to override.'))

      exitSpy.mockRestore()
    })
  })
})
