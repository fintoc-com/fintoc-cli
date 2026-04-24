import { error, log } from './output.js'

type ErrorContext = {
  resourceName?: string
  verb?: string
  id?: string
}

// Parsed fields from a FintocError message.
// The SDK builds messages as: "type[: code][ (param)]\nmessage[\nCheck the docs...]"
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

// Detect FintocError subclasses by constructor name (not exported from SDK)
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

// Parse structured fields from a FintocError message.
// Format: "type[: code][ (param)]\nmessage[\nCheck the docs for more info: url]"
const parseFintocError = (err: unknown): FintocErrorFields | undefined => {
  if (!isFintocError(err)) {
    return undefined
  }

  const lines = err.message.split('\n')
  const firstLine = lines[0] ?? ''

  // Parse "type[: code][ (param)]"
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

// Detect "No API key" error thrown by resolveAuth
const isNoAuthError = (err: unknown): boolean =>
  err instanceof Error && err.message.includes('No API key found')

// Detect network/connectivity errors (Axios errors without a response)
const isConnectivityError = (err: unknown): boolean => {
  if (!(err instanceof Error)) {
    return false
  }
  const code = (err as { code?: string }).code
  return typeof code === 'string' && CONNECTIVITY_CODES.has(code)
}

const isJwsMissingError = (err: unknown): boolean => {
  if (!(err instanceof Error)) {
    return false
  }
  const msg = err.message.toLowerCase()
  return msg.includes('jws private key') || msg.includes('jws_private_key')
}

const printNextSteps = (steps: string[]) => {
  log('')
  steps.forEach((step) => log(`  ${step}`))
}

export const handleError = (err: unknown, context?: ErrorContext): never => {
  // No API key configured
  if (isNoAuthError(err)) {
    error('No API key found. To authenticate:')
    printNextSteps([
      'Run:   fintoc login',
      'Or:    export FINTOC_SECRET_KEY=sk_test_...',
      'Or:    fintoc --api-key sk_test_... <command>',
      '',
      'Get your API keys at: https://dashboard.fintoc.com/api-keys',
    ])
    return process.exit(1)
  }

  // Network / connectivity failure
  if (isConnectivityError(err)) {
    error('Could not connect to api.fintoc.com')
    printNextSteps(['Check your internet connection, or run: fintoc doctor'])
    return process.exit(1)
  }

  // JWS private key missing (for transfers)
  if (isJwsMissingError(err)) {
    error('JWS private key required for transfer operations')
    printNextSteps([
      'Set it with:  fintoc config set jws_private_key <path>',
      'Or pass:      --jws-private-key <path>',
      'More info:    https://docs.fintoc.com/docs/transfers',
    ])
    return process.exit(1)
  }

  // Parse structured fields from FintocError
  const fields = parseFintocError(err)

  if (fields) {
    // Resource not found (404) — API returns code "missing_resource"
    if (fields.code === 'missing_resource') {
      const label = context?.id ? `'${context.id}' not found` : 'Resource not found'
      error(`Error (404): ${label}`)
      if (context?.resourceName) {
        printNextSteps([`List available: fintoc ${context.resourceName} list`])
      }
      return process.exit(1)
    }

    // Authentication error from the API (invalid key, expired, etc.)
    if (fields.type === 'authentication_error') {
      error(`Authentication failed: ${fields.message ?? 'Invalid API key'}`)
      printNextSteps([
        'Check your API key and try again.',
        'Get your API keys at: https://dashboard.fintoc.com/api-keys',
      ])
      return process.exit(1)
    }

    // Other Fintoc API errors — show the human-readable message
    error(fields.message ?? (err as Error).message)
    return process.exit(1)
  }

  // Unknown / unexpected errors
  const message = err instanceof Error ? err.message : 'An unexpected error occurred'
  error(message)
  return process.exit(1)
}
