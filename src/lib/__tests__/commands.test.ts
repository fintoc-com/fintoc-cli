import { Command, CommanderError } from 'commander'
import { describe, expect, test, vi } from 'vitest'
import { addDefaultAction } from '../commands.js'

const parseAndCatch = (cmd: Command, args: string[]) => {
  cmd.exitOverride()
  try {
    cmd.parse(args, { from: 'user' })
  } catch (err) {
    if (err instanceof CommanderError) {
      return err
    }
    throw err
  }
  return undefined
}

describe('addDefaultAction', () => {
  describe('when called without arguments', () => {
    test('shows help (exit 0)', () => {
      const cmd = new Command().name('test')
      cmd.command('list').action(() => {})
      addDefaultAction(cmd)

      const helpSpy = vi.spyOn(cmd, 'help').mockImplementation(() => {
        throw new CommanderError(0, 'commander.helpDisplayed', 'help')
      })

      const err = parseAndCatch(cmd, [])
      expect(err?.exitCode).toBe(0)
      expect(helpSpy).toHaveBeenCalled()
    })
  })

  describe('when called with an unknown subcommand', () => {
    test('reports error with exit 1', () => {
      const cmd = new Command().name('test')
      cmd.command('list').action(() => {})
      addDefaultAction(cmd)

      const errorSpy = vi.spyOn(cmd, 'error')
      errorSpy.mockImplementation((_msg, opts) => {
        throw new CommanderError(
          (opts as { exitCode?: number })?.exitCode ?? 1,
          'commander.unknownCommand',
          _msg,
        )
      })

      const err = parseAndCatch(cmd, ['bogus'])
      expect(err?.exitCode).toBe(1)
      expect(errorSpy).toHaveBeenCalledWith(
        "unknown command 'bogus'",
        expect.objectContaining({ exitCode: 1 }),
      )
    })
  })

  describe('when called with a valid subcommand', () => {
    test('executes the subcommand action', () => {
      const cmd = new Command().name('test')
      const actionFn = vi.fn()
      cmd.command('list').action(actionFn)
      addDefaultAction(cmd)

      parseAndCatch(cmd, ['list'])
      expect(actionFn).toHaveBeenCalled()
    })
  })
})
