import {
  API_HOST,
  DASHBOARD_API_KEYS_URL,
  DOCS_LINKS_URL,
  DOCS_TRANSFERS_URL,
} from './constants.js'
import { error, hint } from './output.js'

type ErrorContext = {
  cliPath?: string
  verb?: string
  id?: string
  json?: boolean
  availableVerbs?: string[]
}

// The SDK builds error messages as: "type[: code][ (param)]\nmessage[\nCheck the docs...]"
type FintocErrorFields = {
  type: string
  code?: string
  param?: string
  message?: string
}

const CONNECTIVITY_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'ERR_NETWORK',
])

// Checked by constructor name because FintocError subclasses are not exported from the SDK
const FINTOC_ERROR_CLASSES = new Set([
  'FintocError',
  'ApiError',
  'AuthenticationError',
  'LinkError',
  'InstitutionError',
  'InvalidRequestError',
])

const isFintocError = (err: unknown): err is Error =>
  err instanceof Error && FINTOC_ERROR_CLASSES.has(err.constructor.name)

const parseFintocError = (err: unknown): FintocErrorFields | undefined => {
  if (isFintocError(err)) {
    const lines = err.message.split('\n')
    const firstLine = lines[0] ?? ''

    const match = firstLine.match(/^(\w+)(?::\s*(\w+))?(?:\s*\((\w+)\))?$/)
    if (!match) {
      return { type: firstLine }
    }

    return {
      type: match[1],
      code: match[2],
      param: match[3],
      message: lines[1],
    }
  }

  if (err instanceof Error) {
    const { response } = err as { response?: { data?: { error?: Record<string, string> } } }
    const apiError = response?.data?.error
    if (apiError && typeof apiError.type === 'string') {
      return {
        type: apiError.type,
        code: apiError.code,
        param: apiError.param,
        message: apiError.message,
      }
    }
  }

  return undefined
}

const isNoAuthError = (err: unknown): boolean =>
  err instanceof Error && err.message.includes('No API key found')

const isConnectivityError = (err: unknown): boolean => {
  if (!(err instanceof Error)) {
    return false
  }
  const code = (err as { code?: string }).code
  return typeof code === 'string' && CONNECTIVITY_CODES.has(code)
}

const printNextSteps = (steps: string[]) => {
  hint('')
  steps.forEach((step) => hint(`  ${step}`))
}

const exitJsonError = (fields: { type: string; code?: string; message: string }): never => {
  console.error(JSON.stringify({ error: fields }))
  return process.exit(1)
}

export const handleError = (err: unknown, context?: ErrorContext): never => {
  if (isNoAuthError(err)) {
    if (context?.json) {
      return exitJsonError({ type: 'auth_error', message: 'No API key found' })
    }
    error('No API key found. To authenticate:')
    printNextSteps([
      'Run:   fintoc login',
      'Or:    export FINTOC_API_KEY=sk_test_...',
      'Or:    fintoc --api-key sk_test_... <command>',
      '',
      `Get your API keys at: ${DASHBOARD_API_KEYS_URL}`,
    ])
    return process.exit(1)
  }

  if (isConnectivityError(err)) {
    if (context?.json) {
      return exitJsonError({
        type: 'connectivity_error',
        message: `Could not connect to ${API_HOST}`,
      })
    }
    error(`Could not connect to ${API_HOST}`)
    printNextSteps(['Check your internet connection, or run: fintoc doctor'])
    return process.exit(1)
  }

  const fields = parseFintocError(err)

  if (fields) {
    if (context?.json) {
      return exitJsonError({
        type: fields.type,
        code: fields.code,
        message: fields.message ?? (err as Error).message,
      })
    }

    if (fields.code === 'missing_jws_signature_header') {
      error('JWS private key required for transfer operations')
      printNextSteps([
        'Pass:       --jws-private-key <path>',
        'Or set in:  ~/.fintoc/config.toml (jws_private_key = "<path>")',
        `More info:  ${DOCS_TRANSFERS_URL}`,
      ])
      return process.exit(1)
    }

    if (fields.code === 'invalid_link_token') {
      error('Invalid link token format')
      printNextSteps([
        'Link tokens use the format: LINK_ID_token_LINK_ACCESS_TOKEN',
        'You can find link tokens in the response when creating a link.',
        `More info:  ${DOCS_LINKS_URL}`,
      ])
      return process.exit(1)
    }

    if (fields.code === 'missing_resource') {
      const fallback = context?.id ? `'${context.id}' not found` : 'Resource not found'
      error(`Error (404): ${fields.message?.trim() || fallback}`)
      if (context?.cliPath && context.availableVerbs?.includes('list')) {
        printNextSteps([`List available: fintoc ${context.cliPath} list`])
      }
      return process.exit(1)
    }

    if (fields.type === 'authentication_error') {
      error(`Authentication failed: ${fields.message ?? 'Invalid API key'}`)
      printNextSteps([
        'Check your API key and try again.',
        `Get your API keys at: ${DASHBOARD_API_KEYS_URL}`,
      ])
      return process.exit(1)
    }

    error(fields.message ?? (err as Error).message)
    return process.exit(1)
  }

  const message = err instanceof Error ? err.message : 'An unexpected error occurred'
  if (context?.json) {
    return exitJsonError({ type: 'unknown_error', message })
  }
  error(message)
  return process.exit(1)
}
