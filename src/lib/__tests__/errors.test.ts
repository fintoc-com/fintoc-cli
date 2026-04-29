import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { handleError } from '../errors.js'
import { error, hint } from '../output.js'

vi.mock('../output.js', () => ({
  log: vi.fn(),
  error: vi.fn(),
  hint: vi.fn(),
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
      expect(hint).toHaveBeenCalledWith('  Run:   fintoc login')
      expect(hint).toHaveBeenCalledWith(
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
        expect(hint).toHaveBeenCalledWith('  Check your internet connection, or run: fintoc doctor')
      },
    )
  })

  describe('missing JWS key', () => {
    test('formats JWS-related error with next steps', () => {
      const err = createFintocError('AuthenticationError', {
        type: 'authentication_error',
        code: 'missing_jws_signature_header',
        message:
          "Missing signature in 'Fintoc-JWS-Signature' header. This request requires a valid JWS Signature.",
      })

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('JWS private key required for transfer operations')
      expect(hint).toHaveBeenCalledWith('  More info:  https://docs.fintoc.com/docs/transfers')
    })
  })

  describe('invalid link token', () => {
    test('formats invalid_link_token error with next steps', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'invalid_link_token',
        param: 'link_token',
        message: 'Invalid link access token',
      })

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Invalid link token format')
      expect(hint).toHaveBeenCalledWith(
        '  Link tokens use the format: LINK_ID_token_LINK_ACCESS_TOKEN',
      )
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
        handleError(err, { cliPath: 'payment_intents', verb: 'get', id: 'pi_invalid' }),
      ).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Error (404): No such payment_intent: pi_invalid')
      expect(hint).toHaveBeenCalledWith('  List available: fintoc payment_intents list')
    })

    test('formats not found error without ID and no API message', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'missing_resource',
        param: 'id',
        message: '',
      })

      expect(() => handleError(err, { cliPath: 'payment_intents', verb: 'get' })).toThrow(
        'process.exit',
      )

      expect(error).toHaveBeenCalledWith('Error (404): Resource not found')
    })

    test('falls back to id-based message when API message is empty', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'missing_resource',
        param: 'id',
        message: '',
      })

      expect(() =>
        handleError(err, { cliPath: 'payment_intents', verb: 'get', id: 'pi_invalid' }),
      ).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith("Error (404): 'pi_invalid' not found")
    })

    test('shows API message when missing_resource is not a classic 404', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'missing_resource',
        param: 'enabled_events',
        message: 'No such event: ["link.created"]',
      })

      expect(() => handleError(err, { cliPath: 'webhook_endpoints', verb: 'create' })).toThrow(
        'process.exit',
      )

      expect(error).toHaveBeenCalledWith('Error (404): No such event: ["link.created"]')
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
      expect(hint).toHaveBeenCalledWith('  Check your API key and try again.')
      expect(hint).toHaveBeenCalledWith(
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

  describe('AxiosError with structured response', () => {
    test('extracts message from response.data.error', () => {
      const err = new Error('Request failed with status code 400')
      ;(err as unknown as Record<string, unknown>).response = {
        status: 400,
        data: {
          error: {
            type: 'invalid_request_error',
            code: 'invalid_enum',
            param: 'status',
            message: "Invalid status: foo. Must be one of 'succeeded', 'failed'.",
          },
        },
      }

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith(
        "Invalid status: foo. Must be one of 'succeeded', 'failed'.",
      )
    })

    test('handles AxiosError with missing_resource code as 404', () => {
      const err = new Error('Request failed with status code 404')
      ;(err as unknown as Record<string, unknown>).response = {
        status: 404,
        data: {
          error: {
            type: 'invalid_request_error',
            code: 'missing_resource',
            param: 'id',
            message: 'No such resource',
          },
        },
      }

      expect(() =>
        handleError(err, { cliPath: 'payment_intents', verb: 'get', id: 'pi_bad' }),
      ).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Error (404): No such resource')
    })

    test('handles AxiosError with JWS missing code', () => {
      const err = new Error('Request failed with status code 401')
      ;(err as unknown as Record<string, unknown>).response = {
        status: 401,
        data: {
          error: {
            type: 'authentication_error',
            code: 'missing_jws_signature_header',
            message: "Missing signature in 'Fintoc-JWS-Signature' header.",
          },
        },
      }

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('JWS private key required for transfer operations')
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

  describe('when json is true', () => {
    let stderrSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      stderrSpy.mockRestore()
    })

    test('emits JSON for no-auth error', () => {
      const err = new Error('No API key found')

      expect(() => handleError(err, { json: true })).toThrow('process.exit')

      const output = JSON.parse(stderrSpy.mock.calls[0][0] as string)
      expect(output).toEqual({
        error: { type: 'auth_error', message: 'No API key found' },
      })
    })

    test('emits JSON for connectivity error', () => {
      const err = createNetworkError('ECONNREFUSED')

      expect(() => handleError(err, { json: true })).toThrow('process.exit')

      const output = JSON.parse(stderrSpy.mock.calls[0][0] as string)
      expect(output).toEqual({
        error: { type: 'connectivity_error', message: 'Could not connect to api.fintoc.com' },
      })
    })

    test('emits JSON for FintocError with structured fields', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'missing_resource',
        param: 'id',
        message: 'No such payment_intent: pi_invalid',
      })

      expect(() => handleError(err, { json: true, id: 'pi_invalid' })).toThrow('process.exit')

      const output = JSON.parse(stderrSpy.mock.calls[0][0] as string)
      expect(output).toEqual({
        error: {
          type: 'invalid_request_error',
          code: 'missing_resource',
          message: 'No such payment_intent: pi_invalid',
        },
      })
    })

    test('emits JSON for unknown error', () => {
      const err = new Error('Something broke')

      expect(() => handleError(err, { json: true })).toThrow('process.exit')

      const output = JSON.parse(stderrSpy.mock.calls[0][0] as string)
      expect(output).toEqual({
        error: { type: 'unknown_error', message: 'Something broke' },
      })
    })

    test('emits JSON for non-Error value', () => {
      expect(() => handleError(42, { json: true })).toThrow('process.exit')

      const output = JSON.parse(stderrSpy.mock.calls[0][0] as string)
      expect(output).toEqual({
        error: { type: 'unknown_error', message: 'An unexpected error occurred' },
      })
    })
  })
})
