import type { Command } from 'commander'
import type { CommandSchema } from '../resources/factory.js'
import { printJson, printTable } from '../lib/output.js'
import { describeCommands } from '../resources/factory.js'
import { resources, v1Resources } from '../resources/registry.js'

const RESOURCE_COMMANDS = new Set(['v2', ...v1Resources.map((r) => r.cliCommand)])

const describeUtility = (cmd: Command, path: string[]): CommandSchema[] => {
  const fullPath = [...path, cmd.name()]
  if (cmd.commands.length > 0) {
    return cmd.commands.flatMap((sub) => describeUtility(sub, fullPath))
  }
  const options = cmd.options.flatMap((o) => (o.hidden || !o.long ? [] : [o.long]))
  return [
    {
      command: `fintoc ${fullPath.join(' ')}`,
      aliases: [],
      description: cmd.description(),
      kind: 'utility',
      args: cmd.registeredArguments.map((a) => ({
        name: a.name(),
        ...(a.description ? { description: a.description } : {}),
      })),
      flags: [],
      files: [],
      jsonFields: [],
      options,
      confirm: options.includes('--yes'),
    },
  ]
}

const describeOptions = (cmd: Command): object[] => [
  ...cmd.options
    .filter((option) => !option.hidden)
    .map((option) => ({
      name: option.long ?? option.short,
      flags: option.flags,
      description: option.description,
      argument: option.required ? 'required' : option.optional ? 'optional' : 'none',
      ...(option.argChoices ? { choices: option.argChoices } : {}),
      ...(option.defaultValue !== undefined ? { default: option.defaultValue } : {}),
    })),
  ...(cmd.parent ? describeOptions(cmd.parent) : []),
]

export const commandsCommand = (program: Command) => {
  program
    .command('commands')
    .description('List all commands (with --json: arguments, flags and API parameters)')
    .configureHelp({ showGlobalOptions: true })
    .action((_opts: unknown, actionCmd: Command) => {
      const root = actionCmd.parent!
      const commands = [
        ...root.commands
          .filter((c) => !RESOURCE_COMMANDS.has(c.name()))
          .flatMap((c) => describeUtility(c, [])),
        ...describeCommands(resources),
      ]
      if (root.opts<{ json?: boolean }>().json) {
        printJson(
          commands.map((command) => {
            const cmd = command.command
              .split(' ')
              .slice(1)
              .reduce(
                (parent, name) => parent.commands.find((child) => child.name() === name)!,
                root,
              )
            return { ...command, optionDetails: describeOptions(cmd) }
          }),
        )
        return
      }
      printTable({
        columns: ['command', 'description'],
        rows: commands.map(({ command, description }) => ({ command, description })),
      })
    })
}
