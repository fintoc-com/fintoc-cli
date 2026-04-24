import { Command } from 'commander'

import { configCommand } from './commands/config.js'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { registerResourceCommands } from './resources/factory.js'
import { resources } from './resources/registry.js'

declare const __CLI_VERSION__: string

const versionString = `fintoc/${__CLI_VERSION__} ${process.platform} node-${process.version}`

const program = new Command()

program
  .name('fintoc')
  .description('Fintoc CLI — manage your Fintoc resources from the terminal')
  .version(versionString, '-v, --version')
  .option('--api-key <key>', 'Override API key for this command')
  .option('--json', 'Output as JSON')

loginCommand(program)
logoutCommand(program)
configCommand(program)
registerResourceCommands(program, resources)

program.parse()
