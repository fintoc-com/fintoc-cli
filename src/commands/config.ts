import type { Command } from 'commander'
import type { FintocConfig } from '../types.js'
import { maskKey, resolveAuth, whoami } from '../lib/auth.js'
import { CONFIG_PATH, readConfig, writeConfig } from '../lib/config.js'
import { error, log, success, warn } from '../lib/output.js'

const ALLOWED_KEYS: readonly string[] = [
  'secret_key',
  'jws_private_key',
  'color',
] satisfies readonly (keyof FintocConfig)[]

const isConfigKey = (key: string): key is keyof FintocConfig => ALLOWED_KEYS.includes(key)

export const configCommand = (program: Command) => {
  const configCmd = program
    .command('config')
    .description('Show or update CLI configuration')
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

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (allowed keys: secret_key, jws_private_key, color)')
    .action((key: string, value: string) => {
      if (!isConfigKey(key)) {
        error(`Unknown config key: '${key}'`)
        log('')
        log(`  Allowed keys: ${ALLOWED_KEYS.join(', ')}`)
        log(`  Example: fintoc config set jws_private_key /path/to/key.pem`)
        process.exit(1)
      }

      const config = readConfig()

      if (key === 'color') {
        if (value !== 'true' && value !== 'false') {
          error(`Invalid value for 'color': must be 'true' or 'false'`)
          process.exit(1)
        }
        config[key] = value === 'true'
      } else {
        config[key] = value
      }

      writeConfig(config)

      success(`Config updated: ${key}`)
      log(`  Saved to ${CONFIG_PATH}`)
    })
}
