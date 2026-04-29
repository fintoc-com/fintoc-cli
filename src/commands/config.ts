import type { Command } from 'commander'
import type { FintocConfig } from '../types.js'
import { maskKey, resolveAuth, whoami } from '../lib/auth.js'
import { CONFIG_PATH, readConfig, writeConfig } from '../lib/config.js'
import { error, hint, log, printJson, success, warn } from '../lib/output.js'

const ALLOWED_KEYS: readonly string[] = [
  'secret_key',
  'jws_private_key',
  'color',
] satisfies readonly (keyof FintocConfig)[]

const isConfigKey = (key: string): key is keyof FintocConfig => ALLOWED_KEYS.includes(key)

export const configCommand = (program: Command) => {
  const configCmd = program.command('config').description('Show or update CLI configuration')
  configCmd.configureHelp({ showGlobalOptions: true })

  configCmd
    .command('show', { isDefault: true })
    .description('Show current configuration')
    .action(async (_opts: unknown, cmd: Command) => {
      let secretKey: string
      let source: 'flag' | 'env' | 'config'

      const sourceLabels = {
        flag: 'inline flag (--api-key)',
        env: 'env var (FINTOC_SECRET_KEY)',
        config: 'config file',
      } satisfies Record<string, string>

      const rootOpts = cmd.optsWithGlobals<{ apiKey?: string; json?: boolean }>()

      try {
        const auth = resolveAuth(rootOpts)
        secretKey = auth.secretKey
        source = auth.source
      } catch {
        if (rootOpts.json) {
          printJson({ authenticated: false, config_path: CONFIG_PATH })
          return
        }
        hint('Not authenticated. Run `fintoc login` to get started.')
        hint('')
        hint(`  Config path:  ${CONFIG_PATH}`)
        return
      }

      let orgName: string | null = null
      let mode: string | null = null
      let apiVersion: string | null = null
      let apiReachable = true

      try {
        const info = await whoami(secretKey)
        orgName = info.organizationName
        mode = info.mode
        apiVersion = info.apiVersion
      } catch {
        apiReachable = false
        if (!rootOpts.json) {
          warn('Unable to reach Fintoc API — showing cached config')
        }
      }

      if (rootOpts.json) {
        printJson({
          authenticated: true,
          organization: orgName,
          mode,
          secret_key: maskKey(secretKey),
          api_version: apiVersion,
          config_path: CONFIG_PATH,
          source,
          api_reachable: apiReachable,
        })
        return
      }

      log(`  Organization:  ${orgName ?? '-'}`)
      log(`  Mode:          ${mode ?? '-'}`)
      log(`  Secret key:    ${maskKey(secretKey)}`)
      log(`  API version:   ${apiVersion ?? '-'}`)
      log(`  Config path:   ${CONFIG_PATH}`)
      log(`  Source:        ${sourceLabels[source]}`)
    })

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (allowed keys: secret_key, jws_private_key, color)')
    .action((key: string, value: string) => {
      if (!isConfigKey(key)) {
        error(`Unknown config key: '${key}'`)
        hint('')
        hint(`  Allowed keys: ${ALLOWED_KEYS.join(', ')}`)
        hint(`  Example: fintoc config set jws_private_key /path/to/key.pem`)
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
      hint(`  Saved to ${CONFIG_PATH}`)
    })
}
