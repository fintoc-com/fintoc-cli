import type { Command } from 'commander'

import { password } from '@inquirer/prompts'

import { whoami } from '../lib/auth.js'
import { CONFIG_PATH, readConfig, writeConfig } from '../lib/config.js'
import { handleError } from '../lib/errors.js'
import { error, hint, success } from '../lib/output.js'

export const loginCommand = (program: Command) => {
  const cmd = program.command('login').description('Authenticate with your Fintoc API key')
  cmd.configureHelp({ showGlobalOptions: true })
  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    let secretKey: string

    const rootApiKey = actionCmd.parent?.opts().apiKey as string | undefined
    if (rootApiKey) {
      secretKey = rootApiKey
    } else if (process.stdin.isTTY) {
      secretKey = await password({ message: 'Enter your Fintoc secret key:' })
    } else {
      error('Non-interactive terminal detected. Pass the key via flag:')
      hint('')
      hint('  fintoc login --api-key sk_test_...')
      process.exit(1)
    }

    if (!secretKey) {
      error('No key provided')
      process.exit(1)
    }

    try {
      const info = await whoami(secretKey)

      try {
        writeConfig({ ...readConfig(), secret_key: secretKey })
      } catch {
        error(`Key is valid but could not write to ${CONFIG_PATH}`)
        process.exit(1)
      }

      success(`Authenticated as ${info.organizationName} (${info.mode} mode)`)
      hint(`  Key stored in ${CONFIG_PATH}`)
    } catch (err) {
      handleError(err)
    }
  })
}
