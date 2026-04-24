import type { Help } from 'commander'
import { Command } from 'commander'

import { configCommand } from './commands/config.js'
import { doctorCommand } from './commands/doctor.js'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { openCommand } from './commands/open.js'
import { registerResourceCommands } from './resources/factory.js'
import { resources } from './resources/registry.js'

declare const __CLI_VERSION__: string

const versionString = `fintoc/${__CLI_VERSION__} ${process.platform} node-${process.version}`

const AUTH_COMMANDS = new Set(['login', 'logout', 'config'])
const UTILITY_COMMANDS = new Set(['doctor', 'open'])

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
doctorCommand(program)
openCommand(program)
registerResourceCommands(program, resources)

program.configureHelp({
  formatHelp: (cmd: Command, helper: Help) => {
    const lines: string[] = []

    lines.push(cmd.description())
    lines.push('')
    lines.push(`Usage: ${cmd.name()} <command> [flags]`)

    const subcommands = cmd.commands
    const padWidth = Math.max(...subcommands.map((c) => c.name().length), 0) + 2

    const formatGroup = (title: string, cmds: Command[]) => {
      if (cmds.length === 0) {
        return
      }
      lines.push('')
      lines.push(`${title}:`)
      for (const c of cmds) {
        lines.push(`  ${c.name().padEnd(padWidth)}${c.description()}`)
      }
    }

    const authCmds = subcommands.filter((c) => AUTH_COMMANDS.has(c.name()))
    const utilityCmds = subcommands.filter((c) => UTILITY_COMMANDS.has(c.name()))
    const resourceCmds = subcommands.filter(
      (c) => !AUTH_COMMANDS.has(c.name()) && !UTILITY_COMMANDS.has(c.name()),
    )

    formatGroup('Auth', authCmds)
    formatGroup('Resources', resourceCmds)
    formatGroup('Utilities', utilityCmds)

    lines.push('')
    lines.push('Flags:')
    const options = helper.visibleOptions(cmd)
    const optPadWidth = Math.max(...options.map((o) => helper.optionTerm(o).length), 0) + 2
    for (const opt of options) {
      lines.push(`  ${helper.optionTerm(opt).padEnd(optPadWidth)}${opt.description}`)
    }

    lines.push('')
    lines.push('Get started: fintoc login')
    lines.push('')

    return lines.join('\n')
  },
})

program.parse()
