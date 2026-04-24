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
    for (const item of items) yield item
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

  test('exits with error when --limit is not a valid number', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const program = createProgram()
    await expect(
      program.parseAsync(['payment_intents', 'list', '--limit', 'abc'], { from: 'user' }),
    ).rejects.toThrow('process.exit')

    expect(error).toHaveBeenCalledWith('--limit must be a positive number')
    expect(mockManager.list).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  test('exits with error when --limit is zero', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const program = createProgram()
    await expect(
      program.parseAsync(['payment_intents', 'list', '--limit', '0'], { from: 'user' }),
    ).rejects.toThrow('process.exit')

    expect(error).toHaveBeenCalledWith('--limit must be a positive number')
    expect(mockManager.list).not.toHaveBeenCalled()
    exitSpy.mockRestore()
  })

  test('exits with error when --limit is negative', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit')
    })

    const program = createProgram()
    await expect(
      program.parseAsync(['payment_intents', 'list', '--limit', '-5'], { from: 'user' }),
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
    process.stdin.isTTY = false

    const program = createProgram()
    await expect(
      program.parseAsync(['payment_intents', 'delete', 'pi_123'], { from: 'user' }),
    ).rejects.toThrow('process.exit')

    expect(mockManager.delete).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('--yes'))

    process.stdin.isTTY = originalIsTTY
    exitSpy.mockRestore()
  })

  test('aborts when user declines confirmation', async () => {
    const { confirm } = await import('@inquirer/prompts')
    vi.mocked(confirm).mockResolvedValue(false)

    const originalIsTTY = process.stdin.isTTY
    process.stdin.isTTY = true

    const program = createProgram()
    await program.parseAsync(['payment_intents', 'delete', 'pi_123'], { from: 'user' })

    expect(mockManager.delete).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('Aborted.')

    process.stdin.isTTY = originalIsTTY
  })
})

describe('factory: v2 namespace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('uses v2 namespace for v2 resources', async () => {
    const v2Manager = { list: vi.fn().mockResolvedValue(asyncGenerator([])) }
    const v2Client = {
      v2: { transfers: v2Manager },
    }

    const { createClient } = await import('../../lib/auth.js')
    vi.mocked(createClient).mockReturnValue(v2Client as unknown as ReturnType<typeof createClient>)

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

    const program = createProgram(v2Resource)
    await program.parseAsync(['transfers', 'list'], { from: 'user' })

    expect(v2Manager.list).toHaveBeenCalled()
  })
})
