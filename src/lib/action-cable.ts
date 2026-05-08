import WebSocket from 'ws'
import * as z from 'zod/mini'

const relayMessageSchema = z.looseObject({
  type: z.string(),
})

const actionCableMessageSchema = z.object({
  type: z.optional(z.string()),
  message: z.optional(relayMessageSchema),
})

export type RelayMessage = z.infer<typeof relayMessageSchema>
export type ActionCableMessage = z.infer<typeof actionCableMessageSchema>

export const handledMessageTypes = ['webhook_event'] as const
export type HandledMessageType = (typeof handledMessageTypes)[number]

export type HandledRelayMessage<T extends HandledMessageType = HandledMessageType> = Omit<
  RelayMessage,
  'type'
> &
  Record<string, unknown> & { type: T }

export type RelayMessageHandler<T extends HandledMessageType = HandledMessageType> = (
  message: HandledRelayMessage<T>,
) => void | Promise<void>

export type RelayMessageHandlers = {
  [T in HandledMessageType]?: RelayMessageHandler<T>
}

type ListenOptions = {
  websocketUrl: string
  sessionId: string
  secret: string
  handlers: RelayMessageHandlers
}

export const originForWebSocketUrl = (websocketUrl: string) => {
  const url = new URL(websocketUrl)
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:'
  url.pathname = ''
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export const createSubscriptionIdentifier = (sessionId: string, secret: string) =>
  JSON.stringify({
    channel: 'CliSessionsChannel',
    session_id: sessionId,
    secret,
  })

export const createSubscribeCommand = (sessionId: string, secret: string) =>
  JSON.stringify({
    command: 'subscribe',
    identifier: createSubscriptionIdentifier(sessionId, secret),
  })

export const parseActionCableMessage = (
  data: WebSocket.RawData,
): ActionCableMessage | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(data.toString())
  } catch {
    return undefined
  }

  const result = actionCableMessageSchema.safeParse(parsed)
  return result.success ? result.data : undefined
}

const messageCanBeHandled = (message: RelayMessage): message is HandledRelayMessage => {
  return handledMessageTypes.includes(message.type as HandledMessageType)
}

const handleRelayMessage = (message: RelayMessage, handlers: RelayMessageHandlers) => {
  if (!messageCanBeHandled(message)) {
    return undefined
  }

  const handler = handlers[message.type]
  return handler?.(message)
}

export const listenToRelay = ({ websocketUrl, sessionId, secret, handlers }: ListenOptions) => {
  return new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(websocketUrl, {
      headers: {
        Origin: originForWebSocketUrl(websocketUrl),
      },
    })
    let closed = false

    const finish = (err?: Error) => {
      if (closed) {
        return
      }
      closed = true
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    }

    ws.on('open', () => {
      ws.send(createSubscribeCommand(sessionId, secret))
    })

    ws.on('message', (data) => {
      const payload = parseActionCableMessage(data)
      if (!payload) {
        return
      }

      if (payload.type === 'reject_subscription') {
        finish(new Error('Relay listener subscription was rejected'))
        return
      }
      if (payload.type) {
        return
      }
      if (!payload.message) {
        return
      }

      Promise.resolve(handleRelayMessage(payload.message, handlers)).catch(finish)
    })

    ws.on('error', (err) => {
      finish(err instanceof Error ? err : new Error('WebSocket connection failed'))
    })

    ws.on('close', () => {
      finish()
    })
  })
}
