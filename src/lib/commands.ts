import type { Command } from 'commander'

export const addDefaultAction = (cmd: Command) => {
  cmd.allowExcessArguments(true).action((_opts: unknown, actionCmd: Command) => {
    const args = actionCmd.args as string[]
    if (args.length > 0) {
      cmd.error(`unknown command '${args[0]}'`, { exitCode: 1, code: 'commander.unknownCommand' })
    }
    cmd.help()
  })
}
