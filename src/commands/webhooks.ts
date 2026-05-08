import type { Command } from 'commander'
import { listenToRelay } from '../lib/action-cable.js'
import { resolveAuth } from '../lib/auth.js'
import { addDefaultAction } from '../lib/commands.js'
import { handleError } from '../lib/errors.js'
import { hint, info } from '../lib/output.js'
import { createWebhookRelayHandlers } from '../lib/webhooks/handlers.js'
import { createCliSession } from '../lib/webhooks/sessions.js'

type RootOpts = {
  apiKey?: string
  json?: boolean
}

export const webhooksCommand = (program: Command) => {
  const cmd = program.command('webhooks').description('Listen for webhook events')
  cmd.configureHelp({ showGlobalOptions: true })
  addDefaultAction(cmd)

  cmd
    .command('listen')
    .description('Listen for webhook events in real time')
    .action(async (_opts: unknown, actionCmd: Command) => {
      const rootOpts = actionCmd.parent!.parent!.opts<RootOpts>()
      const auth = resolveAuth(rootOpts)

      const shutdown = () => {
        process.exit(0)
      }

      process.once('SIGINT', shutdown)
      process.once('SIGTERM', shutdown)

      let caughtError: unknown
      try {
        const session = await createCliSession({
          secretKey: auth.secretKey,
          streamType: 'webhook_event',
        })

        if (!rootOpts.json) {
          const whsMessage = session.webhook_secret
            ? ` Your webhook signing secret is ${session.webhook_secret}`
            : ''

          info(`Listening for webhooks.${whsMessage}`)
          info('Press Ctrl+C to stop.')

          hint('')
        }

        await listenToRelay({
          websocketUrl: session.websocket_url,
          sessionId: session.id,
          secret: session.secret,
          handlers: createWebhookRelayHandlers({ json: rootOpts.json }),
        })
      } catch (err) {
        caughtError = err
      } finally {
        process.off('SIGINT', shutdown)
        process.off('SIGTERM', shutdown)
      }

      if (caughtError) {
        handleError(caughtError, { json: rootOpts.json })
      }
    })
}
