import type { Command } from 'commander'
import type { Fintoc } from 'fintoc'
import type { FlagDef, ResourceDef, SdkManager, Serializable } from '../types.js'
import { readFileSync } from 'node:fs'
import { confirm } from '@inquirer/prompts'
import { createClient, resolveAuth } from '../lib/auth.js'
import { addDefaultAction } from '../lib/commands.js'
import { readConfig } from '../lib/config.js'
import { DEFAULT_LIST_LIMIT } from '../lib/constants.js'
import { handleError } from '../lib/errors.js'
import { error, hint, printDetail, printJson, printTable, success } from '../lib/output.js'

type RootOpts = {
  apiKey?: string
  json?: boolean
}

const toCamelCase = (str: string) => str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

const toSnakeCase = (str: string) => str.replace(/-/g, '_')

const getRootOpts = (actionCmd: Command) => {
  let cmd = actionCmd
  while (cmd.parent) {
    cmd = cmd.parent
  }
  return cmd.opts<RootOpts>()
}

const resourceCliPath = (resource: ResourceDef) =>
  resource.sdkNamespace === 'v2' ? `v2 ${resource.cliCommand}` : resource.cliCommand

const getManager = (client: Fintoc, resource: ResourceDef) => {
  const base =
    resource.sdkNamespace === 'v2' ? (client as unknown as Record<string, unknown>).v2 : client
  let current = base as Record<string, unknown>
  for (const part of resource.sdkMethod.split('.')) {
    current = current[part] as Record<string, unknown>
    if (!current) {
      throw new Error(`SDK path "${resource.sdkMethod}" not found at "${part}"`)
    }
  }
  return current as unknown as SdkManager
}

const parseFlagValue = (value: string, flag: FlagDef) => {
  if (flag.type === 'integer') {
    const num = Number(value)
    if (Number.isNaN(num)) {
      throw new TypeError(`Invalid value '${value}' for flag --${flag.name}: expected an integer`)
    }
    if (!Number.isInteger(num)) {
      throw new TypeError(`Invalid value '${value}' for flag --${flag.name}: expected an integer`)
    }
    return num
  }
  if (flag.type === 'boolean') {
    return value === 'true'
  }
  if (flag.type === 'string[]') {
    return value.split(',').map((s) => s.trim())
  }
  return value
}

const addFlags = (cmd: Command, flags: FlagDef[]) => {
  for (const flag of flags) {
    const flagName = `--${flag.name} <${flag.type === 'string[]' ? 'values' : flag.type}>`
    const desc = flag.description ?? ''
    const fullDesc = flag.required ? `${desc} (required)` : desc
    cmd.option(flagName, fullDesc)
  }
}

const setNestedValue = (obj: Record<string, unknown>, path: string, value: unknown) => {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}

const collectSetOptions = (cmd: Command, flags: FlagDef[]) => {
  const opts = cmd.opts()
  const result: Record<string, unknown> = {}

  for (const flag of flags) {
    const camelName = toCamelCase(flag.name)
    if (opts[camelName] !== undefined) {
      const value = parseFlagValue(String(opts[camelName]), flag)
      if (flag.nestedPath) {
        setNestedValue(result, flag.nestedPath, value)
      } else {
        const snakeName = toSnakeCase(flag.name)
        result[snakeName] = value
      }
    }
  }

  return result
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const deepMerge = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> => {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const sourceVal = source[key]
    const targetVal = result[key]
    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      result[key] = deepMerge(targetVal, sourceVal)
    } else {
      result[key] = sourceVal
    }
  }
  return result
}

const readJsonBody = (fromJson: string): Record<string, unknown> => {
  if (fromJson === '-' && process.stdin.isTTY) {
    error('--from-json -: no input on stdin. Pipe a file or use a path instead')
    process.exit(1)
  }

  let raw: string
  try {
    raw = fromJson === '-' ? readFileSync(0, 'utf-8') : readFileSync(fromJson, 'utf-8')
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      error(`--from-json: file '${fromJson}' not found`)
      process.exit(1)
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    error(`--from-json: invalid JSON${fromJson !== '-' ? ` in ${fromJson}` : ''}`)
    process.exit(1)
  }

  if (!isPlainObject(parsed)) {
    error('--from-json must contain a JSON object')
    process.exit(1)
  }

  return parsed as Record<string, unknown>
}

const validateRequired = (cmd: Command, flags: FlagDef[], fullCliPath: string, verb: string) => {
  const opts = cmd.opts()
  const missing = flags
    .filter((f) => f.required && opts[toCamelCase(f.name)] === undefined)
    .map((f) => `--${f.name}`)

  if (missing.length > 0) {
    error(`Missing required ${missing.length === 1 ? 'flag' : 'flags'}: ${missing.join(', ')}`)
    hint('')
    hint(
      `  Usage: fintoc ${fullCliPath} ${verb} ${flags
        .filter((f) => f.required)
        .map((f) => `--${f.name} <${f.type}>`)
        .join(' ')}`,
    )
    hint(`  Help:  fintoc ${fullCliPath} ${verb} --help`)
    process.exit(1)
  }
}

