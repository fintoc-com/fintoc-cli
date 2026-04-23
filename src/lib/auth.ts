import { Fintoc } from 'fintoc'

import { readConfig } from './config.js'

export type AuthSource = 'flag' | 'env' | 'config'

export type ResolvedAuth = {
  secretKey: string
  source: AuthSource
}

export type WhoamiResponse = {
  organization_name: string
  mode: string
  api_version: string
}

export const resolveAuth = (options?: { apiKey?: string }): ResolvedAuth => {
  if (options?.apiKey) {
    return { secretKey: options.apiKey, source: 'flag' }
  }

  const envKey = process.env.FINTOC_SECRET_KEY
  if (envKey) {
    return { secretKey: envKey, source: 'env' }
  }

  const config = readConfig()
  if (config.secret_key) {
    return { secretKey: config.secret_key, source: 'config' }
  }

  throw new Error(
    [
      'No API key found. To authenticate:',
      '',
      '  Run:   fintoc login',
      '  Or:    export FINTOC_SECRET_KEY=sk_test_...',
      '  Or:    fintoc --api-key sk_test_... <command>',
      '',
      '  Get your API keys at: https://dashboard.fintoc.com/api-keys',
    ].join('\n'),
  )
}

export const createClient = (secretKey: string, jwsPrivateKey?: string): Fintoc => {
  return new Fintoc(secretKey, jwsPrivateKey)
}

export const whoami = async (secretKey: string): Promise<WhoamiResponse> => {
  const client = createClient(secretKey)
  const result = await client.whoami.get('whoami')
  return result as unknown as WhoamiResponse
}

export const maskKey = (key: string): string => {
  const prefixMatch = key.match(/^(sk_(?:test|live)_)/)
  if (prefixMatch) {
    return `${prefixMatch[1]}····`
  }
  if (key.length <= 8) {
    return '····'
  }
  return `${key.slice(0, 4)}····`
}
