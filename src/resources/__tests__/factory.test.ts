import type { ResourceDef } from '../../types.js'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { error, log, printDetail, printJson, printTable, success } from '../../lib/output.js'
import { registerResourceCommands } from '../factory.js'

const { mockManager, mockClient } = vi.hoisted(() => {
  const mockManager = {
    create: vi.fn(),
    get: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
  }
  const mockClient = {
    paymentIntents: mockManager,
  }
  return { mockManager, mockClient }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, readFileSync: vi.fn() }
})

vi.mock('../../lib/auth.js', () => ({
  resolveAuth: vi.fn(() => ({ secretKey: 'sk_test_123', source: 'config' })),
  createClient: vi.fn(() => mockClient),
}))

vi.mock('../../lib/config.js', () => ({
  readConfig: vi.fn(() => ({})),
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  printTable: vi.fn(),
  printJson: vi.fn(),
  printDetail: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(() => true),
}))

// Mock async generator helper
const asyncGenerator = (items: { serialize: () => Record<string, unknown> }[]) => {
  return (async function* () {
    for (const item of items) {
      yield item
    }
  })()
}

const testResource: ResourceDef = {
  name: 'payment_intents',
  displayName: 'payment intent',
  cliCommand: 'payment_intents',
  sdkMethod: 'paymentIntents',
  sdkNamespace: 'v1',
  verbs: ['create', 'get', 'list', 'delete'],
  priorityColumns: ['id', 'amount', 'currency', 'status', 'created_at'],
  createFlags: [
    { name: 'amount', type: 'number', required: true, description: 'Amount' },
    { name: 'currency', type: 'string', required: true, description: 'Currency code' },
    { name: 'customer-email', type: 'string', description: 'Customer email' },
  ],
  listFlags: [{ name: 'status', type: 'string', description: 'Filter by status' }],
}

const createProgram = (resource: ResourceDef = testResource) => {
  const program = new Command()
  program.exitOverride()
  program.option('--api-key <key>', 'Override API key').option('--json', 'Output as JSON')
  registerResourceCommands(program, [resource])
  return program
}

describe('factory: registerResourceCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('registers subcommands for each verb', () => {
    const program = createProgram()
    const resourceCmd = program.commands.find((c) => c.name() === 'payment_intents')!

    expect(resourceCmd).toBeDefined()

    const subcommandNames = resourceCmd.commands.map((c) => c.name())
    expect(subcommandNames).toContain('create')
    expect(subcommandNames).toContain('get')
    expect(subcommandNames).toContain('list')
    expect(subcommandNames).toContain('delete')
  })

  test('only registers verbs from the resource def', () => {
    const readOnlyResource: ResourceDef = {
      ...testResource,
      name: 'accounts',
      cliCommand: 'accounts',
      verbs: ['get', 'list'],
    }

    const program = createProgram(readOnlyResource)
    const resourceCmd = program.commands.find((c) => c.name() === 'accounts')!
    const subcommandNames = resourceCmd.commands.map((c) => c.name())

    expect(subcommandNames).toContain('get')
    expect(subcommandNames).toContain('list')
    expect(subcommandNames).not.toContain('create')
    expect(subcommandNames).not.toContain('delete')
  })
})

