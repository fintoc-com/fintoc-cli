import type { FintocConfig } from '../../types.js'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { clearConfig, CONFIG_DIR, CONFIG_PATH, readConfig, writeConfig } from '../config.js'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}))
vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))
vi.mock('../constants.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../constants.js')>()
  return {
    ...actual,
    CONFIG_DIR_PERMISSIONS: 0o700,
    CONFIG_FILE_PERMISSIONS: 0o600,
  }
})

const fsError = (code: string): NodeJS.ErrnoException => {
  const err = new Error(code) as NodeJS.ErrnoException
  err.code = code
  return err
}

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('has correct paths', () => {
    expect(CONFIG_DIR).toBe('/mock-home/.fintoc')
    expect(CONFIG_PATH).toBe('/mock-home/.fintoc/config.toml')
  })

  describe('readConfig', () => {
    test('returns empty object when file does not exist', () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw fsError('ENOENT')
      })

      expect(readConfig()).toEqual({})
    })

    test('parses valid TOML', () => {
      vi.mocked(readFileSync).mockReturnValue('secret_key = "sk_test_123"')

      const config = readConfig()
      expect(config).toEqual({ secret_key: 'sk_test_123' })
    })

    test('rethrows non-ENOENT errors', () => {
      vi.mocked(readFileSync).mockImplementation(() => {
        throw fsError('EACCES')
      })

      expect(() => readConfig()).toThrow('EACCES')
    })
  })

  describe('writeConfig', () => {
    test('creates directory and writes file with correct permissions', () => {
      const config: FintocConfig = { secret_key: 'sk_test_abc' }
      writeConfig(config)

      expect(mkdirSync).toHaveBeenCalledWith('/mock-home/.fintoc', {
        recursive: true,
        mode: 0o700,
      })
      expect(writeFileSync).toHaveBeenCalledWith(
        '/mock-home/.fintoc/config.toml',
        expect.stringContaining('secret_key'),
        { mode: 0o600 },
      )
    })

    test('omits undefined values', () => {
      writeConfig({ secret_key: 'sk_test_abc' })

      const written = vi.mocked(writeFileSync).mock.calls[0]![1] as string
      expect(written).not.toContain('jws_private_key')
    })
  })

  describe('clearConfig', () => {
    test('deletes the config file', () => {
      clearConfig()

      expect(unlinkSync).toHaveBeenCalledWith('/mock-home/.fintoc/config.toml')
    })

    test('is silent when file does not exist', () => {
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw fsError('ENOENT')
      })

      expect(() => clearConfig()).not.toThrow()
    })

    test('rethrows non-ENOENT errors', () => {
      vi.mocked(unlinkSync).mockImplementation(() => {
        throw fsError('EACCES')
      })

      expect(() => clearConfig()).toThrow('EACCES')
    })
  })
})
