import type { Command } from 'commander'
import { clearConfig, CONFIG_PATH } from '../lib/config.js'
import { printJson, success } from '../lib/output.js'

export const logoutCommand = (program: Command) => {
  const cmd = program.command('logout').description('Remove stored credentials')
  cmd.configureHelp({ showGlobalOptions: true })
  cmd.action((_opts: unknown, actionCmd: Command) => {
    clearConfig()
    if (actionCmd.parent!.opts<{ json?: boolean }>().json) {
      printJson({ logged_out: true, config_path: CONFIG_PATH })
      return
    }
    success(`Credentials removed from ${CONFIG_PATH}`)
  })
}
