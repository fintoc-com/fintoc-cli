import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { maskKey, resolveAuth } from '../auth.js'
import { readConfig } from '../config.js'

vi.mock('../config.js', () => ({
  readConfig: vi.fn(),
}))

describe('resolveAuth', () => {
  const originalEnv = process.env.FINTOC_SECRET_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.FINTOC_SECRET_KEY
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FINTOC_SECRET_KEY = originalEnv
    } else {
      delete process.env.FINTOC_SECRET_KEY
    }
  })

  test('returns flag value with highest priority', () => {
    process.env.FINTOC_SECRET_KEY = 'sk_test_env'
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    const result = resolveAuth({ apiKey: 'sk_test_flag' })
    expect(result).toEqual({ secretKey: 'sk_test_flag', source: 'flag' })
  })

  test('returns env value when no flag', () => {
    process.env.FINTOC_SECRET_KEY = 'sk_test_env'
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    const result = resolveAuth()
    expect(result).toEqual({ secretKey: 'sk_test_env', source: 'env' })
  })

  test('returns config value when no flag or env', () => {
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    const result = resolveAuth()
    expect(result).toEqual({ secretKey: 'sk_test_config', source: 'config' })
  })

  test('throws when no key found', () => {
    vi.mocked(readConfig).mockReturnValue({})

    expect(() => resolveAuth()).toThrow('No API key found')
  })
})

describe('maskKey', () => {
  test('masks test key showing prefix', () => {
    expect(maskKey('sk_test_abc123def456')).toBe('sk_test_····')
  })

  test('masks live key showing prefix', () => {
    expect(maskKey('sk_live_abc123def456')).toBe('sk_live_····')
  })

  test('masks short key', () => {
    expect(maskKey('short')).toBe('····')
  })

  test('masks non-standard key', () => {
    expect(maskKey('some_other_long_key_value')).toBe('some····')
  })
})