describe('factory: create command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('calls SDK create with parsed flags', async () => {
    const mockResult = { serialize: () => ({ id: 'pi_123', amount: 10000, currency: 'CLP' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(
      ['payment_intents', 'create', '--amount', '10000', '--currency', 'CLP'],
      { from: 'user' },
    )

    expect(mockManager.create).toHaveBeenCalledWith({
      amount: 10000,
      currency: 'CLP',
    })
    expect(success).toHaveBeenCalled()
    expect(printDetail).toHaveBeenCalled()
  })

  test('converts kebab-case flags to snake_case for SDK', async () => {
    const mockResult = { serialize: () => ({ id: 'pi_123' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(
      [
        'payment_intents',
        'create',
        '--amount',
        '10000',
        '--currency',
        'CLP',
        '--customer-email',
        'test@example.com',
      ],
      { from: 'user' },
    )

    expect(mockManager.create).toHaveBeenCalledWith({
      amount: 10000,
      currency: 'CLP',
      customer_email: 'test@example.com',
    })
  })

  test('exits with error on missing required flags', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const program = createProgram()
    await expect(
      program.parseAsync(['payment_intents', 'create', '--currency', 'CLP'], { from: 'user' }),
    ).rejects.toThrow('process.exit')

    expect(error).toHaveBeenCalledWith(expect.stringContaining('--amount'))
    exitSpy.mockRestore()
  })

  test('shows v2 prefix in usage hint for v2 resources', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const v2Resource: ResourceDef = {
      ...testResource,
      name: 'transfers',
      cliCommand: 'transfers',
      sdkNamespace: 'v2',
    }

    const program = createProgram(v2Resource)
    await expect(
      program.parseAsync(['transfers', 'create', '--currency', 'CLP'], { from: 'user' }),
    ).rejects.toThrow('process.exit')

    expect(log).toHaveBeenCalledWith(expect.stringContaining('fintoc v2 transfers create'))
    exitSpy.mockRestore()
  })

  test('outputs JSON when --json flag is set', async () => {
    const mockResult = { serialize: () => ({ id: 'pi_123', amount: 10000 }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(
      ['--json', 'payment_intents', 'create', '--amount', '10000', '--currency', 'CLP'],
      { from: 'user' },
    )

    expect(printJson).toHaveBeenCalledWith({ id: 'pi_123', amount: 10000 })
    expect(printDetail).not.toHaveBeenCalled()
  })

  test('assembles nested flags into nested objects via nestedPath', async () => {
    const nestedResource: ResourceDef = {
      name: 'checkout_sessions',
      displayName: 'checkout session',
      cliCommand: 'checkout_sessions',
      sdkMethod: 'paymentIntents',
      sdkNamespace: 'v1',
      verbs: ['create'],
      priorityColumns: ['id'],
      createFlags: [
        { name: 'amount', type: 'number', required: true },
        { name: 'currency', type: 'string', required: true },
        {
          name: 'recipient-account-type',
          type: 'string',
          nestedPath: 'payment_method_options.payment_intent.recipient_account.type',
        },
        {
          name: 'business-profile-tax-id',
          type: 'string',
          nestedPath: 'business_profile.tax_id',
        },
      ],
      listFlags: [],
    }

    const mockResult = { serialize: () => ({ id: 'cs_123' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram(nestedResource)
    await program.parseAsync(
      [
        'checkout_sessions',
        'create',
        '--amount',
        '5000',
        '--currency',
        'CLP',
        '--recipient-account-type',
        'checking_account',
        '--business-profile-tax-id',
        '11111111-1',
      ],
      { from: 'user' },
    )

    expect(mockManager.create).toHaveBeenCalledWith({
      amount: 5000,
      currency: 'CLP',
      payment_method_options: {
        payment_intent: {
          recipient_account: {
            type: 'checking_account',
          },
        },
      },
      business_profile: {
        tax_id: '11111111-1',
      },
    })
  })
})

describe('factory: create --from-json', () => {
  let readFileSyncMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const fs = await import('node:fs')
    readFileSyncMock = vi.mocked(fs.readFileSync)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('reads JSON body from file and passes to SDK', async () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({ amount: 10000, currency: 'CLP' }))

    const mockResult = { serialize: () => ({ id: 'pi_123', amount: 10000 }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'create', '--from-json', 'payload.json'], {
      from: 'user',
    })

    expect(readFileSyncMock).toHaveBeenCalledWith('payload.json', 'utf-8')
    expect(mockManager.create).toHaveBeenCalledWith({ amount: 10000, currency: 'CLP' })
    expect(success).toHaveBeenCalled()
  })

  test('reads JSON body from stdin when path is "-"', async () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({ amount: 5000, currency: 'MXN' }))

    const mockResult = { serialize: () => ({ id: 'pi_456' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'create', '--from-json', '-'], { from: 'user' })

    expect(readFileSyncMock).toHaveBeenCalledWith(0, 'utf-8')
    expect(mockManager.create).toHaveBeenCalledWith({ amount: 5000, currency: 'MXN' })
  })

  test('flags override JSON values', async () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({ amount: 10000, currency: 'CLP' }))

    const mockResult = { serialize: () => ({ id: 'pi_789' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(
      ['payment_intents', 'create', '--from-json', 'base.json', '--currency', 'MXN'],
      { from: 'user' },
    )

    expect(mockManager.create).toHaveBeenCalledWith({
      amount: 10000,
      currency: 'MXN',
    })
  })

  test('skips required flag validation when --from-json is provided', async () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({ amount: 10000, currency: 'CLP' }))

    const mockResult = { serialize: () => ({ id: 'pi_abc' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'create', '--from-json', 'payload.json'], {
      from: 'user',
    })

    expect(error).not.toHaveBeenCalled()
    expect(mockManager.create).toHaveBeenCalledWith({ amount: 10000, currency: 'CLP' })
  })

  test('JSON preserves extra fields not in createFlags', async () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        amount: 10000,
        currency: 'CLP',
        line_items: [{ name: 'Item 1', amount: 5000 }],
        metadata: { order_id: 'ord_123' },
      }),
    )

    const mockResult = { serialize: () => ({ id: 'pi_complex' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'create', '--from-json', 'complex.json'], {
      from: 'user',
    })

    expect(mockManager.create).toHaveBeenCalledWith({
      amount: 10000,
      currency: 'CLP',
      line_items: [{ name: 'Item 1', amount: 5000 }],
      metadata: { order_id: 'ord_123' },
    })
  })

  test('deep merges nested flag values over JSON', async () => {
    const nestedResource: ResourceDef = {
      name: 'checkout_sessions',
      displayName: 'checkout session',
      cliCommand: 'checkout_sessions',
      sdkMethod: 'paymentIntents',
      sdkNamespace: 'v1',
      verbs: ['create'],
      priorityColumns: ['id'],
      createFlags: [
        { name: 'amount', type: 'number', required: true },
        { name: 'currency', type: 'string', required: true },
        {
          name: 'recipient-account-type',
          type: 'string',
          nestedPath: 'payment_method_options.payment_intent.recipient_account.type',
        },
      ],
      listFlags: [],
    }

    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        amount: 5000,
        currency: 'CLP',
        payment_method_options: {
          payment_intent: {
            recipient_account: {
              type: 'checking_account',
              number: '12345678',
            },
          },
        },
      }),
    )

    const mockResult = { serialize: () => ({ id: 'cs_123' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram(nestedResource)
    await program.parseAsync(
      [
        'checkout_sessions',
        'create',
        '--from-json',
        'base.json',
        '--recipient-account-type',
        'savings_account',
      ],
      { from: 'user' },
    )

    expect(mockManager.create).toHaveBeenCalledWith({
      amount: 5000,
      currency: 'CLP',
      payment_method_options: {
        payment_intent: {
          recipient_account: {
            type: 'savings_account',
            number: '12345678',
          },
        },
      },
    })
  })

  describe('error cases', () => {
    let exitSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })
    })

    afterEach(() => {
      exitSpy.mockRestore()
    })

    test('exits with error on invalid JSON', async () => {
      readFileSyncMock.mockReturnValue('not valid json')

      const program = createProgram()
      await expect(
        program.parseAsync(['payment_intents', 'create', '--from-json', 'bad.json'], {
          from: 'user',
        }),
      ).rejects.toThrow('process.exit')

      expect(error).toHaveBeenCalledWith(expect.stringContaining('invalid JSON'))
    })

    test('exits with error when file does not exist', async () => {
      const enoent = new Error(
        "ENOENT: no such file or directory, open 'missing.json'",
      ) as Error & {
        code: string
      }
      enoent.code = 'ENOENT'
      readFileSyncMock.mockImplementation(() => {
        throw enoent
      })

      const program = createProgram()
      await expect(
        program.parseAsync(['payment_intents', 'create', '--from-json', 'missing.json'], {
          from: 'user',
        }),
      ).rejects.toThrow('process.exit')

      expect(error).toHaveBeenCalledWith("--from-json: file 'missing.json' not found")
    })

    test('exits with error when stdin is a TTY', async () => {
      const originalIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })

      const program = createProgram()
      await expect(
        program.parseAsync(['payment_intents', 'create', '--from-json', '-'], {
          from: 'user',
        }),
      ).rejects.toThrow('process.exit')

      expect(error).toHaveBeenCalledWith(
        '--from-json -: no input on stdin. Pipe a file or use a path instead',
      )

      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
      })
    })

    test('exits with error when JSON is not an object', async () => {
      readFileSyncMock.mockReturnValue(JSON.stringify([1, 2, 3]))

      const program = createProgram()
      await expect(
        program.parseAsync(['payment_intents', 'create', '--from-json', 'array.json'], {
          from: 'user',
        }),
      ).rejects.toThrow('process.exit')

      expect(error).toHaveBeenCalledWith('--from-json must contain a JSON object')
    })
  })
})