// JWS precedence: --jws-private-key flag > config.toml
const resolveClient = (parentOpts: RootOpts, resource: ResourceDef, jwsKeyPath?: string) => {
  const auth = resolveAuth(parentOpts)
  const configJwsPath = resource.needsJws ? readConfig().jws_private_key : undefined
  const resolvedPath = jwsKeyPath ?? configJwsPath
  return createClient(auth.secretKey, resolvedPath)
}

const isSerializable = (obj: unknown): obj is Serializable =>
  typeof obj === 'object' &&
  obj !== null &&
  'serialize' in obj &&
  typeof obj.serialize === 'function'

const serialize = (obj: unknown): Record<string, unknown> => {
  if (isSerializable(obj)) {
    return obj.serialize()
  }
  if (typeof obj === 'object' && obj !== null) {
    return { ...obj } as Record<string, unknown>
  }
  return {}
}

const registerCreate = (parent: Command, resource: ResourceDef) => {
  const cmd = parent.command('create').description(`Create a new ${resource.displayName}`)

  cmd.option(
    '--from-json <path>',
    'Read request body from a JSON file (use "-" for stdin). JSON keys must match the API body format (see https://docs.fintoc.com)',
  )
  if (resource.needsJws) {
    cmd.option('--jws-private-key <path>', 'Path to JWS private key PEM file')
  }
  addFlags(cmd, resource.createFlags ?? [])

  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    const rootOpts = getRootOpts(actionCmd)
    const localOpts = actionCmd.opts<{ fromJson?: string; jwsPrivateKey?: string }>()

    if (!localOpts.fromJson) {
      validateRequired(actionCmd, resource.createFlags ?? [], resourceCliPath(resource), 'create')
    }

    try {
      const jsonBody = localOpts.fromJson ? readJsonBody(localOpts.fromJson) : {}
      const flagBody = collectSetOptions(actionCmd, resource.createFlags ?? [])
      const body = deepMerge(jsonBody, flagBody)

      const client = resolveClient(rootOpts, resource, localOpts.jwsPrivateKey)
      const manager = getManager(client, resource)

      const result = await manager.create!(body)
      const data = serialize(result)

      if (rootOpts.json) {
        printJson(data)
      } else {
        success(`${resource.displayName} created`)
        hint('')
        printDetail(data)
      }
    } catch (err) {
      handleError(err, {
        cliPath: resourceCliPath(resource),
        verb: 'create',
        json: rootOpts.json,
        availableVerbs: resource.verbs,
      })
    }
  })
}

const registerGet = (parent: Command, resource: ResourceDef) => {
  const argName = resource.getArg?.name ?? 'id'
  const cmd = parent
    .command('get')
    .description(`Get a ${resource.displayName} by ${argName.replace(/_/g, ' ')}`)
  cmd.argument(`<${argName}>`, resource.getArg?.description)
  addFlags(cmd, resource.getFlags ?? [])
  cmd.action(async (identifier: string, _opts: unknown, actionCmd: Command) => {
    const rootOpts = getRootOpts(actionCmd)
    const flags = resource.getFlags ?? []

    validateRequired(actionCmd, flags, resourceCliPath(resource), 'get')

    try {
      const client = resolveClient(rootOpts, resource)
      const manager = getManager(client, resource)

      const params = flags.length ? collectSetOptions(actionCmd, flags) : undefined
      const result = await manager.get!(identifier, params)
      const data = serialize(result)

      if (rootOpts.json) {
        printJson(data)
      } else {
        printDetail(data)
      }
    } catch (err) {
      handleError(err, {
        cliPath: resourceCliPath(resource),
        verb: 'get',
        id: identifier,
        json: rootOpts.json,
        availableVerbs: resource.verbs,
      })
    }
  })
}

