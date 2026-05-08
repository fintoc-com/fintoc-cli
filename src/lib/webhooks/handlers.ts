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
  options: { json?: boolean },
) => void | Promise<void>

export const handleWebhookEvent: WebhookRelayHandler = (message, _options) => {
  const result = webhookEventMessageSchema.safeParse(message)
  if (!result.success) {
    throw new Error(`Invalid webhook event message: ${z.prettifyError(result.error)}`)
  }

  printJson(JSON.parse(result.data.event))
}

export const createWebhookRelayHandlers = (options: { json?: boolean }) => {
  return {
    webhook_event: (message) => handleWebhookEvent(message, options),
  } satisfies RelayMessageHandlers
}