describe('factory: get command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('calls SDK get with ID', async () => {
    const mockResult = { serialize: () => ({ id: 'pi_123', amount: 10000 }) }
    mockManager.get.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'get', 'pi_123'], { from: 'user' })

    expect(mockManager.get).toHaveBeenCalledWith('pi_123')
    expect(printDetail).toHaveBeenCalled()
  })

  test('outputs JSON when --json flag is set', async () => {
    const mockResult = { serialize: () => ({ id: 'pi_123' }) }
    mockManager.get.mockResolvedValue(mockResult)

    const program = createProgram()
    await program.parseAsync(['--json', 'payment_intents', 'get', 'pi_123'], { from: 'user' })

    expect(printJson).toHaveBeenCalledWith({ id: 'pi_123' })
  })
})

describe('factory: list command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('calls SDK list with lazy mode and respects limit', async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      serialize: () => ({ id: `pi_${i}` }),
    }))
    mockManager.list.mockResolvedValue(asyncGenerator(items))

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'list', '--limit', '5'], { from: 'user' })

    expect(mockManager.list).toHaveBeenCalledWith(expect.objectContaining({ lazy: true }))
    expect(printTable).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: expect.arrayContaining([expect.objectContaining({ id: 'pi_0' })]),
      }),
    )
    // Should have only 5 items due to limit
    const call = vi.mocked(printTable).mock.calls[0][0]
    expect(call.rows).toHaveLength(5)
  })

  test('passes filter flags to SDK', async () => {
    mockManager.list.mockResolvedValue(asyncGenerator([]))

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'list', '--status', 'succeeded'], { from: 'user' })

    expect(mockManager.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded', lazy: true }),
    )
  })

  test('defaults limit to 10', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({
      serialize: () => ({ id: `pi_${i}` }),
    }))
    mockManager.list.mockResolvedValue(asyncGenerator(items))

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'list'], { from: 'user' })

    const call = vi.mocked(printTable).mock.calls[0][0]
    expect(call.rows).toHaveLength(10)
  })

  test('outputs JSON when --json flag is set', async () => {
    const items = [{ serialize: () => ({ id: 'pi_0' }) }]
    mockManager.list.mockResolvedValue(asyncGenerator(items))

    const program = createProgram()
    await program.parseAsync(['--json', 'payment_intents', 'list'], { from: 'user' })

    expect(printJson).toHaveBeenCalledWith([{ id: 'pi_0' }])
    expect(printTable).not.toHaveBeenCalled()
  })

  test.each(['abc', '0', '-5'])('exits with error when --limit is %s', async (value) => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const program = createProgram()
    await expect(
      program.parseAsync(['payment_intents', 'list', '--limit', value], { from: 'user' }),
    ).rejects.toThrow('process.exit')

    expect(error).toHaveBeenCalledWith('--limit must be a positive number')
    expect(mockManager.list).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })
})

