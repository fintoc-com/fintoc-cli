import type { Command } from 'commander'

import { clearConfig, CONFIG_PATH } from '../lib/config.js'
import { success } from '../lib/output.js'

export const logoutCommand = (program: Command): void => {
  program
    .command('logout')
    .description('Remove stored credentials')
    .action(() => {
      clearConfig()
      success(`Credentials removed from ${CONFIG_PATH}`)
    })
}
