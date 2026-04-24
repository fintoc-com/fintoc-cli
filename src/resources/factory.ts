import type { Command } from 'commander'
import type { Fintoc } from 'fintoc'
import type { FlagDef, ResourceDef } from '../types.js'
import { confirm } from '@inquirer/prompts'
import { createClient, resolveAuth } from '../lib/auth.js'
import { readConfig } from '../lib/config.js'
import { error, log, printDetail, printJson, printTable, success } from '../lib/output.js'

// Convert kebab-case flag name to camelCase for SDK
const toCamelCase = (str: string): string =>
  str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

// Convert kebab-case flag name to snake_case for SDK
const toSnakeCase = (str: string): string => str.replace(/-/g, '_')

// Get the SDK manager for a resource

const getManager = (
  client: Fintoc,
  resource: ResourceDef,
): Record<string, (...args: unknown[]) => Promise<unknown>> => {
  const base =
    resource.sdkNamespace === 'v2' ? (client as unknown as Record<string, unknown>).v2 : client
  return (base as Record<string, unknown>)[resource.sdkMethod] as Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >
}

// Parse flag value according to its type
const parseFlagValue = (value: string, flag: FlagDef): unknown => {
  if (flag.type === 'number') return Number(value)
  if (flag.type === 'boolean') return value === 'true'
  if (flag.type === 'string[]') return value.split(',').map((s) => s.trim())
  return value
}

// Add Commander options from flag definitions
const addFlags = (cmd: Command, flags: FlagDef[]): void => {
  for (const flag of flags) {
    const flagName = `--${flag.name} <${flag.type === 'string[]' ? 'values' : flag.type}>`
    const desc = flag.description ?? ''
    const fullDesc = flag.required ? `${desc} (required)` : desc
    cmd.option(flagName, fullDesc)
  }
}

// Collect only explicitly-set option values (skip Commander defaults)
const collectSetOptions = (cmd: Command, flags: FlagDef[]): Record<string, unknown> => {
  const opts = cmd.opts()
  const result: Record<string, unknown> = {}

  for (const flag of flags) {
    const camelName = toCamelCase(flag.name)
    if (opts[camelName] !== undefined) {
      const snakeName = toSnakeCase(flag.name)
      result[snakeName] = parseFlagValue(String(opts[camelName]), flag)
    }
  }

  return result
}

// Validate required flags are present
const validateRequired = (
  cmd: Command,
  flags: FlagDef[],
  resourceName: string,
  verb: string,
): boolean => {
  const opts = cmd.opts()
  const missing = flags
    .filter((f) => f.required && opts[toCamelCase(f.name)] === undefined)
    .map((f) => `--${f.name}`)

  if (missing.length > 0) {
    error(`Missing required ${missing.length === 1 ? 'flag' : 'flags'}: ${missing.join(', ')}`)
    log('')
    log(
      `  Usage: fintoc ${resourceName} ${verb} ${flags
        .filter((f) => f.required)
        .map((f) => `--${f.name} <${f.type}>`)
        .join(' ')}`,
    )
    log(`  Help:  fintoc ${resourceName} ${verb} --help`)
    process.exit(1)
  }

  return true
}

// Resolve auth + create SDK client, handling errors
const resolveClient = (parentOpts: {
  apiKey?: string
}): { client: Fintoc; jwsPrivateKey?: string } => {
  const auth = resolveAuth(parentOpts)
  const config = readConfig()
  const jwsPrivateKey = config.jws_private_key
  const client = createClient(auth.secretKey, jwsPrivateKey)
  return { client, jwsPrivateKey }
}

// Serialize SDK resource object to plain object
const serialize = (obj: unknown): Record<string, unknown> => {
  if (
    typeof obj === 'object' &&
    obj !== null &&
    'serialize' in obj &&
    typeof obj.serialize === 'function'
  ) {
    return obj.serialize() as Record<string, unknown>
  }
  if (typeof obj === 'object' && obj !== null) return { ...obj } as Record<string, unknown>
  return {}
}

