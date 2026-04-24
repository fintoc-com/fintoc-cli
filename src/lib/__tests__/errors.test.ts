import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { handleError } from '../errors.js'
import { error, log } from '../output.js'

vi.mock('../output.js', () => ({
  log: vi.fn(),
  error: vi.fn(),
}))

// Helper to create a FintocError-like error with a specific constructor name.
// The SDK builds messages as: "type[: code][ (param)]\nmessage"
const createFintocError = (
  name: string,
  { type, code, param, message }: { type: string; code?: string; param?: string; message: string },
) => {
  let msg = type
  if (code) {
    msg += `: ${code}`
  }
  if (param) {
    msg += ` (${param})`
  }
  msg += `\n${message}`
  const err = new Error(msg)
  Object.defineProperty(err, 'constructor', { value: { name } })
  return err
}

// Helper to create a connectivity error (Axios-style)
const createNetworkError = (code: string) => {
  const err = new Error(`connect ${code}`)
  ;(err as unknown as Record<string, string>).code = code
  return err
}

describe('handleError', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })
  })

  afterEach(() => {
    exitSpy.mockRestore()
  })

  describe('no API key', () => {
    test('formats no-auth error with next steps', () => {
      const err = new Error(
        'No API key found. To authenticate:\n\n  Run:   fintoc login\n  Or:    export FINTOC_SECRET_KEY=sk_test_...',
      )

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('No API key found. To authenticate:')
      expect(log).toHaveBeenCalledWith('  Run:   fintoc login')
      expect(log).toHaveBeenCalledWith(
        '  Get your API keys at: https://dashboard.fintoc.com/api-keys',
      )
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('connectivity errors', () => {
    test.each(['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'ERR_NETWORK'])(
      'formats %s as connectivity error',
      (code) => {
        const err = createNetworkError(code)

        expect(() => handleError(err)).toThrow('process.exit')

        expect(error).toHaveBeenCalledWith('Could not connect to api.fintoc.com')
        expect(log).toHaveBeenCalledWith('  Check your internet connection, or run: fintoc doctor')
      },
    )
  })

  describe('missing JWS key', () => {
    test('formats JWS-related error with next steps', () => {
      const err = new Error('JWS private key is required')

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('JWS private key required for transfer operations')
      expect(log).toHaveBeenCalledWith('  More info:    https://docs.fintoc.com/docs/transfers')
    })
  })

  describe('not found (404)', () => {
    test('formats not found error with resource context', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'missing_resource',
        param: 'id',
        message: 'No such payment_intent: pi_invalid',
      })

      expect(() =>
        handleError(err, { resourceName: 'payment_intents', verb: 'get', id: 'pi_invalid' }),
      ).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith("Error (404): 'pi_invalid' not found")
      expect(log).toHaveBeenCalledWith('  List available: fintoc payment_intents list')
    })

    test('formats not found error without ID', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'missing_resource',
        param: 'id',
        message: 'No such payment_intent: pi_invalid',
      })

      expect(() => handleError(err, { resourceName: 'payment_intents', verb: 'get' })).toThrow(
        'process.exit',
      )

      expect(error).toHaveBeenCalledWith('Error (404): Resource not found')
    })
  })

  describe('authentication error', () => {
    test('formats AuthenticationError with next steps', () => {
      const err = createFintocError('AuthenticationError', {
        type: 'authentication_error',
        message: 'Invalid API key',
      })

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Authentication failed: Invalid API key')
      expect(log).toHaveBeenCalledWith('  Check your API key and try again.')
      expect(log).toHaveBeenCalledWith(
        '  Get your API keys at: https://dashboard.fintoc.com/api-keys',
      )
    })
  })

  describe('other Fintoc API errors', () => {
    test('formats generic FintocError with its human-readable message', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'parameter_invalid_integer',
        param: 'amount',
        message: 'This value must be a positive integer.',
      })

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('This value must be a positive integer.')
    })
  })

  describe('unknown errors', () => {
    test('formats unknown Error with its message', () => {
      const err = new Error('Something went wrong')

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Something went wrong')
    })

    test('formats non-Error with fallback message', () => {
      expect(() => handleError('string error')).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('An unexpected error occurred')
    })

    test('formats null error with fallback message', () => {
      expect(() => handleError(null)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('An unexpected error occurred')
    })
  })

  describe('process.exit', () => {
    test('always exits with code 1', () => {
      const err = new Error('any error')

      expect(() => handleError(err)).toThrow('process.exit')

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })
})
