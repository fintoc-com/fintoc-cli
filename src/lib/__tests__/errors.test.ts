import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AuthError, handleError, UsageError } from '../errors.js'
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

const createPromptClosedError = () => {
  const err = new Error('User force closed the prompt with 0 null')
  err.name = 'ExitPromptError'
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
        'No API key found. To authenticate:\n\n  Run:   fintoc login\n  Or:    export FINTOC_API_KEY=sk_test_...',
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

  describe('empty API key', () => {
    test('prints the message without the login steps', () => {
      const err = new AuthError(
        'API key is empty. Provide a valid key with --api-key or remove the flag.',
        'empty_api_key',
      )

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith(
        'API key is empty. Provide a valid key with --api-key or remove the flag.',
      )
      expect(hint).not.toHaveBeenCalled()
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

      expect(error).toHaveBeenCalledWith('JWS private key required to sign this request')
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
        handleError(err, {
          cliPath: 'payment_intents',
          verb: 'get',
          id: 'pi_invalid',
          availableVerbs: ['get', 'list'],
        }),
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
      expect(hint).not.toHaveBeenCalledWith(expect.stringContaining('List available'))
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
      expect(hint).not.toHaveBeenCalledWith(expect.stringContaining('List available'))
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

  describe('IP not allow-listed', () => {
    test('formats allowed_cidr_blocks_does_not_contain_ip with IP allow list next steps', () => {
      const err = createFintocError('AuthenticationError', {
        type: 'authentication_error',
        code: 'allowed_cidr_blocks_does_not_contain_ip',
        message:
          'IP is not in allowed CIDR blocks. Please check that your allowed CIDR blocks contains your IP.',
      })

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith(
        'IP is not in allowed CIDR blocks. Please check that your allowed CIDR blocks contains your IP.',
      )
      expect(hint).toHaveBeenCalledWith('  Your organization restricts API access by IP address.')
      expect(hint).toHaveBeenCalledWith(
        '  Add your IP to the allow list at: https://dashboard.fintoc.com/api-keys',
      )
      expect(hint).not.toHaveBeenCalledWith(expect.stringContaining('Check your API key'))
    })

    test('formats missing_allowed_cidr_block as an IP allow list error', () => {
      const err = createFintocError('AuthenticationError', {
        type: 'authentication_error',
        code: 'missing_allowed_cidr_block',
        message:
          'IP Restriction is enabled but no allowed CIDR blocks were found. Please add some allowed CIDR blocks or turn off IP Restriction from the dashboard.',
      })

      expect(() => handleError(err)).toThrow('process.exit')

      expect(hint).toHaveBeenCalledWith(
        '  Add your IP to the allow list at: https://dashboard.fintoc.com/api-keys',
      )
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

    test('shows only the API message when the param is nested', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'invalid_enum',
        param: 'tax_id.type',
        message: 'Invalid tax_id.type: bogus',
      })

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Invalid tax_id.type: bogus')
    })

    test('points to the resource help when the API does not recognize the route', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'unrecognized_request',
        message: 'Unrecognized request: GET /v2/payment_intents.',
      })

      expect(() => handleError(err, { cliPath: 'v2 payment_intents' })).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Unrecognized request: GET /v2/payment_intents.')
      expect(hint).toHaveBeenCalledWith(
        '  Check the requirements: fintoc v2 payment_intents --help',
      )
    })
  })

  describe('closed prompt', () => {
    test('reports an abort instead of the prompt internals', () => {
      expect(() => handleError(createPromptClosedError())).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('Aborted: the prompt was closed before an answer')
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('single-file document slot', () => {
    test('points to upload_document', () => {
      const err = createFintocError('InvalidRequestError', {
        type: 'invalid_request_error',
        code: 'single_file_document_slot',
        param: 'slot_key',
        message: 'This slot accepts a single file. Use PUT to replace it.',
      })

      expect(() => handleError(err)).toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('This slot accepts a single file. Use PUT to replace it.')
      expect(hint).toHaveBeenCalledWith(
        '  Use: fintoc v2 onboardings upload_document <id> <slot_key> --entity-id <entity_id> --file <path>',
      )
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

      expect(error).toHaveBeenCalledWith('JWS private key required to sign this request')
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
        error: { type: 'auth_error', code: 'missing_api_key', message: 'No API key found' },
      })
    })

    test('emits JSON for connectivity error', () => {
      const err = createNetworkError('ECONNREFUSED')

      expect(() => handleError(err, { json: true })).toThrow('process.exit')

      const output = JSON.parse(stderrSpy.mock.calls[0][0] as string)
      expect(output).toEqual({
        error: {
          type: 'connectivity_error',
          code: 'connection_failed',
          message: 'Could not connect to api.fintoc.com',
        },
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

    test.each(['tax_id.type', 'counterparty.account_number', 'items[0].price'])(
      'preserves the published JSON for FintocError with nested param %s',
      (param) => {
        const err = createFintocError('InvalidRequestError', {
          type: 'invalid_request_error',
          code: 'invalid_enum',
          param,
          message: 'Invalid value',
        })

        expect(() => handleError(err, { json: true })).toThrow('process.exit')

        expect(JSON.parse(stderrSpy.mock.calls[0][0] as string)).toEqual({
          error: {
            type: `invalid_request_error: invalid_enum (${param})`,
            message: `invalid_request_error: invalid_enum (${param})\nInvalid value`,
          },
        })
      },
    )

    test('emits JSON auth_error for an empty API key', () => {
      const err = new AuthError(
        'FINTOC_API_KEY is set but empty. Provide a valid key or unset the variable.',
        'empty_api_key',
      )

      expect(() => handleError(err, { json: true })).toThrow('process.exit')

      expect(JSON.parse(stderrSpy.mock.calls[0][0] as string)).toEqual({
        error: {
          type: 'auth_error',
          code: 'empty_api_key',
          message: 'FINTOC_API_KEY is set but empty. Provide a valid key or unset the variable.',
        },
      })
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    test('emits JSON for usage errors with code and param', () => {
      const err = new UsageError('Missing required flag: --amount', {
        code: 'missing_flag',
        param: 'amount',
        hints: ['Usage: fintoc charges create --amount <integer>'],
      })

      expect(() => handleError(err, { json: true })).toThrow('process.exit')

      expect(JSON.parse(stderrSpy.mock.calls[0][0] as string)).toEqual({
        error: {
          type: 'usage_error',
          code: 'missing_flag',
          param: 'amount',
          message: 'Missing required flag: --amount',
        },
      })
    })

    test('emits JSON usage_error aborted when the prompt is closed', () => {
      expect(() => handleError(createPromptClosedError(), { json: true })).toThrow('process.exit')

      expect(JSON.parse(stderrSpy.mock.calls[0][0] as string)).toEqual({
        error: {
          type: 'usage_error',
          code: 'aborted',
          message: 'Aborted: the prompt was closed before an answer',
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
