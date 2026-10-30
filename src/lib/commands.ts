import type { Command } from 'commander'

const editDistance = (a: string, b: string) => {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

export const suggestCommand = (cmd: Command, name: string) => {
  const candidates = cmd.commands.flatMap((c) => [c.name(), ...c.aliases()])
  const scored = candidates
    .map((candidate) => ({ candidate, distance: editDistance(name, candidate) }))
    .filter(({ candidate, distance }) => distance <= Math.max(2, Math.floor(candidate.length / 3)))
    .sort((a, b) => a.distance - b.distance)
  return scored[0]?.candidate
}

export const addDefaultAction = (cmd: Command) => {
  cmd.allowExcessArguments(true).action((_opts: unknown, actionCmd: Command) => {
    const args = actionCmd.args as string[]
    if (args.length > 0) {
      const suggestion = suggestCommand(cmd, args[0])
      const message = `unknown command '${args[0]}'${suggestion ? `\n(Did you mean ${suggestion}?)` : ''}`
      cmd.error(message, { exitCode: 1, code: 'commander.unknownCommand' })
    }
    const path: string[] = []
    let root = cmd
    while (root.parent) {
      path.unshift(root.name())
      root = root.parent
    }
    if (root.opts<{ json?: boolean }>().json) {
      const usage = ['fintoc', ...path, '--help'].join(' ')
      cmd.error(`missing command. Run '${usage}' to see the available commands`, {
        exitCode: 1,
        code: 'commander.missingCommand',
      })
    }
    cmd.help()
  })
}
