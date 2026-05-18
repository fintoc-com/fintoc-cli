import type { Command } from 'commander'
import type { Serializable } from '../types.js'
import { InvalidArgumentError } from 'commander'
import { merge, set } from 'es-toolkit/compat'
import { createClient, resolveAuth } from '../lib/auth.js'
import { handleError } from '../lib/errors.js'
import { readJsonBody } from '../lib/json-body.js'
import { hint, printDetail, printJson, success } from '../lib/output.js'

type RootOpts = {
  apiKey?: string
  json?: boolean
}

type TriggerOpts = {
  override: Record<string, unknown>
  fromJson?: string
}

const tryJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

const collectOverride = (value: string, acc: Record<string, unknown>): Record<string, unknown> => {
  const eqIndex = value.indexOf('=')
  if (eqIndex === -1) {
    throw new InvalidArgumentError(
      `Expected --override <key=value>, got '${value}'. Example: --override amount=5000`,
    )
  }
  const key = value.slice(0, eqIndex)
  if (key.length === 0 || key.split('.').some((segment) => segment.length === 0)) {
    throw new InvalidArgumentError(
      `Invalid override key in '${value}'. Keys must be non-empty (use dot-notation, e.g. metadata.order_id).`,
    )
  }
  const rawValue = value.slice(eqIndex + 1)
  set(acc, key, tryJsonParse(rawValue))
  return acc
}

const isSerializable = (obj: unknown): obj is Serializable =>
  typeof obj === 'object' &&
  obj !== null &&
  'serialize' in obj &&
  typeof (obj as Serializable).serialize === 'function'

const serialize = (obj: unknown): Record<string, unknown> => {
  if (isSerializable(obj)) {
    return obj.serialize()
  }
  if (typeof obj === 'object' && obj !== null) {
    return { ...obj } as Record<string, unknown>
  }
  return {}
}

export const triggerCommand = (program: Command) => {
  const cmd = program
    .command('trigger')
    .description('Trigger a test event')
    .argument('<event-type>', 'Event type (e.g. payment_intent.succeeded)')
    .option(
      '--override <key=value>',
      'Override a field in the event payload (dot-notation, repeatable)',
      collectOverride,
      {} as Record<string, unknown>,
    )
    .option(
      '--from-json <path>',
      'Read overrides from a JSON file (use "-" for stdin). Combined with --override; flags take precedence',
    )
  cmd.configureHelp({ showGlobalOptions: true })

  cmd.action(async (eventType: string, opts: TriggerOpts, actionCmd: Command) => {
    const rootOpts = actionCmd.parent!.opts<RootOpts>()
    const base = opts.fromJson ? readJsonBody(opts.fromJson) : {}
    const overrides = merge({}, base, opts.override) as Record<string, unknown>

    try {
      const auth = resolveAuth(rootOpts)
      const client = createClient(auth.secretKey)
      const args: Parameters<typeof client.events.trigger>[0] = { type: eventType }
      if (Object.keys(overrides).length > 0) {
        args.overrides = overrides as typeof args.overrides
      }
      const result = await client.events.trigger(args)
      const data = serialize(result)

      if (rootOpts.json) {
        printJson(data)
      } else {
        success(`Event triggered: ${eventType}`)
        hint('')
        printDetail(data)
      }
    } catch (err) {
      handleError(err, { json: rootOpts.json })
    }
  })
}
