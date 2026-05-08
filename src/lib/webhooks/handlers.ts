import type { HandledRelayMessage, RelayMessageHandlers } from '../action-cable.js'
import * as z from 'zod/mini'
import { printJson } from '../output.js'

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
}

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

  if (!response.ok) {
    throw new Error(`Failed to forward webhook event: ${response.status} ${response.statusText}`)
  }
}

export const handleWebhookEvent: WebhookRelayHandler = async (message, options) => {
  const result = webhookEventMessageSchema.safeParse(message)
  if (!result.success) {
    throw new Error(`Invalid webhook event message: ${z.prettifyError(result.error)}`)
  }

  printJson(JSON.parse(result.data.event))

  if (options.forwardTo) {
    await forwardWebhookEvent(options.forwardTo, result.data)
  }
}

export const createWebhookRelayHandlers = (options: WebhookRelayOptions) => {
  return {
    webhook_event: (message) => handleWebhookEvent(message, options),
  } satisfies RelayMessageHandlers
}
