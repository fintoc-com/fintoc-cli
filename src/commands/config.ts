import type { Command } from 'commander'

import { maskKey, resolveAuth, whoami } from '../lib/auth.js'
import { CONFIG_PATH } from '../lib/config.js'
import { log, warn } from '../lib/output.js'

export const configCommand = (program: Command) => {
  program
    .command('config')
    .description('Show current configuration')
    .action(async (_opts: unknown, cmd: Command) => {
      let secretKey: string
      let source: string

      const sourceLabels = {
        flag: 'inline flag (--api-key)',
        env: 'env var (FINTOC_SECRET_KEY)',
        config: 'config file',
      } satisfies Record<string, string>

      const rootOpts = cmd.parent!.opts<{ apiKey?: string }>()

      try {
        const auth = resolveAuth(rootOpts)
        secretKey = auth.secretKey
        source = sourceLabels[auth.source]
      } catch {
        log('Not authenticated. Run `fintoc login` to get started.')
        log('')
        log(`  Config path:  ${CONFIG_PATH}`)
        return
      }

      let orgName = '(unknown)'
      let mode = '(unknown)'
      let apiVersion = '(unknown)'

      try {
        const info = await whoami(secretKey)
        orgName = info.organizationName
        mode = info.mode
        apiVersion = info.apiVersion
      } catch {
        warn('Unable to reach Fintoc API — showing cached config')
      }

      log(`  Organization:  ${orgName}`)
      log(`  Mode:          ${mode}`)
      log(`  Secret key:    ${maskKey(secretKey)}`)
      log(`  API version:   ${apiVersion}`)
      log(`  Config path:   ${CONFIG_PATH}`)
      log(`  Source:        ${source}`)
    })
}
