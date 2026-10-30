import type { Command } from 'commander'
import { printJson, printTable } from '../lib/output.js'
import { describeCommands } from '../resources/factory.js'
import { resources } from '../resources/registry.js'

export const commandsCommand = (program: Command) => {
  program
    .command('commands')
    .description('List resource commands (with --json: arguments, flags and API parameters)')
    .configureHelp({ showGlobalOptions: true })
    .action((_opts: unknown, actionCmd: Command) => {
      const commands = describeCommands(resources)
      if (actionCmd.parent!.opts<{ json?: boolean }>().json) {
        printJson(commands)
        return
      }
      printTable({
        columns: ['command', 'description'],
        rows: commands.map(({ command, description }) => ({ command, description })),
      })
    })
}
