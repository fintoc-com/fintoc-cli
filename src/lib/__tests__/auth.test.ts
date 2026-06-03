import { Fintoc } from 'fintoc'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createClient, maskKey, resolveAuth } from '../auth.js'
import { readConfig } from '../config.js'

vi.mock('fintoc', () => ({
  Fintoc: vi.fn(),
}))

vi.mock('../config.js', () => ({
  readConfig: vi.fn(),
}))

vi.mock('../version.js', () => ({
  getCliVersion: vi.fn(() => '0.1.0'),
}))

describe('resolveAuth', () => {
  const originalEnv = process.env.FINTOC_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.FINTOC_API_KEY
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FINTOC_API_KEY = originalEnv
    } else {
      delete process.env.FINTOC_API_KEY
    }
  })

  test('returns flag value with highest priority', () => {
    process.env.FINTOC_API_KEY = 'sk_test_env'
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    const result = resolveAuth({ apiKey: 'sk_test_flag' })
    expect(result).toEqual({ secretKey: 'sk_test_flag', source: 'flag' })
  })

  test('returns env value when no flag', () => {
    process.env.FINTOC_API_KEY = 'sk_test_env'
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    const result = resolveAuth()
    expect(result).toEqual({ secretKey: 'sk_test_env', source: 'env' })
  })

  test('returns config value when no flag or env', () => {
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    const result = resolveAuth()
    expect(result).toEqual({ secretKey: 'sk_test_config', source: 'config' })
  })

  test('propagates key_name and expires_at when source is config', () => {
    vi.mocked(readConfig).mockReturnValue({
      secret_key: 'sk_test_config',
      key_name: 'francisca-mac-cli',
      expires_at: '2026-08-16T12:00:00Z',
    })

    const result = resolveAuth()
    expect(result).toEqual({
      secretKey: 'sk_test_config',
      source: 'config',
      keyName: 'francisca-mac-cli',
      expiresAt: '2026-08-16T12:00:00Z',
    })
  })

  test('does not propagate key_name or expires_at when source is flag', () => {
    vi.mocked(readConfig).mockReturnValue({
      secret_key: 'sk_test_config',
      key_name: 'francisca-mac-cli',
      expires_at: '2026-08-16T12:00:00Z',
    })

    const result = resolveAuth({ apiKey: 'sk_test_flag' })
    expect(result.keyName).toBeUndefined()
    expect(result.expiresAt).toBeUndefined()
  })

  test('does not propagate key_name or expires_at when source is env', () => {
    process.env.FINTOC_API_KEY = 'sk_test_env'
    vi.mocked(readConfig).mockReturnValue({
      secret_key: 'sk_test_config',
      key_name: 'francisca-mac-cli',
      expires_at: '2026-08-16T12:00:00Z',
    })

    const result = resolveAuth()
    expect(result.keyName).toBeUndefined()
    expect(result.expiresAt).toBeUndefined()
  })

  test('throws when --api-key is empty string', () => {
    process.env.FINTOC_API_KEY = 'sk_test_env'
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    expect(() => resolveAuth({ apiKey: '' })).toThrow('API key is empty')
  })

  test('throws when --api-key is only whitespace', () => {
    process.env.FINTOC_API_KEY = 'sk_test_env'
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    expect(() => resolveAuth({ apiKey: '   ' })).toThrow('API key is empty')
  })

  test('throws when FINTOC_API_KEY is empty string', () => {
    process.env.FINTOC_API_KEY = ''
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    expect(() => resolveAuth()).toThrow('FINTOC_API_KEY is set but empty')
  })

  test('throws when FINTOC_API_KEY is only whitespace', () => {
    process.env.FINTOC_API_KEY = '   '
    vi.mocked(readConfig).mockReturnValue({ secret_key: 'sk_test_config' })

    expect(() => resolveAuth()).toThrow('FINTOC_API_KEY is set but empty')
  })

  test('throws when no key found', () => {
    vi.mocked(readConfig).mockReturnValue({})

    expect(() => resolveAuth()).toThrow('No API key found')
  })
})

describe('createClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('passes fintoc-cli user agent to SDK', () => {
    createClient('sk_test_123')
    expect(Fintoc).toHaveBeenCalledWith('sk_test_123', undefined, {
      userAgent: 'fintoc-cli/0.1.0',
    })
  })

  test('forwards JWS private key to SDK', () => {
    createClient('sk_test_123', '/path/to/key.pem')
    expect(Fintoc).toHaveBeenCalledWith('sk_test_123', '/path/to/key.pem', {
      userAgent: 'fintoc-cli/0.1.0',
    })
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
