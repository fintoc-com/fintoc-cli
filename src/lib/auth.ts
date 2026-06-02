import { Fintoc } from 'fintoc'
import { readConfig } from './config.js'
import { DASHBOARD_API_KEYS_URL } from './constants.js'
import { getCliVersion } from './version.js'

export type AuthSource = 'flag' | 'env' | 'config'

export type ResolvedAuth = {
  secretKey: string
  source: AuthSource
  keyName?: string
  expiresAt?: string
}

export const resolveAuth = (options?: { apiKey?: string }): ResolvedAuth => {
  if (options?.apiKey !== undefined) {
    if (!options.apiKey.trim()) {
      throw new Error('API key is empty. Provide a valid key with --api-key or remove the flag.')
    }
    return { secretKey: options.apiKey, source: 'flag' }
  }

  const envKey = process.env.FINTOC_API_KEY
  if (envKey !== undefined) {
    if (!envKey.trim()) {
      throw new Error('FINTOC_API_KEY is set but empty. Provide a valid key or unset the variable.')
    }
    return { secretKey: envKey, source: 'env' }
  }

  const config = readConfig()
  if (config.secret_key) {
    return {
      secretKey: config.secret_key,
      source: 'config',
      keyName: config.key_name,
      expiresAt: config.expires_at,
    }
  }

  throw new Error(
    [
      'No API key found. To authenticate:',
      '',
      '  Run:   fintoc login',
      '  Or:    export FINTOC_API_KEY=sk_test_...',
      '  Or:    fintoc --api-key sk_test_... <command>',
      '',
      `  Get your API keys at: ${DASHBOARD_API_KEYS_URL}`,
    ].join('\n'),
  )
}

export const createClient = (secretKey: string, jwsPrivateKey?: string) => {
  return new Fintoc(secretKey, jwsPrivateKey, {
    userAgent: `fintoc-cli/${getCliVersion()}`,
  })
}

export const whoami = async (secretKey: string) => {
  const client = createClient(secretKey)
  const result = await client.whoami.get('whoami')
  const mode = result.api_key.mode
  if (mode !== 'test' && mode !== 'live') {
    throw new Error(`Unexpected mode from API: ${mode}`)
  }
  return {
    organizationName: result.organization.name,
    mode,
    apiVersion:
      result.organization.api_version instanceof Date
        ? result.organization.api_version.toISOString().slice(0, 10)
        : String(result.organization.api_version),
  }
}

export const maskKey = (key: string) => {
  const prefixMatch = key.match(/^(sk_(?:test|live)_)/)
  if (prefixMatch) {
    return `${prefixMatch[1]}····`
  }
  if (key.length <= 8) {
    return '····'
  }
  return `${key.slice(0, 4)}····`
}
