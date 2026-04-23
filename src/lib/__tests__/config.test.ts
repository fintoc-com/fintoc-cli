import type { FintocConfig } from '../../types.js'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:os', () => ({
  homedir: () => '/mock-home',
}))

const { readConfig, writeConfig, clearConfig, CONFIG_DIR, CONFIG_PATH } =
  await import('../config.js')

const fs = await import('node:fs')

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
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw fsError('ENOENT')
      })

      expect(readConfig()).toEqual({})
    })

    test('parses valid TOML', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('secret_key = "sk_test_123"')

      const config = readConfig()
      expect(config).toEqual({ secret_key: 'sk_test_123' })
    })

    test('rethrows non-ENOENT errors', () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw fsError('EACCES')
      })

      expect(() => readConfig()).toThrow('EACCES')
    })
  })

  describe('writeConfig', () => {
    test('creates directory and writes file with correct permissions', () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined)

      const config: FintocConfig = { secret_key: 'sk_test_abc' }
      writeConfig(config)

      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock-home/.fintoc', {
        recursive: true,
        mode: 0o700,
      })
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock-home/.fintoc/config.toml',
        expect.stringContaining('secret_key'),
        { mode: 0o600 },
      )
    })

    test('omits undefined values', () => {
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined)
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined)

      writeConfig({ secret_key: 'sk_test_abc' })

      const written = vi.mocked(fs.writeFileSync).mock.calls[0]![1] as string
      expect(written).not.toContain('jws_private_key')
    })
  })

  describe('clearConfig', () => {
    test('deletes the config file', () => {
      vi.mocked(fs.unlinkSync).mockReturnValue(undefined)

      clearConfig()

      expect(fs.unlinkSync).toHaveBeenCalledWith('/mock-home/.fintoc/config.toml')
    })

    test('is silent when file does not exist', () => {
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw fsError('ENOENT')
      })

      expect(() => clearConfig()).not.toThrow()
    })

    test('rethrows non-ENOENT errors', () => {
      vi.mocked(fs.unlinkSync).mockImplementation(() => {
        throw fsError('EACCES')
      })

      expect(() => clearConfig()).toThrow('EACCES')
    })
  })
})
