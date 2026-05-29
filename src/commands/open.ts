import type { Command } from 'commander'
import { openInBrowser } from '../lib/browser.js'
import { addDefaultAction } from '../lib/commands.js'
import { DASHBOARD_URL } from '../lib/constants.js'
import { hint, success } from '../lib/output.js'

export const openCommand = (program: Command) => {
  const open = program.command('open').description('Open Fintoc resources in the browser')
  open.configureHelp({ showGlobalOptions: true })

  open
    .command('dashboard')
    .description('Open the Fintoc dashboard')
    .action(async () => {
      try {
        await openInBrowser(DASHBOARD_URL)
        success(`Opening ${DASHBOARD_URL} in your browser...`)
      } catch {
        hint(`Could not open browser automatically. Visit: ${DASHBOARD_URL}`)
      }
    })

  addDefaultAction(open)
}