describe('factory: delete command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('calls SDK delete with confirmation skipped via --yes', async () => {
    mockManager.delete.mockResolvedValue('deleted')

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'delete', 'pi_123', '--yes'], { from: 'user' })

    expect(mockManager.delete).toHaveBeenCalledWith('pi_123')
    expect(success).toHaveBeenCalledWith(expect.stringContaining('pi_123'))
  })

  test('exits with error in non-TTY without --yes', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const originalIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

    const program = createProgram()
    await expect(
      program.parseAsync(['payment_intents', 'delete', 'pi_123'], { from: 'user' }),
    ).rejects.toThrow('process.exit')

    expect(mockManager.delete).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('--yes'))

    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
    exitSpy.mockRestore()
  })

  test('aborts when user declines confirmation', async () => {
    const { confirm } = await import('@inquirer/prompts')
    vi.mocked(confirm).mockResolvedValue(false)

    const originalIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'delete', 'pi_123'], { from: 'user' })

    expect(mockManager.delete).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('Aborted.')

    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true })
  })
})

describe('factory: --jws-private-key flag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('adds --jws-private-key flag when resource.needsJws is true', () => {
    const jwsResource: ResourceDef = {
      name: 'transfers',
      displayName: 'transfer',
      cliCommand: 'transfers',
      sdkMethod: 'paymentIntents',
      sdkNamespace: 'v2',
      verbs: ['create'],
      needsJws: true,
      priorityColumns: ['id'],
      createFlags: [
        { name: 'amount', type: 'number', required: true },
        { name: 'currency', type: 'string', required: true },
      ],
      listFlags: [],
    }

    const program = createProgram(jwsResource)
    const resourceCmd = program.commands.find((c) => c.name() === 'transfers')!
    const createCmd = resourceCmd.commands.find((c) => c.name() === 'create')!
    const options = createCmd.options.map((o) => o.long)

    expect(options).toContain('--jws-private-key')
  })

  test('does not add --jws-private-key flag when resource.needsJws is false', () => {
    const program = createProgram()
    const resourceCmd = program.commands.find((c) => c.name() === 'payment_intents')!
    const createCmd = resourceCmd.commands.find((c) => c.name() === 'create')!
    const options = createCmd.options.map((o) => o.long)

    expect(options).not.toContain('--jws-private-key')
  })

  test('passes jws key path to createClient when flag is provided', async () => {
    const { createClient } = await import('../../lib/auth.js')

    const jwsResource: ResourceDef = {
      name: 'transfers',
      displayName: 'transfer',
      cliCommand: 'transfers',
      sdkMethod: 'paymentIntents',
      sdkNamespace: 'v1',
      verbs: ['create'],
      needsJws: true,
      priorityColumns: ['id'],
      createFlags: [
        { name: 'amount', type: 'number', required: true },
        { name: 'currency', type: 'string', required: true },
      ],
      listFlags: [],
    }

    const mockResult = { serialize: () => ({ id: 'tr_123' }) }
    mockManager.create.mockResolvedValue(mockResult)

    const program = createProgram(jwsResource)
    await program.parseAsync(
      [
        'transfers',
        'create',
        '--amount',
        '10000',
        '--currency',
        'CLP',
        '--jws-private-key',
        '/path/to/key.pem',
      ],
      { from: 'user' },
    )

    expect(createClient).toHaveBeenCalledWith('sk_test_123', '/path/to/key.pem')
  })
})

