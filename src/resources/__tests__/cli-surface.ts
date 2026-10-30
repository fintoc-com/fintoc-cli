import type { ResourceDef } from '../../types.js'
import { describeCommands } from '../factory.js'

export type CommandSurface = {
  args: string[]
  flags: Record<string, { type: string; required: boolean }>
  options: string[]
  confirm: boolean
}

export type Surface = Record<string, CommandSurface>

export const cliSurface = (resources: ResourceDef[]): Surface =>
  Object.fromEntries(
    describeCommands(resources).map((c) => [
      c.command.replace(/^fintoc /, ''),
      {
        args: c.args.map((a) => a.name),
        flags: Object.fromEntries(
          c.flags.map((f) => [f.name, { type: f.type, required: f.required }]),
        ),
        options: c.options,
        confirm: c.confirm,
      },
    ]),
  )

// Adds new commands, flags and options without dropping or changing anything already published
export const mergeSurface = (published: Surface, current: Surface): Surface => {
  const merged: Surface = { ...published }
  for (const [command, now] of Object.entries(current)) {
    const before = published[command]
    merged[command] = before
      ? {
          ...before,
          flags: { ...now.flags, ...before.flags },
          options: [...new Set([...before.options, ...now.options])],
        }
      : now
  }
  return merged
}
