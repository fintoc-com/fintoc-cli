import type { Command } from 'commander'
import { openInBrowser } from '../lib/browser.js'
import { addDefaultAction } from '../lib/commands.js'
import { DASHBOARD_URL } from '../lib/constants.js'
import { hint, printJson, success } from '../lib/output.js'

export const openCommand = (program: Command) => {
  const open = program.command('open').description('Open Fintoc resources in the browser')
  open.configureHelp({ showGlobalOptions: true })

  open
    .command('dashboard')
    .description('Open the Fintoc dashboard')
    .action(async (_opts: unknown, actionCmd: Command) => {
      const { json } = actionCmd.optsWithGlobals<{ json?: boolean }>()
      let opened = true
      try {
        await openInBrowser(DASHBOARD_URL)
      } catch {
        opened = false
      }
      if (json) {
        printJson({ url: DASHBOARD_URL, opened })
      } else if (opened) {
        success(`Opening ${DASHBOARD_URL} in your browser...`)
      } else {
        hint(`Could not open browser automatically. Visit: ${DASHBOARD_URL}`)
      }
    })

  addDefaultAction(open)
}