describe('factory: v2 namespace', () => {
  const v2Manager = {
    list: vi.fn(),
  }

  const v2Resource: ResourceDef = {
    name: 'transfers',
    displayName: 'transfer',
    cliCommand: 'transfers',
    sdkMethod: 'transfers',
    sdkNamespace: 'v2',
    verbs: ['list'],
    priorityColumns: ['id', 'amount', 'status'],
    listFlags: [],
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    const v2Client = { v2: { transfers: v2Manager } }
    const { createClient } = await import('../../lib/auth.js')
    vi.mocked(createClient).mockReturnValue(v2Client as unknown as ReturnType<typeof createClient>)
  })

  describe('when registered directly on a program', () => {
    test('routes to the v2 SDK namespace', async () => {
      v2Manager.list.mockResolvedValue(asyncGenerator([]))

      const program = createProgram(v2Resource)
      await program.parseAsync(['transfers', 'list'], { from: 'user' })

      expect(v2Manager.list).toHaveBeenCalled()
    })
  })

  describe('when nested under a v2 subcommand (root > v2 > resource > action)', () => {
    const createV2Program = () => {
      const root = new Command()
      root.exitOverride()
      root.option('--api-key <key>', 'Override API key').option('--json', 'Output as JSON')
      const v2Cmd = root.command('v2').description('API v2 resources')
      registerResourceCommands(v2Cmd, [v2Resource])
      return root
    }

    test('routes to the v2 SDK namespace', async () => {
      v2Manager.list.mockResolvedValue(asyncGenerator([]))

      const program = createV2Program()
      await program.parseAsync(['v2', 'transfers', 'list'], { from: 'user' })

      expect(v2Manager.list).toHaveBeenCalled()
    })

    test('resolves root --json flag through nested commands', async () => {
      v2Manager.list.mockResolvedValue(asyncGenerator([{ serialize: () => ({ id: 'tr_1' }) }]))

      const program = createV2Program()
      await program.parseAsync(['--json', 'v2', 'transfers', 'list'], { from: 'user' })

      expect(printJson).toHaveBeenCalledWith([{ id: 'tr_1' }])
      expect(printTable).not.toHaveBeenCalled()
    })
  })
})