const registerCreate = (parent: Command, resource: ResourceDef): void => {
  const cmd = parent
    .command('create')
    .description(`Create a new ${resource.name.replace(/_/g, ' ').replace(/s$/, '')}`)

  addFlags(cmd, resource.createFlags ?? [])

  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    const parentOpts = actionCmd.parent!.parent!.opts<{ apiKey?: string; json?: boolean }>()
    validateRequired(actionCmd, resource.createFlags ?? [], resource.cliCommand, 'create')

    const body = collectSetOptions(actionCmd, resource.createFlags ?? [])
    const { client } = resolveClient(parentOpts)
    const manager = getManager(client, resource)

    const result = await manager.create(body)
    const data = serialize(result)

    if (parentOpts.json) {
      printJson(data)
    } else {
      success(`${resource.name.replace(/_/g, ' ').replace(/s$/, '')} created`)
      log('')
      printDetail(data, resource.priorityColumns)
    }
  })
}

const registerGet = (parent: Command, resource: ResourceDef): void => {
  parent
    .command('get <id>')
    .description(`Get a ${resource.name.replace(/_/g, ' ').replace(/s$/, '')} by ID`)
    .action(async (id: string, _opts: unknown, actionCmd: Command) => {
      const parentOpts = actionCmd.parent!.parent!.opts<{ apiKey?: string; json?: boolean }>()
      const { client } = resolveClient(parentOpts)
      const manager = getManager(client, resource)

      const result = await manager.get(id)
      const data = serialize(result)

      if (parentOpts.json) {
        printJson(data)
      } else {
        printDetail(data, resource.priorityColumns)
      }
    })
}

const registerList = (parent: Command, resource: ResourceDef): void => {
  const cmd = parent
    .command('list')
    .description(`List ${resource.name.replace(/_/g, ' ')}`)
    .option('--limit <number>', 'Max results to show', '10')

  addFlags(cmd, resource.listFlags ?? [])

  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    const parentOpts = actionCmd.parent!.parent!.opts<{ apiKey?: string; json?: boolean }>()
    const localOpts = actionCmd.opts<{ limit: string }>()
    const limit = Number(localOpts.limit)
    if (Number.isNaN(limit) || limit <= 0) {
      error('--limit must be a positive number')
      process.exit(1)
    }

    const filters = collectSetOptions(actionCmd, resource.listFlags ?? [])
    const { client } = resolveClient(parentOpts)
    const manager = getManager(client, resource)

    const generator = (await manager.list({ ...filters, lazy: true })) as AsyncIterable<unknown>
    const items: Record<string, unknown>[] = []

    for await (const item of generator) {
      items.push(serialize(item))
      if (items.length >= limit) break
    }

    if (parentOpts.json) {
      printJson(items)
    } else {
      printTable({
        columns: resource.priorityColumns,
        rows: items,
      })
    }
  })
}

const registerDelete = (parent: Command, resource: ResourceDef): void => {
  parent
    .command('delete <id>')
    .description(`Delete a ${resource.name.replace(/_/g, ' ').replace(/s$/, '')}`)
    .option('--yes', 'Skip confirmation prompt')
    .action(async (id: string, opts: { yes?: boolean }, actionCmd: Command) => {
      const parentOpts = actionCmd.parent!.parent!.opts<{ apiKey?: string; json?: boolean }>()

      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          error(`Confirmation required to delete '${id}'. Use --yes to skip.`)
          process.exit(1)
        }
        const confirmed = await confirm({
          message: `Are you sure you want to delete '${id}'?`,
          default: false,
        })
        if (!confirmed) {
          log('Aborted.')
          return
        }
      }

      const { client } = resolveClient(parentOpts)
      const manager = getManager(client, resource)

      await manager.delete(id)
      success(`${resource.name.replace(/_/g, ' ').replace(/s$/, '')} '${id}' deleted`)
    })
}

const verbRegistrars: Record<string, (parent: Command, resource: ResourceDef) => void> = {
  create: registerCreate,
  get: registerGet,
  list: registerList,
  delete: registerDelete,
}

export const registerResourceCommands = (program: Command, resourceDefs: ResourceDef[]): void => {
  for (const resource of resourceDefs) {
    const resourceCmd = program
      .command(resource.cliCommand)
      .description(`Manage ${resource.name.replace(/_/g, ' ')}`)

    for (const verb of resource.verbs) {
      const registrar = verbRegistrars[verb]
      if (registrar) {
        registrar(resourceCmd, resource)
      }
    }
  }
}
