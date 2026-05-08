import * as z from 'zod/mini'
import { apiRequest } from '../api.js'

type CreateOptions = {
  secretKey: string
  streamType: 'webhook_event'
}

const nonEmptyString = z.string().check(z.minLength(1))

const websocketUrl = z.stringFormat('websocket_url', (value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'ws:' || url.protocol === 'wss:'
  } catch {
    return false
  }
})

const cliSessionSchema = z.object({
  id: nonEmptyString,
  websocket_id: nonEmptyString,
  websocket_url: websocketUrl,
  secret: nonEmptyString,
  webhook_secret: z.optional(nonEmptyString),
})

export type CliSession = z.infer<typeof cliSessionSchema>

export const createCliSession = async (options: CreateOptions): Promise<CliSession> => {
  const response = await apiRequest('/internal/v1/cli/sessions', {
    method: 'POST',
    secretKey: options.secretKey,
    body: {
      stream_type: options.streamType,
    },
  })

  const result = cliSessionSchema.safeParse(response)
  if (!result.success) {
    throw new Error(`Invalid CLI session response: ${z.prettifyError(result.error)}`)
  }

  return result.data
}
