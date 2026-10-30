import type { Command } from 'commander'
import type { Fintoc } from 'fintoc'
import type {
  ActionDef,
  ArgDef,
  FileDef,
  FlagDef,
  ResourceDef,
  SdkManager,
  Serializable,
  UploadFile,
  Verb,
} from '../types.js'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { confirm } from '@inquirer/prompts'
import { InvalidArgumentError, Option } from 'commander'
import { set } from 'es-toolkit/compat'
import { createClient, resolveAuth } from '../lib/auth.js'
import { addDefaultAction } from '../lib/commands.js'
import { readConfig } from '../lib/config.js'
import { DEFAULT_LIST_LIMIT } from '../lib/constants.js'
import { deepMerge } from '../lib/deep-merge.js'
import { handleError, UsageError } from '../lib/errors.js'
import { readJsonBody } from '../lib/json-body.js'
import { hint, printDetail, printJson, printTable, success, warn } from '../lib/output.js'

type RootOpts = {
  apiKey?: string
  json?: boolean
}

type BodyOpts = {
  fromJson?: string
  jwsPrivateKey?: string
  file?: Record<string, string>
  yes?: boolean
  idempotencyKey?: string
}

const FROM_JSON_DESCRIPTION =
  'Read request body from a JSON file (use "-" for stdin). JSON keys must match the API body format (see https://docs.fintoc.com)'

const IDEMPOTENCY_KEY_DESCRIPTION =
  'Idempotency key, so retrying the same request does not create a duplicate'

const toCamelCase = (str: string) => str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

const toSnakeCase = (str: string) => str.replace(/-/g, '_')

const toKebabCase = (str: string) => str.replace(/_/g, '-')

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const fillTemplate = (template: string, resource: ResourceDef, id?: string) =>
  template.replace('{resource}', resource.displayName).replace(/ ?'\{id\}'/, id ? ` '${id}'` : '')

