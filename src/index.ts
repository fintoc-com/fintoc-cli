import type { Help } from 'commander'
import { Command } from 'commander'

import { configCommand } from './commands/config.js'
import { doctorCommand } from './commands/doctor.js'
import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { openCommand } from './commands/open.js'
import { registerResourceCommands } from './resources/factory.js'
import { v1Resources, v2Resources } from './resources/registry.js'

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
registerResourceCommands(program, v1Resources)

const v2Cmd = program.command('v2').description('API v2 resources')
registerResourceCommands(v2Cmd, v2Resources)

type HelpEntry = { name: () => string; description: () => string }

const formatGroup = (
  lines: string[],
  title: string,
  entries: readonly HelpEntry[],
  padWidth: number,
) => {
  if (entries.length === 0) {
    return
  }
  lines.push('')
  lines.push(`${title}:`)
  for (const entry of entries) {
    lines.push(`  ${entry.name().padEnd(padWidth)}${entry.description()}`)
  }
}

const formatOptions = (lines: string[], cmd: Command, helper: Help) => {
  lines.push('')
  lines.push('Flags:')
  const options = helper.visibleOptions(cmd)
  const optPadWidth = Math.max(...options.map((o) => helper.optionTerm(o).length), 0) + 2
  for (const opt of options) {
    lines.push(`  ${helper.optionTerm(opt).padEnd(optPadWidth)}${opt.description}`)
  }
}

program.configureHelp({
  formatHelp: (cmd: Command, helper: Help) => {
    const lines: string[] = []

    lines.push(cmd.description())
    lines.push('')
    lines.push(`Usage: ${cmd.name()} <command> [flags]`)

    const subcommands = cmd.commands

    const authEntries = subcommands.filter((c) => AUTH_COMMANDS.has(c.name()))
    const utilityEntries = subcommands.filter((c) => UTILITY_COMMANDS.has(c.name()))
    const v1ResourceEntries = subcommands.filter(
      (c) => !AUTH_COMMANDS.has(c.name()) && !UTILITY_COMMANDS.has(c.name()) && c.name() !== 'v2',
    )

    // Build v2 resource entries as "v2 <resource>" for display in help
    const v2Group = subcommands.find((c) => c.name() === 'v2')
    const v2ResourceEntries: HelpEntry[] = v2Group
      ? v2Group.commands.map((c) => ({
          name: () => `v2 ${c.name()}`,
          description: () => c.description(),
        }))
      : []

    const resourceEntries = [...v1ResourceEntries, ...v2ResourceEntries]
    const allEntries = [...authEntries, ...resourceEntries, ...utilityEntries]
    const padWidth = Math.max(...allEntries.map((e) => e.name().length), 0) + 2

    formatGroup(lines, 'Auth', authEntries, padWidth)
    formatGroup(lines, 'Resources', resourceEntries, padWidth)
    formatGroup(lines, 'Utilities', utilityEntries, padWidth)

    formatOptions(lines, cmd, helper)

    lines.push('')
    lines.push('Get started: fintoc login')
    lines.push('')

    return lines.join('\n')
  },
})

v2Cmd.configureHelp({
  formatHelp: (cmd: Command, helper: Help) => {
    const lines: string[] = []

    lines.push(cmd.description())
    lines.push('')
    lines.push(`Usage: fintoc v2 <resource> <action> [flags]`)

    const entries = cmd.commands
    const padWidth = Math.max(...entries.map((e) => e.name().length), 0) + 2

    formatGroup(lines, 'Resources', entries, padWidth)

    formatOptions(lines, cmd, helper)
    lines.push('')

    return lines.join('\n')
  },
})

program.parse()