const registerList = (parent: Command, resource: ResourceDef) => {
  const cmd = parent
    .command('list')
    .description(`List ${resource.name.replace(/_/g, ' ')}`)
    .option('--limit <number>', 'Max results to show', String(DEFAULT_LIST_LIMIT))

  addFlags(cmd, resource.listFlags ?? [])

  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    const rootOpts = getRootOpts(actionCmd)

    validateRequired(actionCmd, resource.listFlags ?? [], resourceCliPath(resource), 'list')

    const localOpts = actionCmd.opts<{ limit: string }>()
    const limit = Number(localOpts.limit)
    if (Number.isNaN(limit) || !Number.isInteger(limit) || limit <= 0) {
      error('--limit must be a positive integer')
      process.exit(1)
    }

    try {
      const filters = collectSetOptions(actionCmd, resource.listFlags ?? [])
      const client = resolveClient(rootOpts, resource)
      const manager = getManager(client, resource)

      const generator = (await manager.list!({ ...filters, lazy: true })) as AsyncIterable<unknown>
      const items: Record<string, unknown>[] = []

      for await (const item of generator) {
        items.push(serialize(item))
        if (items.length >= limit) {
          break
        }
      }

      if (rootOpts.json) {
        printJson(items)
      } else {
        printTable({
          columns: resource.priorityColumns,
          rows: items,
        })
      }
    } catch (err) {
      handleError(err, {
        cliPath: resourceCliPath(resource),
        verb: 'list',
        json: rootOpts.json,
        availableVerbs: resource.verbs,
      })
    }
  })
}

const registerDelete = (parent: Command, resource: ResourceDef) => {
  const cmd = parent
    .command('delete <id>')
    .description(`Delete a ${resource.displayName}`)
    .option('--yes', 'Skip confirmation prompt')
  cmd.action(async (id: string, opts: { yes?: boolean }, actionCmd: Command) => {
    const rootOpts = getRootOpts(actionCmd)

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
        hint('Aborted.')
        return
      }
    }

    try {
      const client = resolveClient(rootOpts, resource)
      const manager = getManager(client, resource)

      await manager.delete!(id)
      success(`${resource.displayName} '${id}' deleted`)
    } catch (err) {
      handleError(err, {
        cliPath: resourceCliPath(resource),
        verb: 'delete',
        id,
        json: rootOpts.json,
        availableVerbs: resource.verbs,
      })
    }
  })
}

const registerExpire = (parent: Command, resource: ResourceDef) => {
  const cmd = parent
    .command('expire <id>')
    .description(`Expire a ${resource.displayName}`)
    .option('--yes', 'Skip confirmation prompt')
  cmd.action(async (id: string, opts: { yes?: boolean }, actionCmd: Command) => {
    const rootOpts = getRootOpts(actionCmd)

    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        error(`Confirmation required to expire '${id}'. Use --yes to skip.`)
        process.exit(1)
      }
      const confirmed = await confirm({
        message: `Are you sure you want to expire '${id}'?`,
        default: false,
      })
      if (!confirmed) {
        hint('Aborted.')
        return
      }
    }

    try {
      const client = resolveClient(rootOpts, resource)
      const manager = getManager(client, resource)

      await manager.expire!(id)
      success(`${resource.displayName} '${id}' expired`)
    } catch (err) {
      handleError(err, {
        cliPath: resourceCliPath(resource),
        verb: 'expire',
        id,
        json: rootOpts.json,
        availableVerbs: resource.verbs,
      })
    }
  })
}

const registerTest = (parent: Command, resource: ResourceDef) => {
  const cmd = parent
    .command('test <id>')
    .description(`Send a test event to a ${resource.displayName}`)
  addFlags(cmd, resource.testFlags ?? [])
  cmd.action(async (id: string, _opts: unknown, actionCmd: Command) => {
    const rootOpts = getRootOpts(actionCmd)
    const flags = resource.testFlags ?? []

    validateRequired(actionCmd, flags, resourceCliPath(resource), 'test')

    try {
      const args = collectSetOptions(actionCmd, flags)
      const client = resolveClient(rootOpts, resource)
      const manager = getManager(client, resource)

      const result = await manager.test!(id, args)
      const data = serialize(result)

      if (rootOpts.json) {
        printJson(data)
      } else {
        success(`Test event sent to ${resource.displayName} '${id}'`)
        hint('')
        printDetail(data)
      }
    } catch (err) {
      handleError(err, {
        cliPath: resourceCliPath(resource),
        verb: 'test',
        id,
        json: rootOpts.json,
        availableVerbs: resource.verbs,
      })
    }
  })
}

const verbRegistrars = {
  create: registerCreate,
  get: registerGet,
  list: registerList,
  delete: registerDelete,
  expire: registerExpire,
  test: registerTest,
} satisfies Record<string, (parent: Command, resource: ResourceDef) => void>

export const registerResourceCommands = (program: Command, resourceDefs: ResourceDef[]) => {
  resourceDefs.forEach((resource) => {
    if (resource.verbs.includes('create') && !resource.createFlags?.length) {
      throw new Error(`Resource ${resource.name} has 'create' verb but no createFlags`)
    }

    const resourceCmd = program
      .command(resource.cliCommand)
      .description(`Manage ${resource.displayName}s`)

    resourceCmd.configureHelp({ showGlobalOptions: true })

    resource.verbs.forEach((verb) => {
      verbRegistrars[verb]?.(resourceCmd, resource)
    })

    addDefaultAction(resourceCmd)
  })
}