const withArticle = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`

const pluralName = (resource: ResourceDef) =>
  resource.pluralDisplayName ?? `${resource.displayName}s`

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

const PARAMETERS_GROUP = 'API parameters:'

const parseInteger = (value: string) => {
  const num = Number(value)
  if (value.trim() === '' || !Number.isInteger(num)) {
    throw new InvalidArgumentError('Expected an integer.')
  }
  return num
}

const parsePositiveInteger = (value: string) => {
  const num = parseInteger(value)
  if (num <= 0) {
    throw new InvalidArgumentError('Expected a positive integer.')
  }
  return num
}

const parseBoolean = (value: string) => {
  const normalized = value.toLowerCase()
  if (normalized !== 'true' && normalized !== 'false') {
    throw new InvalidArgumentError('Expected true or false.')
  }
  return normalized === 'true'
}

const parseList = (value: string, previous: string[] = []) => [
  ...previous,
  ...value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
]

const parseMapEntry = (value: string, previous: Record<string, string> = {}) => {
  const separator = value.indexOf('=')
  if (separator <= 0) {
    throw new InvalidArgumentError('Expected <key>=<value>.')
  }
  return { ...previous, [value.slice(0, separator)]: value.slice(separator + 1) }
}

const FLAG_PARSERS: Record<
  FlagDef['type'],
  ((value: string, previous: never) => unknown) | undefined
> = {
  string: undefined,
  integer: parseInteger,
  boolean: parseBoolean,
  'string[]': parseList,
  map: parseMapEntry,
}

const FLAG_PLACEHOLDERS: Partial<Record<FlagDef['type'], string>> = {
  'string[]': 'values',
  map: 'key=value',
}

const flagTerm = (flag: FlagDef) => {
  if (flag.type === 'boolean') {
    return `--${flag.name} [boolean]`
  }
  return `--${flag.name} <${FLAG_PLACEHOLDERS[flag.type] ?? flag.type}>`
}

const flagDescription = (flag: FlagDef) => {
  const parts = [flag.description ?? '']
  if (flag.type === 'map') {
    parts.push('repeatable')
  }
  if (flag.type === 'string[]') {
    parts.push('comma-separated or repeatable')
  }
  const desc = parts.filter(Boolean).join(', ')
  return flag.required || flag.pathParam ? `${desc} (required)` : desc
}

const addFlags = (cmd: Command, flags: FlagDef[]) => {
  for (const flag of flags) {
    const option = new Option(flagTerm(flag), flagDescription(flag)).helpGroup(PARAMETERS_GROUP)
    const parser = FLAG_PARSERS[flag.type]
    if (parser) {
      option.argParser(parser as (value: string, previous: unknown) => unknown)
    }
    if (flag.deprecated) {
      option.hideHelp()
    }
    cmd.addOption(option)
  }
}

const addLimitOption = (cmd: Command) =>
  cmd.addOption(
    new Option('--limit <integer>', 'Max results to show')
      .default(DEFAULT_LIST_LIMIT)
      .argParser(parsePositiveInteger),
  )

const parseFileValue = (files: FileDef[]) => {
  const allowed = files.map((f) => f.field)
  return (value: string, previous: Record<string, string> = {}) => {
    const separator = value.indexOf('=')
    let field = separator > 0 ? value.slice(0, separator) : ''
    let path = separator > 0 ? value.slice(separator + 1) : ''
    if (files.length === 1 && !allowed.includes(field)) {
      field = allowed[0]
      path = value
    }
    if (!field || !path) {
      throw new InvalidArgumentError('Expected <field>=<path>.')
    }
    if (!allowed.includes(field)) {
      throw new InvalidArgumentError(
        `Unknown field '${field}'. Valid fields: ${allowed.join(', ')}.`,
      )
    }
    if (previous[field]) {
      throw new InvalidArgumentError(`Field '${field}' was given more than once.`)
    }
    return { ...previous, [field]: path }
  }
}

const addFileOption = (cmd: Command, files: FileDef[]) => {
  if (!files.length) {
    return
  }
  const fields = files
    .map(
      (f) =>
        `${f.field}${f.required ? ' (required)' : ''}${f.description ? `: ${f.description}` : ''}`,
    )
    .join('; ')
  const shorthand = files.length === 1 ? ' (or just <path>)' : ''
  cmd.addOption(
    new Option(
      '--file <field=path>',
      `File to upload as multipart${shorthand}, repeatable. Fields: ${fields}`,
    )
      .argParser(parseFileValue(files))
      .helpGroup(PARAMETERS_GROUP),
  )
}

const collectSetOptions = (cmd: Command, flags: FlagDef[]) => {
  const opts = cmd.opts()
  const result: Record<string, unknown> = {}

  for (const flag of flags) {
    const value = opts[toCamelCase(flag.name)]
    if (value === undefined) {
      continue
    }
    if (flag.deprecated) {
      if (!getRootOpts(cmd).json) {
        warn(`--${flag.name} is deprecated: ${flag.deprecated}`)
      }
      continue
    }
    set(result, flag.nestedPath ?? toSnakeCase(flag.name), value)
  }

  return result
}

const usageHints = (fullCliPath: string, verb: string, usage: string[]) => [
  `Usage: fintoc ${[fullCliPath, verb, ...usage].join(' ')}`,
  `Help:  fintoc ${fullCliPath} ${verb} --help`,
]

const validateRequired = (
  cmd: Command,
  flags: FlagDef[],
  fullCliPath: string,
  verb: string,
  { onlyPathParams = false, args = [] as string[] } = {},
) => {
  const opts = cmd.opts()
  const isRequired = (f: FlagDef) => f.pathParam || (!onlyPathParams && f.required)
  const missing = flags.filter((f) => isRequired(f) && opts[toCamelCase(f.name)] === undefined)

  if (missing.length > 0) {
    const names = missing.map((f) => `--${f.name}`)
    throw new UsageError(
      `Missing required ${missing.length === 1 ? 'flag' : 'flags'}: ${names.join(', ')}`,
      {
        code: 'missing_flag',
        param: missing[0].name,
        hints: usageHints(fullCliPath, verb, [
          ...args.map((a) => `<${a}>`),
          ...flags.filter(isRequired).map(flagTerm),
        ]),
      },
    )
  }
}

const readUploadFile = (path: string): UploadFile => {
  try {
    return { data: readFileSync(path), filename: basename(path) }
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      throw new UsageError(`--file: file '${path}' not found`, {
        code: 'file_not_found',
        param: 'file',
      })
    }
    throw err
  }
}

const collectFiles = (
  paths: Record<string, string> = {},
  files: FileDef[],
  fullCliPath: string,
  verb: string,
) => {
  const missing = files.filter((f) => f.required && !paths[f.field]).map((f) => f.field)
  if (missing.length > 0) {
    throw new UsageError(
      `Missing required ${missing.length === 1 ? 'file' : 'files'}: ${missing.join(', ')}`,
      {
        code: 'missing_file',
        param: 'file',
        hints: usageHints(
          fullCliPath,
          verb,
          missing.map((f) => `--file ${f}=<path>`),
        ),
      },
    )
  }
  return Object.fromEntries(
    Object.entries(paths).map(([field, path]) => [field, readUploadFile(path)]),
  )
}

// JWS precedence: --jws-private-key flag > config.toml
const resolveClient = (
  parentOpts: RootOpts,
  { needsJws, jwsKeyPath }: { needsJws?: boolean; jwsKeyPath?: string } = {},
) => {
  const auth = resolveAuth(parentOpts)
  const configJwsPath = needsJws ? readConfig().jws_private_key : undefined
  const resolvedPath = jwsKeyPath ?? configJwsPath
  return createClient(auth.secretKey, resolvedPath)
}

const isLiveMode = (rootOpts: RootOpts) => {
  try {
    return resolveAuth(rootOpts).secretKey.startsWith('sk_live_')
  } catch {
    return false
  }
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

const confirmOrAbort = async (rootOpts: RootOpts, yes: boolean | undefined, phrase: string) => {
  if (yes) {
    return true
  }
  const action = `${phrase}${isLiveMode(rootOpts) ? ' in LIVE mode' : ''}`
  if (!process.stdin.isTTY) {
    throw new UsageError(`Confirmation required to ${action}. Use --yes to skip.`, {
      code: 'confirmation_required',
      param: 'yes',
    })
  }
  const confirmed = await confirm(
    { message: `Are you sure you want to ${action}?`, default: false },
    { output: process.stderr },
  )
  if (!confirmed) {
    hint('Aborted.')
  }
  return confirmed
}

const collectList = async (
  generator: AsyncIterable<unknown> | Iterable<unknown>,
  limit: number,
) => {
  const items: Record<string, unknown>[] = []
  const iterator = (async function* () {
    yield* generator
  })()
  while (items.length < limit) {
    const { value, done } = await iterator.next()
    if (done) {
      return { items, hasMore: false }
    }
    items.push(serialize(value))
  }
  let hasMore = true
  try {
    hasMore = !(await iterator.next()).done
  } catch {}
  await iterator.return(undefined)
  return { items, hasMore }
}

const printList = (
  rootOpts: RootOpts,
  { items, hasMore }: Awaited<ReturnType<typeof collectList>>,
  columns: string[],
) => {
  if (rootOpts.json) {
    printJson(items)
    return
  }
  printTable({ columns, rows: items })
  if (hasMore) {
    hint(`More results may be available. Use --limit to show more than ${items.length}.`)
  }
}

// Body precedence: --from-json < flags < --file
const buildBody = (actionCmd: Command, flags: FlagDef[], files: Record<string, UploadFile>) => {
  const { fromJson, idempotencyKey } = actionCmd.opts<BodyOpts>()
  const jsonBody = fromJson ? readJsonBody(fromJson) : {}
  const body = deepMerge(jsonBody, collectSetOptions(actionCmd, flags)) as Record<string, unknown>
  for (const [field, file] of Object.entries(files)) {
    set(body, field, file)
  }
  if (idempotencyKey) {
    body.idempotency_key = idempotencyKey
  }
  return body
}

const argDescription = (resource: ResourceDef) =>
  resource.getArg?.description ?? `ID of the ${resource.displayName}`

const verbDescription = (resource: ResourceDef, verb: Verb) => {
  const argName = (resource.getArg?.name ?? 'id').replace(/_/g, ' ')
  return {
    create: `Create a new ${resource.displayName}`,
    get: `Get ${withArticle(resource.displayName)} by ${argName === 'id' ? 'ID' : argName}`,
    list: `List ${pluralName(resource)}`,
    update: `Update ${withArticle(resource.displayName)}`,
    delete: `Delete ${withArticle(resource.displayName)}`,
  }[verb]
}

const runCommand = async (
  actionCmd: Command,
  context: { cliPath: string; verb: string; id?: string; availableVerbs: string[] },
  run: (rootOpts: RootOpts) => Promise<void>,
) => {
  const rootOpts = getRootOpts(actionCmd)
  try {
    await run(rootOpts)
  } catch (err) {
    handleError(err, { ...context, json: rootOpts.json })
  }
}

const registerCreate = (parent: Command, resource: ResourceDef) => {
  const cliPath = resourceCliPath(resource)
  const flags = resource.createFlags ?? []
  const cmd = parent.command('create').description(verbDescription(resource, 'create'))

  addFlags(cmd, flags)
  addFileOption(cmd, resource.createFiles ?? [])
  cmd.option('--from-json <path>', FROM_JSON_DESCRIPTION)
  cmd.option('--idempotency-key <key>', IDEMPOTENCY_KEY_DESCRIPTION)
  if (resource.needsJws) {
    cmd.option('--jws-private-key <path>', 'Path to JWS private key PEM file')
  }

  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    const context = { cliPath, verb: 'create', availableVerbs: resource.verbs }
    await runCommand(actionCmd, context, async (rootOpts) => {
      const localOpts = actionCmd.opts<BodyOpts>()
      validateRequired(actionCmd, flags, cliPath, 'create', {
        onlyPathParams: !!localOpts.fromJson,
      })
      const files = collectFiles(localOpts.file, resource.createFiles ?? [], cliPath, 'create')
      const body = buildBody(actionCmd, flags, files)

      const client = resolveClient(rootOpts, {
        needsJws: resource.needsJws,
        jwsKeyPath: localOpts.jwsPrivateKey,
      })
      const result = await getManager(client, resource).create!(body)
      const data = serialize(result)

      if (rootOpts.json) {
        printJson(data)
      } else {
        success(
          `${capitalize(resource.displayName)}${data.id ? ` '${String(data.id)}'` : ''} created`,
        )
        hint('')
        printDetail(data)
      }
    })
  })
}

const registerGet = (parent: Command, resource: ResourceDef) => {
  const cliPath = resourceCliPath(resource)
  const argName = resource.getArg?.name ?? 'id'
  const flags = resource.getFlags ?? []
  const cmd = parent.command('get').description(verbDescription(resource, 'get'))
  cmd.argument(`<${argName}>`, argDescription(resource))
  addFlags(cmd, flags)

  cmd.action(async (identifier: string, _opts: unknown, actionCmd: Command) => {
    const context = { cliPath, verb: 'get', id: identifier, availableVerbs: resource.verbs }
    await runCommand(actionCmd, context, async (rootOpts) => {
      validateRequired(actionCmd, flags, cliPath, 'get', { args: [argName] })
      const params = flags.length ? collectSetOptions(actionCmd, flags) : undefined
      const result = await getManager(resolveClient(rootOpts), resource).get!(identifier, params)
      const data = serialize(result)

      if (rootOpts.json) {
        printJson(data)
      } else {
        printDetail(data)
      }
    })
  })
}

const registerList = (parent: Command, resource: ResourceDef) => {
  const cliPath = resourceCliPath(resource)
  const flags = resource.listFlags ?? []
  const cmd = parent.command('list').description(verbDescription(resource, 'list'))
  addFlags(cmd, flags)
  addLimitOption(cmd)

  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    const context = { cliPath, verb: 'list', availableVerbs: resource.verbs }
    await runCommand(actionCmd, context, async (rootOpts) => {
      validateRequired(actionCmd, flags, cliPath, 'list')
      const { limit } = actionCmd.opts<{ limit: number }>()
      const filters = collectSetOptions(actionCmd, flags)
      const manager = getManager(resolveClient(rootOpts), resource)

      const generator = (await manager.list!({ ...filters, lazy: true })) as AsyncIterable<unknown>
      printList(rootOpts, await collectList(generator, limit), resource.priorityColumns)
    })
  })
}

const registerUpdate = (parent: Command, resource: ResourceDef) => {
  const cliPath = resourceCliPath(resource)
  const argName = resource.getArg?.name ?? 'id'
  const flags = resource.updateFlags ?? []
  const cmd = parent
    .command('update')
    .description(verbDescription(resource, 'update'))
    .argument(`<${argName}>`, argDescription(resource))
  addFlags(cmd, flags)
  cmd.option('--from-json <path>', FROM_JSON_DESCRIPTION)

  cmd.action(async (identifier: string, _opts: unknown, actionCmd: Command) => {
    const context = { cliPath, verb: 'update', id: identifier, availableVerbs: resource.verbs }
    await runCommand(actionCmd, context, async (rootOpts) => {
      const localOpts = actionCmd.opts<BodyOpts>()
      validateRequired(actionCmd, flags, cliPath, 'update', {
        onlyPathParams: !!localOpts.fromJson,
        args: [argName],
      })

      const hasChanges =
        !!localOpts.fromJson ||
        flags.some(
          (f) =>
            !f.pathParam && !f.deprecated && actionCmd.opts()[toCamelCase(f.name)] !== undefined,
        )
      if (!hasChanges) {
        throw new UsageError('Nothing to update: pass at least one flag or --from-json', {
          code: 'missing_flag',
          hints: [`Help:  fintoc ${cliPath} update --help`],
        })
      }

      const body = buildBody(actionCmd, flags, {})
      const result = await getManager(resolveClient(rootOpts), resource).update!(identifier, body)
      const data = serialize(result)

      if (rootOpts.json) {
        printJson(data)
      } else {
        success(`${capitalize(resource.displayName)} '${identifier}' updated`)
        hint('')
        printDetail(data)
      }
    })
  })
}

const registerDelete = (parent: Command, resource: ResourceDef) => {
  const cliPath = resourceCliPath(resource)
  const flags = resource.deleteFlags ?? []
  const argName = resource.getArg?.name ?? 'id'
  const cmd = parent
    .command('delete')
    .description(verbDescription(resource, 'delete'))
    .argument(`<${argName}>`, argDescription(resource))
  addFlags(cmd, flags)
  cmd.option('--yes', 'Skip confirmation prompt')

  cmd.action(async (id: string, opts: { yes?: boolean }, actionCmd: Command) => {
    const context = { cliPath, verb: 'delete', id, availableVerbs: resource.verbs }
    await runCommand(actionCmd, context, async (rootOpts) => {
      validateRequired(actionCmd, flags, cliPath, 'delete', { args: [argName] })
      const phrase = fillTemplate("delete {resource} '{id}'", resource, id)
      if (!(await confirmOrAbort(rootOpts, opts.yes, phrase))) {
        return
      }

      const manager = getManager(resolveClient(rootOpts), resource)
      if (flags.length) {
        await manager.delete!(id, collectSetOptions(actionCmd, flags))
      } else {
        await manager.delete!(id)
      }

      if (rootOpts.json) {
        printJson({ id, deleted: true })
      } else {
        success(`${capitalize(resource.displayName)} '${id}' deleted`)
      }
    })
  })
}

const actionPositional = (resource: ResourceDef, action: ActionDef) => {
  const idArg =
    action.idArg === false
      ? undefined
      : (action.idArg ?? { name: 'id', description: argDescription(resource) })
  return { idArg, positional: [...(idArg ? [idArg] : []), ...(action.extraArgs ?? [])] }
}

const registerAction = (parent: Command, resource: ResourceDef, action: ActionDef) => {
  const kind = action.kind ?? 'write'
  const { idArg, positional } = actionPositional(resource, action)
  const flags = action.flags ?? []
  const files = action.files ?? []
  const cliPath = resourceCliPath(resource)

  const cmd = parent.command(action.name).description(action.description)
  if (toKebabCase(action.name) !== action.name) {
    cmd.alias(toKebabCase(action.name))
  }
  for (const arg of positional) {
    cmd.argument(`<${arg.name}>`, arg.description)
  }
  addFlags(cmd, flags)
  addFileOption(cmd, files)
  if (kind === 'list') {
    addLimitOption(cmd)
  }
  if (action.fromJson) {
    cmd.option('--from-json <path>', FROM_JSON_DESCRIPTION)
  }
  if (action.needsJws) {
    cmd.option('--jws-private-key <path>', 'Path to JWS private key PEM file')
  }
  if (action.idempotencyKey) {
    cmd.option('--idempotency-key <key>', IDEMPOTENCY_KEY_DESCRIPTION)
  }
  if (action.confirm) {
    cmd.option('--yes', 'Skip confirmation prompt')
  }

  cmd.action(async (...actionArgs: unknown[]) => {
    const actionCmd = actionArgs.at(-1) as Command
    const values = actionArgs.slice(0, positional.length) as string[]
    const id = idArg ? values[0] : undefined
    const context = { cliPath, verb: action.name, id, availableVerbs: resource.verbs }

    await runCommand(actionCmd, context, async (rootOpts) => {
      const localOpts = actionCmd.opts<BodyOpts & { limit?: number }>()
      validateRequired(actionCmd, flags, cliPath, action.name, {
        onlyPathParams: !!localOpts.fromJson,
        args: positional.map((a) => a.name),
      })
      const uploads = collectFiles(localOpts.file, files, cliPath, action.name)

      if (action.confirm) {
        const template =
          action.confirmPhrase ?? `${action.name.replace(/_/g, ' ')} {resource} '{id}'`
        if (
          !(await confirmOrAbort(rootOpts, localOpts.yes, fillTemplate(template, resource, id)))
        ) {
          return
        }
      }

      const { file: fileArg, ...bodyFiles } = uploads
      const sdkArgs: unknown[] = values.filter((_, i) => !positional[i].bodyField)
      const bodyArgs = Object.fromEntries(
        positional.flatMap((arg, i) => (arg.bodyField ? [[arg.bodyField, values[i]]] : [])),
      )
      if (action.fileAsArg) {
        sdkArgs.push(fileArg)
      }
      const takesBody =
        flags.length > 0 ||
        !!action.fromJson ||
        !!localOpts.idempotencyKey ||
        Object.keys(bodyArgs).length > 0 ||
        (!action.fileAsArg && files.length > 0)
      if (takesBody) {
        const body = buildBody(actionCmd, flags, action.fileAsArg ? bodyFiles : uploads)
        sdkArgs.push({ ...body, ...bodyArgs })
      }

      const client = resolveClient(rootOpts, {
        needsJws: action.needsJws,
        jwsKeyPath: localOpts.jwsPrivateKey,
      })
      const manager = getManager(client, resource) as unknown as Record<string, unknown>
      const method = manager[action.sdkMethod]
      if (typeof method !== 'function') {
        throw new TypeError(`SDK method "${resource.sdkMethod}.${action.sdkMethod}" not found`)
      }
      const result: unknown = await method.apply(manager, sdkArgs)

      if (kind === 'list') {
        const columns = action.priorityColumns ?? resource.priorityColumns
        printList(
          rootOpts,
          await collectList(result as AsyncIterable<unknown>, localOpts.limit!),
          columns,
        )
        return
      }

      const data = serialize(result)
      if (rootOpts.json) {
        printJson(data)
        return
      }
      if (kind === 'write') {
        const template = action.successMessage ?? `{resource} '{id}': ${action.name} done`
        success(capitalize(fillTemplate(template, resource, id ?? (data.id as string | undefined))))
        hint('')
      }
      printDetail(data)
    })
  })
}

const verbRegistrars = {
  create: registerCreate,
  get: registerGet,
  list: registerList,
  update: registerUpdate,
  delete: registerDelete,
} satisfies Record<Verb, (parent: Command, resource: ResourceDef) => void>

export const registerResourceCommands = (program: Command, resourceDefs: ResourceDef[]) => {
  resourceDefs.forEach((resource) => {
    if (resource.verbs.includes('create') && !resource.createFlags?.length) {
      throw new Error(`Resource ${resource.name} has 'create' verb but no createFlags`)
    }

    const resourceCmd = program
      .command(resource.cliCommand)
      .description(resource.description ?? `Manage ${pluralName(resource)}`)
    if (toKebabCase(resource.cliCommand) !== resource.cliCommand) {
      resourceCmd.alias(toKebabCase(resource.cliCommand))
    }

    resourceCmd.configureHelp({ showGlobalOptions: true })

    resource.verbs.forEach((verb) => verbRegistrars[verb](resourceCmd, resource))
    resource.actions?.forEach((action) => registerAction(resourceCmd, resource, action))

    addDefaultAction(resourceCmd)
  })
}

type FlagSchema = {
  name: string
  type: FlagDef['type']
  required: boolean
  param: string
  in: 'path' | 'query' | 'body'
  description?: string
  deprecated?: string
}

type CommandSchema = {
  command: string
  aliases: string[]
  description: string
  kind: 'read' | 'list' | 'write'
  args: ArgDef[]
  flags: FlagSchema[]
  files: FileDef[]
  options: string[]
  confirm: boolean
}

const flagSchemas = (flags: FlagDef[], location: 'query' | 'body'): FlagSchema[] =>
  flags.map((f) => ({
    name: f.name,
    type: f.type,
    required: !!(f.required || f.pathParam),
    param: f.nestedPath ?? toSnakeCase(f.name),
    in: f.pathParam ? 'path' : location,
    ...(f.description ? { description: f.description } : {}),
    ...(f.deprecated ? { deprecated: f.deprecated } : {}),
  }))

const commandNames = (resource: ResourceDef, name: string) => {
  const command = `fintoc ${resourceCliPath(resource)} ${name}`
  const kebab = toKebabCase(command)
  return { command, aliases: kebab === command ? [] : [kebab] }
}

const verbSchema = (resource: ResourceDef, verb: Verb): CommandSchema => {
  const argName = resource.getArg?.name ?? 'id'
  const flags = {
    create: resource.createFlags,
    get: resource.getFlags,
    list: resource.listFlags,
    update: resource.updateFlags,
    delete: resource.deleteFlags,
  }[verb]
  const options = {
    create: [
      '--from-json',
      '--idempotency-key',
      ...(resource.needsJws ? ['--jws-private-key'] : []),
    ],
    get: [],
    list: ['--limit'],
    update: ['--from-json'],
    delete: ['--yes'],
  }[verb]
  return {
    ...commandNames(resource, verb),
    description: verbDescription(resource, verb),
    kind: verb === 'get' ? 'read' : verb === 'list' ? 'list' : 'write',
    args:
      verb === 'create' || verb === 'list'
        ? []
        : [
            {
              name: argName,
              ...(resource.getArg ? { description: resource.getArg.description } : {}),
            },
          ],
    flags: flagSchemas(flags ?? [], verb === 'create' || verb === 'update' ? 'body' : 'query'),
    files: verb === 'create' ? (resource.createFiles ?? []) : [],
    options,
    confirm: verb === 'delete',
  }
}

const actionSchema = (resource: ResourceDef, action: ActionDef): CommandSchema => {
  const kind = action.kind ?? 'write'
  return {
    ...commandNames(resource, action.name),
    description: action.description,
    kind,
    args: actionPositional(resource, action).positional,
    flags: flagSchemas(action.flags ?? [], kind === 'write' ? 'body' : 'query'),
    files: action.files ?? [],
    options: [
      ...(kind === 'list' ? ['--limit'] : []),
      ...(action.fromJson ? ['--from-json'] : []),
      ...(action.idempotencyKey ? ['--idempotency-key'] : []),
      ...(action.needsJws ? ['--jws-private-key'] : []),
      ...(action.confirm ? ['--yes'] : []),
    ],
    confirm: !!action.confirm,
  }
}

export const describeCommands = (resourceDefs: ResourceDef[]): CommandSchema[] =>
  resourceDefs.flatMap((resource) => [
    ...resource.verbs.map((verb) => verbSchema(resource, verb)),
    ...(resource.actions ?? []).map((action) => actionSchema(resource, action)),
  ])
