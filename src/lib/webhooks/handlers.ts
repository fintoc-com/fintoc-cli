import type { HandledRelayMessage, RelayMessageHandlers } from '../action-cable.js'
import * as z from 'zod/mini'
import { bold, dim, green, log, printJson, red, yellow } from '../output.js'

const webhookEventMessageSchema = z.object({
  type: z.literal('webhook_event'),
  event: z.string(),
  signature: z.string(),
  event_type: z.string(),
  timestamp: z.int(),
})

export type WebhookRelayHandler = (
  message: HandledRelayMessage<'webhook_event'>,
  options: WebhookRelayOptions,
) => void | Promise<void>

type WebhookRelayOptions = {
  json?: boolean
  forwardTo?: string
  events?: string[]
}

const reformatDate = (isoDate: string) => isoDate.replace('T', ' ').slice(0, 19)

const forwardWebhookEvent = async (
  url: string,
  data: z.infer<typeof webhookEventMessageSchema>,
) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Fintoc-Signature': data.signature,
    },
    body: data.event,
  })

  return {
    statusCode: response.status,
    timestamp: new Date().toISOString(),
  }
}

const WebhookEventSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  created_at: z.string(),
})

type WebhookEvent = z.infer<typeof WebhookEventSchema>

const parseWebhookEvent = (event: string) => {
  const eventResult = WebhookEventSchema.safeParse(JSON.parse(event))

  return eventResult.success ? eventResult.data : undefined
}

const displayWebhookEvent = (event: WebhookEvent, options: { json: boolean | undefined }) => {
  if (options.json) {
    printJson(event)
    log('\n')
    return
  }

  log(`${dim(reformatDate(event.created_at))}  -->  ${bold(event.type)} [${event.id}]`)
}

const colorStatusCode = (statusCode: number) => {
  if (statusCode >= 200 && statusCode < 300) {
    return green(String(statusCode))
  }
  if (statusCode >= 400) {
    return red(String(statusCode))
  }
  return yellow(String(statusCode))
}

const displayForwardResult = (
  result: {
    timestamp: string
    statusCode: number
    method: string
    url: string
    event: string
  },
  options: { json: boolean | undefined },
) => {
  const timestamp = dim(reformatDate(result.timestamp))
  const code = bold(colorStatusCode(result.statusCode))

  log(`${timestamp}  <--  [${code}] ${result.method} ${result.url} [${result.event}]`)

  if (options.json) {
    log('\n')
  }
}

export const handleWebhookEvent: WebhookRelayHandler = async (message, options) => {
  const result = webhookEventMessageSchema.safeParse(message)
  if (!result.success) {
    throw new Error(`Invalid webhook event message: ${z.prettifyError(result.error)}`)
  }

  const parsed = parseWebhookEvent(result.data.event)

  if (!parsed || (options.events && !options.events.includes(parsed.type))) {
    return
  }

  displayWebhookEvent(parsed, { json: options.json })

  if (options.forwardTo) {
    const { statusCode, timestamp } = await forwardWebhookEvent(options.forwardTo, result.data)
    displayForwardResult(
      {
        timestamp,
        statusCode,
        method: 'POST',
        url: options.forwardTo,
        event: parsed.id,
      },
      { json: options.json },
    )
  }
}

export const createWebhookRelayHandlers = (options: WebhookRelayOptions) => {
  return {
    webhook_event: (message) => handleWebhookEvent(message, options),
  } satisfies RelayMessageHandlers
}
