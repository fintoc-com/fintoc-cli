import type { Command } from 'commander'
import { exec } from 'node:child_process'

import { DASHBOARD_URL } from '../lib/constants.js'
import { error, success } from '../lib/output.js'

const openInBrowser = (url: string): Promise<void> => {
  const commands: Record<string, string> = {
    darwin: `open "${url}"`,
    linux: `xdg-open "${url}"`,
    win32: `start "" "${url}"`,
  }

  const cmd = commands[process.platform]
  if (!cmd) {
    error(`Unsupported platform: ${process.platform}`)
    process.exitCode = 1
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    exec(cmd, (err) => {
      if (err) {
        error(`Failed to open browser: ${err.message}`)
      } else {
        success(`Opening ${url} in your browser...`)
      }
      resolve()
    })
  })
}

export const openCommand = (program: Command) => {
  const open = program.command('open').description('Open Fintoc resources in the browser')

  open
    .command('dashboard')
    .description('Open the Fintoc dashboard')
    .action(async () => {
      await openInBrowser(DASHBOARD_URL)
    })
}
