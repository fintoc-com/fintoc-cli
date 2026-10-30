import type { ResourceDef } from '../../types.js'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { confirm } from '@inquirer/prompts'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createClient, resolveAuth } from '../../lib/auth.js'
import { readConfig } from '../../lib/config.js'
import { error, hint, printDetail, printJson, printTable, success, warn } from '../../lib/output.js'
import { describeCommands, registerResourceCommands } from '../factory.js'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, readFileSync: vi.fn() }
})

vi.mock('../../lib/auth.js', () => ({
  resolveAuth: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock('../../lib/config.js', () => ({
  readConfig: vi.fn(() => ({})),
}))

vi.mock('../../lib/output.js', () => ({
  log: vi.fn(),
  hint: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  printTable: vi.fn(),
  printJson: vi.fn(),
  printDetail: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  confirm: vi.fn(),
}))

const mockManager = {
  create: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  expire: vi.fn(),
  cancel: vi.fn(),
  voucherUrl: vi.fn(),
  listResources: vi.fn(),
  exchange: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  removeLines: vi.fn(),
}

const mockClient = { widgets: mockManager }

const result = (data: Record<string, unknown>) => ({ serialize: () => data })

const asyncGenerator = (items: Record<string, unknown>[]) =>
  (async function* () {
    for (const item of items) {
      yield result(item)
    }
  })()

const baseResource: ResourceDef = {
  name: 'widgets',
  displayName: 'widget',
  cliCommand: 'widgets',
  sdkMethod: 'widgets',
  sdkNamespace: 'v1',
  verbs: [],
  priorityColumns: ['id', 'status'],
}

const createProgram = (resource: ResourceDef) => {
  const program = new Command()
  program.exitOverride().configureOutput({ writeErr: () => {} })
  program.option('--api-key <key>', 'Override API key').option('--json', 'Output as JSON')
  registerResourceCommands(program, [resource])
  return program
}

const run = (resource: ResourceDef, args: string[]) =>
  createProgram(resource).parseAsync(args, { from: 'user' })

const rejectsWith = (promise: Promise<unknown>, code: string, message: string) =>
  expect(promise).rejects.toMatchObject({ code, message: expect.stringContaining(message) })

const mockProcessExit = () =>
  vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit')
  })

const setTTY = (value: boolean | undefined) =>
  Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true })

describe('factory: update, actions and files', () => {
  let originalIsTTY: boolean | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    originalIsTTY = process.stdin.isTTY
    vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_test_123', source: 'config' })
    vi.mocked(createClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof createClient>,
    )
    vi.mocked(confirm).mockResolvedValue(true)
  })

  afterEach(() => {
    setTTY(originalIsTTY)
    vi.restoreAllMocks()
  })

  describe('update command', () => {
    const resource: ResourceDef = {
      ...baseResource,
      verbs: ['update'],
      updateFlags: [
        { name: 'description', type: 'string' },
        { name: 'max-amount', type: 'integer', nestedPath: 'options.max_amount' },
        { name: 'parent-id', type: 'string', pathParam: true },
      ],
    }

    test('calls SDK update with id and body built from flags', async () => {
      mockManager.update.mockResolvedValue(result({ id: 'w_1', description: 'new' }))

      await run(resource, [
        'widgets',
        'update',
        'w_1',
        '--parent-id',
        'p_1',
        '--description',
        'new',
        '--max-amount',
        '10',
      ])

      expect(mockManager.update).toHaveBeenCalledWith('w_1', {
        parent_id: 'p_1',
        description: 'new',
        options: { max_amount: 10 },
      })
      expect(success).toHaveBeenCalledWith("Widget 'w_1' updated")
      expect(printDetail).toHaveBeenCalledWith({ id: 'w_1', description: 'new' })
    })

    test('merges --from-json under flags', async () => {
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ description: 'json', metadata: { a: '1' } }),
      )
      mockManager.update.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, [
        'widgets',
        'update',
        'w_1',
        '--parent-id',
        'p_1',
        '--from-json',
        'body.json',
        '--description',
        'flag',
      ])

      expect(mockManager.update).toHaveBeenCalledWith('w_1', {
        description: 'flag',
        metadata: { a: '1' },
        parent_id: 'p_1',
      })
    })

    test('exits when there is nothing to update', async () => {
      const exitSpy = mockProcessExit()

      await expect(
        run(resource, ['widgets', 'update', 'w_1', '--parent-id', 'p_1']),
      ).rejects.toThrow('process.exit')

      expect(mockManager.update).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Nothing to update'))
      exitSpy.mockRestore()
    })

    test('requires path params even with --from-json', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ description: 'json' }))
      const exitSpy = mockProcessExit()

      await expect(
        run(resource, ['widgets', 'update', 'w_1', '--from-json', 'body.json']),
      ).rejects.toThrow('process.exit')

      expect(mockManager.update).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith('Missing required flag: --parent-id')
      exitSpy.mockRestore()
    })

    test('outputs JSON when --json flag is set', async () => {
      mockManager.update.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, [
        '--json',
        'widgets',
        'update',
        'w_1',
        '--parent-id',
        'p',
        '--description',
        'd',
      ])

      expect(printJson).toHaveBeenCalledWith({ id: 'w_1' })
      expect(success).not.toHaveBeenCalled()
    })
  })

  describe('delete command with deleteFlags', () => {
    test('passes the flags to SDK delete', async () => {
      mockManager.delete.mockResolvedValue('w_1')
      const resource: ResourceDef = {
        ...baseResource,
        verbs: ['delete'],
        deleteFlags: [{ name: 'parent-id', type: 'string', pathParam: true }],
      }

      await run(resource, ['widgets', 'delete', 'w_1', '--parent-id', 'p_1', '--yes'])

      expect(mockManager.delete).toHaveBeenCalledWith('w_1', { parent_id: 'p_1' })
    })
  })

  describe('action command', () => {
    const resource: ResourceDef = {
      ...baseResource,
      actions: [
        {
          name: 'cancel',
          sdkMethod: 'cancel',
          description: 'Cancel a widget',
          confirm: true,
          successMessage: "{resource} '{id}' canceled",
        },
        { name: 'voucher_url', sdkMethod: 'voucherUrl', description: 'Voucher', kind: 'read' },
        {
          name: 'resources',
          sdkMethod: 'listResources',
          description: 'List resources',
          kind: 'list',
          flags: [{ name: 'resource-type', type: 'string', required: true }],
          priorityColumns: ['id', 'amount'],
        },
        {
          name: 'exchange',
          sdkMethod: 'exchange',
          description: 'Exchange',
          kind: 'read',
          idArg: false,
          flags: [{ name: 'exchange-token', type: 'string', required: true }],
        },
        {
          name: 'delete_document',
          sdkMethod: 'deleteDocument',
          description: 'Delete a document',
          extraArgs: [{ name: 'slot_key' }, { name: 'document_id' }],
          flags: [{ name: 'parent-id', type: 'string', pathParam: true }],
          confirm: true,
        },
        {
          name: 'remove_lines',
          sdkMethod: 'removeLines',
          description: 'Remove lines',
          fromJson: true,
          flags: [{ name: 'lines', type: 'string[]', required: true }],
        },
      ],
    }

    test('registers one subcommand per action', () => {
      const cmd = createProgram(resource).commands.find((c) => c.name() === 'widgets')!
      expect(cmd.commands.map((c) => c.name())).toEqual([
        'cancel',
        'voucher_url',
        'resources',
        'exchange',
        'delete_document',
        'remove_lines',
      ])
    })

    test('calls the SDK method with only the id when the action takes no body', async () => {
      mockManager.cancel.mockResolvedValue(result({ id: 'w_1', status: 'canceled' }))

      await run(resource, ['widgets', 'cancel', 'w_1', '--yes'])

      expect(mockManager.cancel).toHaveBeenCalledWith('w_1')
      expect(confirm).not.toHaveBeenCalled()
      expect(success).toHaveBeenCalledWith("Widget 'w_1' canceled")
      expect(printDetail).toHaveBeenCalledWith({ id: 'w_1', status: 'canceled' })
    })

    describe('when the action requires confirmation', () => {
      test('asks for confirmation in a TTY and runs when accepted', async () => {
        setTTY(true)
        mockManager.cancel.mockResolvedValue(result({ id: 'w_1' }))

        await run(resource, ['widgets', 'cancel', 'w_1'])

        expect(confirm).toHaveBeenCalledWith(
          expect.objectContaining({ message: "Are you sure you want to cancel widget 'w_1'?" }),
          { output: process.stderr },
        )
        expect(mockManager.cancel).toHaveBeenCalledWith('w_1')
      })

      test('aborts without calling the SDK when declined', async () => {
        setTTY(true)
        vi.mocked(confirm).mockResolvedValue(false)

        await run(resource, ['widgets', 'cancel', 'w_1'])

        expect(mockManager.cancel).not.toHaveBeenCalled()
        expect(hint).toHaveBeenCalledWith('Aborted.')
      })

      test('exits with error in non-TTY without --yes', async () => {
        setTTY(false)
        const exitSpy = mockProcessExit()

        await expect(run(resource, ['widgets', 'cancel', 'w_1'])).rejects.toThrow('process.exit')

        expect(mockManager.cancel).not.toHaveBeenCalled()
        expect(error).toHaveBeenCalledWith(expect.stringContaining('--yes'))
        exitSpy.mockRestore()
      })
    })

    test('read actions print the result without a success message', async () => {
      mockManager.voucherUrl.mockResolvedValue(result({ url: 'https://voucher' }))

      await run(resource, ['widgets', 'voucher_url', 'w_1'])

      expect(mockManager.voucherUrl).toHaveBeenCalledWith('w_1')
      expect(success).not.toHaveBeenCalled()
      expect(printDetail).toHaveBeenCalledWith({ url: 'https://voucher' })
    })

    test('list actions iterate the result with --limit and print a table', async () => {
      mockManager.listResources.mockResolvedValue(
        asyncGenerator([{ id: 'a' }, { id: 'b' }, { id: 'c' }]),
      )

      await run(resource, [
        'widgets',
        'resources',
        'w_1',
        '--resource-type',
        'payment_intent',
        '--limit',
        '2',
      ])

      expect(mockManager.listResources).toHaveBeenCalledWith('w_1', {
        resource_type: 'payment_intent',
      })
      expect(printTable).toHaveBeenCalledWith({
        columns: ['id', 'amount'],
        rows: [{ id: 'a' }, { id: 'b' }],
      })
    })

    test('actions without id pass only the body', async () => {
      mockManager.exchange.mockResolvedValue(result({ id: 'link_1' }))

      await run(resource, ['widgets', 'exchange', '--exchange-token', 'tok'])

      expect(mockManager.exchange).toHaveBeenCalledWith({ exchange_token: 'tok' })
    })

    test('passes extra positional args in order before the body', async () => {
      mockManager.deleteDocument.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, [
        'widgets',
        'delete_document',
        'w_1',
        'slot',
        'doc_1',
        '--parent-id',
        'p_1',
        '--yes',
      ])

      expect(mockManager.deleteDocument).toHaveBeenCalledWith('w_1', 'slot', 'doc_1', {
        parent_id: 'p_1',
      })
    })

    test('--from-json skips required body flags', async () => {
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ lines: ['li_1'] }))
      mockManager.removeLines.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['widgets', 'remove_lines', 'w_1', '--from-json', 'body.json'])

      expect(mockManager.removeLines).toHaveBeenCalledWith('w_1', { lines: ['li_1'] })
    })

    test('exits when a required action flag is missing', async () => {
      const exitSpy = mockProcessExit()

      await expect(run(resource, ['widgets', 'remove_lines', 'w_1'])).rejects.toThrow(
        'process.exit',
      )

      expect(mockManager.removeLines).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('--lines'))
      expect(hint).toHaveBeenCalledWith(
        expect.stringContaining('Usage: fintoc widgets remove_lines <id> --lines'),
      )
      exitSpy.mockRestore()
    })

    test('reads the JWS key from config for actions that need it', async () => {
      vi.mocked(readConfig).mockReturnValueOnce({ jws_private_key: '/keys/jws.pem' })
      mockManager.exchange.mockResolvedValue(result({ id: 'x' }))
      const jwsResource: ResourceDef = {
        ...baseResource,
        actions: [{ ...resource.actions![3], needsJws: true }],
      }

      await run(jwsResource, ['widgets', 'exchange', '--exchange-token', 'tok'])

      expect(createClient).toHaveBeenCalledWith('sk_test_123', '/keys/jws.pem')
    })

    test('does not read the JWS key for actions that do not need it', async () => {
      vi.mocked(readConfig).mockReturnValue({ jws_private_key: '/keys/jws.pem' })
      mockManager.voucherUrl.mockResolvedValue(result({ url: 'https://x' }))

      await run({ ...resource, needsJws: true }, ['widgets', 'voucher_url', 'w_1'])

      expect(createClient).toHaveBeenCalledWith('sk_test_123', undefined)
    })
  })

  describe('boolean flags', () => {
    const resource: ResourceDef = {
      ...baseResource,
      verbs: ['update'],
      updateFlags: [{ name: 'active', type: 'boolean' }],
    }

    test.each([
      ['true', true],
      ['False', false],
    ])('parses %s', async (value, expected) => {
      mockManager.update.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['widgets', 'update', 'w_1', '--active', value])

      expect(mockManager.update).toHaveBeenCalledWith('w_1', { active: expected })
    })

    test('rejects values other than true or false', async () => {
      await rejectsWith(
        run(resource, ['widgets', 'update', 'w_1', '--active', 'yes']),
        'commander.invalidArgument',
        "argument 'yes' is invalid. Expected true or false.",
      )

      expect(mockManager.update).not.toHaveBeenCalled()
    })
  })

  describe('map flags', () => {
    const resource: ResourceDef = {
      ...baseResource,
      verbs: ['create'],
      createFlags: [
        { name: 'name', type: 'string', required: true },
        { name: 'metadata', type: 'map' },
        { name: 'customer-metadata', type: 'map', nestedPath: 'customer.metadata' },
      ],
    }

    test('collects repeated key=value pairs into an object', async () => {
      mockManager.create.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, [
        'widgets',
        'create',
        '--name',
        'x',
        '--metadata',
        'order=123',
        '--metadata',
        'note=a=b',
        '--customer-metadata',
        'tier=gold',
      ])

      expect(mockManager.create).toHaveBeenCalledWith({
        name: 'x',
        metadata: { order: '123', note: 'a=b' },
        customer: { metadata: { tier: 'gold' } },
      })
    })

    test('rejects a value without a key', async () => {
      await rejectsWith(
        run(resource, ['widgets', 'create', '--name', 'x', '--metadata', '=1']),
        'commander.invalidArgument',
        'Expected <key>=<value>.',
      )

      expect(mockManager.create).not.toHaveBeenCalled()
    })
  })

  describe('file uploads', () => {
    const pdf = Buffer.from('%PDF')

    beforeEach(() => {
      vi.mocked(readFileSync).mockReturnValue(pdf)
    })

    const uploadResource: ResourceDef = {
      ...baseResource,
      verbs: ['create'],
      createFlags: [{ name: 'type', type: 'string', required: true }],
      createFiles: [
        { field: 'docs.contract', required: true },
        { field: 'docs.selfie', required: false },
      ],
      actions: [
        {
          name: 'upload_document',
          sdkMethod: 'uploadDocument',
          description: 'Upload',
          extraArgs: [{ name: 'slot_key' }],
          flags: [{ name: 'parent-id', type: 'string', pathParam: true }],
          files: [{ field: 'file', required: true }],
          fileAsArg: true,
        },
      ],
    }

    test('create puts each --file at its field path inside the body', async () => {
      mockManager.create.mockResolvedValue(result({ id: 'w_1' }))

      await run(uploadResource, [
        'widgets',
        'create',
        '--type',
        'x',
        '--file',
        'docs.contract=/tmp/contract.pdf',
        '--file',
        'docs.selfie=/tmp/me.jpg',
      ])

      expect(readFileSync).toHaveBeenCalledWith('/tmp/contract.pdf')
      expect(mockManager.create).toHaveBeenCalledWith({
        type: 'x',
        docs: {
          contract: { data: pdf, filename: 'contract.pdf' },
          selfie: { data: pdf, filename: 'me.jpg' },
        },
      })
    })

    test('upload actions pass the file as a positional argument', async () => {
      mockManager.uploadDocument.mockResolvedValue(result({ id: 'w_1' }))

      await run(uploadResource, [
        'widgets',
        'upload_document',
        'w_1',
        'slot',
        '--parent-id',
        'p_1',
        '--file',
        'file=/tmp/doc.pdf',
      ])

      expect(mockManager.uploadDocument).toHaveBeenCalledWith(
        'w_1',
        'slot',
        { data: pdf, filename: 'doc.pdf' },
        { parent_id: 'p_1' },
      )
    })

    test('exits with error when a required file is missing', async () => {
      const exitSpy = mockProcessExit()

      await expect(
        run(uploadResource, [
          'widgets',
          'create',
          '--type',
          'x',
          '--file',
          'docs.selfie=/tmp/me.jpg',
        ]),
      ).rejects.toThrow('process.exit')

      expect(mockManager.create).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith('Missing required file: docs.contract')
      exitSpy.mockRestore()
    })

    test.each([
      ['docs.contract', 'Expected <field>=<path>.'],
      ['other=/tmp/x.pdf', "Unknown field 'other'. Valid fields: docs.contract, docs.selfie."],
    ])('rejects --file %s', async (value, message) => {
      await rejectsWith(
        run(uploadResource, ['widgets', 'create', '--type', 'x', '--file', value]),
        'commander.invalidArgument',
        message,
      )

      expect(mockManager.create).not.toHaveBeenCalled()
    })

    test('exits with error when the same --file field is given twice', async () => {
      await rejectsWith(
        run(uploadResource, [
          'widgets',
          'create',
          '--type',
          'x',
          '--file',
          'docs.contract=/tmp/a.pdf',
          '--file',
          'docs.contract=/tmp/b.pdf',
        ]),
        'commander.invalidArgument',
        "Field 'docs.contract' was given more than once.",
      )

      expect(mockManager.create).not.toHaveBeenCalled()
    })

    test('reports unreadable files through the error handler in actions', async () => {
      vi.mocked(readFileSync).mockImplementationOnce(() => {
        throw Object.assign(new Error('EISDIR: illegal operation on a directory'), {
          code: 'EISDIR',
        })
      })
      const exitSpy = mockProcessExit()

      await expect(
        run(uploadResource, [
          'widgets',
          'upload_document',
          'w_1',
          'slot',
          '--parent-id',
          'p_1',
          '--file',
          'file=/tmp',
        ]),
      ).rejects.toThrow('process.exit')

      expect(mockManager.uploadDocument).not.toHaveBeenCalled()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('EISDIR'))
      exitSpy.mockRestore()
    })

    test('exits with error when the file does not exist', async () => {
      vi.mocked(readFileSync).mockImplementationOnce(() => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      })
      const exitSpy = mockProcessExit()

      await expect(
        run(uploadResource, [
          'widgets',
          'create',
          '--type',
          'x',
          '--file',
          'docs.contract=/nope.pdf',
        ]),
      ).rejects.toThrow('process.exit')

      expect(error).toHaveBeenCalledWith("--file: file '/nope.pdf' not found")
      exitSpy.mockRestore()
    })
  })

  describe('help text', () => {
    test('uses pluralDisplayName and the right article', () => {
      const program = createProgram({
        ...baseResource,
        name: 'entities',
        cliCommand: 'entities',
        displayName: 'entity',
        pluralDisplayName: 'entities',
        verbs: ['get', 'update'],
        updateFlags: [{ name: 'name', type: 'string' }],
      })
      const cmd = program.commands.find((c) => c.name() === 'entities')!

      expect(cmd.description()).toBe('Manage entities')
      expect(cmd.commands.map((c) => c.description())).toEqual([
        'Get an entity by ID',
        'Update an entity',
      ])
    })
  })

  describe('cli conventions', () => {
    const resource: ResourceDef = {
      ...baseResource,
      name: 'payment_widgets',
      cliCommand: 'payment_widgets',
      sdkMethod: 'paymentWidgets',
      verbs: ['create', 'list', 'delete'],
      createFlags: [
        { name: 'lines', type: 'string[]' },
        { name: 'active', type: 'boolean' },
        { name: 'legacy', type: 'string', deprecated: 'it does nothing' },
      ],
      createFiles: [],
      actions: [
        {
          name: 'submit_for_review',
          sdkMethod: 'cancel',
          description: 'Submit',
          confirm: true,
        },
        {
          name: 'upload',
          sdkMethod: 'uploadDocument',
          description: 'Upload',
          files: [{ field: 'file', required: true }],
          fileAsArg: true,
        },
      ],
    }
    const client = { paymentWidgets: mockManager }

    beforeEach(() => {
      vi.mocked(createClient).mockReturnValue(client as unknown as ReturnType<typeof createClient>)
    })

    test('string[] flags accept repeated and comma-separated values', async () => {
      mockManager.create.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['payment_widgets', 'create', '--lines', 'a,b', '--lines', 'c'])

      expect(mockManager.create).toHaveBeenCalledWith({ lines: ['a', 'b', 'c'] })
    })

    test('a bare boolean flag means true', async () => {
      mockManager.create.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['payment_widgets', 'create', '--active'])

      expect(mockManager.create).toHaveBeenCalledWith({ active: true })
    })

    test('deprecated flags warn and are not sent', async () => {
      mockManager.create.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['payment_widgets', 'create', '--legacy', 'x', '--active', 'false'])

      expect(warn).toHaveBeenCalledWith('--legacy is deprecated: it does nothing')
      expect(mockManager.create).toHaveBeenCalledWith({ active: false })
    })

    test('--idempotency-key is passed to the SDK on create', async () => {
      mockManager.create.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['payment_widgets', 'create', '--active', '--idempotency-key', 'k_1'])

      expect(mockManager.create).toHaveBeenCalledWith({ active: true, idempotency_key: 'k_1' })
    })

    test('resources and actions also answer to their kebab-case names', async () => {
      mockManager.cancel.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['payment-widgets', 'submit-for-review', 'w_1', '--yes'])

      expect(mockManager.cancel).toHaveBeenCalledWith('w_1')
    })

    test('a single-field --file accepts just the path', async () => {
      vi.mocked(readFileSync).mockReturnValue(Buffer.from('%PDF'))
      mockManager.uploadDocument.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['payment_widgets', 'upload', 'w_1', '--file', '/tmp/doc.pdf'])

      expect(mockManager.uploadDocument).toHaveBeenCalledWith('w_1', {
        data: Buffer.from('%PDF'),
        filename: 'doc.pdf',
      })
    })

    test('the confirmation says when the key is live', async () => {
      setTTY(true)
      vi.mocked(resolveAuth).mockReturnValue({ secretKey: 'sk_live_123', source: 'config' })
      mockManager.cancel.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['payment_widgets', 'submit_for_review', 'w_1'])

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Are you sure you want to submit for review widget 'w_1' in LIVE mode?",
        }),
        { output: process.stderr },
      )
    })

    test('delete prints a JSON result with --json', async () => {
      mockManager.delete.mockResolvedValue('w_1')

      await run(resource, ['--json', 'payment_widgets', 'delete', 'w_1', '--yes'])

      expect(printJson).toHaveBeenCalledWith({ id: 'w_1', deleted: true })
    })

    test('list warns on stderr when there may be more results than --limit', async () => {
      mockManager.list.mockResolvedValue(asyncGenerator([{ id: 'a' }, { id: 'b' }, { id: 'c' }]))

      await run(resource, ['payment_widgets', 'list', '--limit', '2'])

      expect(printTable).toHaveBeenCalledWith(
        expect.objectContaining({ rows: [{ id: 'a' }, { id: 'b' }] }),
      )
      expect(hint).toHaveBeenCalledWith(
        'More results may be available. Use --limit to show more than 2.',
      )
    })

    test('list keeps stderr clean with --json', async () => {
      mockManager.list.mockResolvedValue(asyncGenerator([{ id: 'a' }, { id: 'b' }, { id: 'c' }]))

      await run(resource, ['--json', 'payment_widgets', 'list', '--limit', '2'])

      expect(printJson).toHaveBeenCalledWith([{ id: 'a' }, { id: 'b' }])
      expect(hint).not.toHaveBeenCalled()
    })

    test('list prints what it has when checking for more results fails', async () => {
      mockManager.list.mockResolvedValue(
        (async function* () {
          yield result({ id: 'a' })
          throw new Error('429 Too Many Requests')
        })(),
      )

      await run(resource, ['--json', 'payment_widgets', 'list', '--limit', '1'])

      expect(printJson).toHaveBeenCalledWith([{ id: 'a' }])
    })

    test('deprecated flags do not warn with --json', async () => {
      mockManager.create.mockResolvedValue(result({ id: 'w_1' }))

      await run(resource, ['--json', 'payment_widgets', 'create', '--legacy', 'x'])

      expect(warn).not.toHaveBeenCalled()
    })

    test('POST actions accept --idempotency-key even without a body', async () => {
      mockManager.cancel.mockResolvedValue(result({ id: 'w_1' }))
      const idempotent: ResourceDef = {
        ...resource,
        actions: [
          { name: 'cancel', sdkMethod: 'cancel', description: 'Cancel', idempotencyKey: true },
        ],
      }

      await run(idempotent, ['payment_widgets', 'cancel', 'w_1', '--idempotency-key', 'k_1'])

      expect(mockManager.cancel).toHaveBeenCalledWith('w_1', { idempotency_key: 'k_1' })
    })

    test('usage errors are JSON with --json', async () => {
      const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
      const exitSpy = mockProcessExit()

      await expect(run(resource, ['--json', 'payment_widgets', 'upload', 'w_1'])).rejects.toThrow(
        'process.exit',
      )

      expect(JSON.parse(stderr.mock.calls[0][0] as string)).toEqual({
        error: {
          type: 'usage_error',
          code: 'missing_file',
          param: 'file',
          message: 'Missing required file: file',
        },
      })
      exitSpy.mockRestore()
    })

    test('describeCommands exposes every command with its API params', () => {
      const commands = describeCommands([
        {
          ...resource,
          createFlags: [{ name: 'max-amount', type: 'integer', nestedPath: 'options.max_amount' }],
        },
      ])

      expect(commands.map((c) => c.command)).toEqual([
        'fintoc payment_widgets create',
        'fintoc payment_widgets list',
        'fintoc payment_widgets delete',
        'fintoc payment_widgets submit_for_review',
        'fintoc payment_widgets upload',
      ])
      expect(commands[0].flags).toEqual([
        {
          name: 'max-amount',
          type: 'integer',
          required: false,
          param: 'options.max_amount',
          in: 'body',
        },
      ])
      expect(commands[0].options).toEqual(['--from-json', '--idempotency-key'])
      expect(commands[1].options).toEqual(['--limit'])
      expect(commands[3]).toMatchObject({
        kind: 'write',
        confirm: true,
        args: [{ name: 'id' }],
        options: ['--yes'],
        aliases: ['fintoc payment-widgets submit-for-review'],
      })
    })
  })
})
