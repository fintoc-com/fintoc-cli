import type { Command } from 'commander'
import type { AuthSource } from '../lib/auth.js'
import type { FintocConfig } from '../types.js'
import { maskKey, resolveAuth, whoami } from '../lib/auth.js'
import { CONFIG_PATH, readConfig, writeConfig } from '../lib/config.js'
import { handleError, UsageError } from '../lib/errors.js'
import { hint, log, printJson, success, warn } from '../lib/output.js'

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
    .helpCommand(false)
  configCmd.configureHelp({ showGlobalOptions: true })

  configCmd
    .command('show', { isDefault: true })
    .description('Show current configuration')
    .action(async (_opts: unknown, cmd: Command) => {
      let secretKey: string
      let source: AuthSource
      let keyName: string | null = null
      let expiresAt: string | null = null

      const sourceLabels = {
        flag: 'inline flag (--api-key)',
        env: 'env var (FINTOC_API_KEY)',
        config: 'config file',
      } satisfies Record<AuthSource, string>

      const rootOpts = cmd.optsWithGlobals<{ apiKey?: string; json?: boolean }>()

      try {
        const auth = resolveAuth(rootOpts)
        secretKey = auth.secretKey
        source = auth.source
        keyName = auth.keyName ?? null
        expiresAt = auth.expiresAt ?? null
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
          key_name: keyName,
          expires_at: expiresAt,
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
      if (keyName) {
        log(`  Key name:      ${keyName}`)
      }
      if (expiresAt) {
        log(`  Expires at:    ${expiresAt}`)
      }
      log(`  API version:   ${apiVersion ?? '-'}`)
      log(`  Config path:   ${CONFIG_PATH}`)
      log(`  Source:        ${sourceLabels[source]}`)
    })

  configCmd
    .command('set <key> <value>')
    .description('Set a config value (secret_key, jws_private_key, color)')
    .action((key: string, value: string, _opts: unknown, cmd: Command) => {
      const { json } = cmd.optsWithGlobals<{ json?: boolean }>()
      try {
        if (!isConfigKey(key)) {
          throw new UsageError(`Unknown config key '${key}'`, {
            code: 'invalid_value',
            param: 'key',
            hints: [
              `Allowed keys: ${ALLOWED_KEYS.join(', ')}`,
              'Example: fintoc config set jws_private_key /path/to/key.pem',
            ],
          })
        }

        const config = readConfig()

        if (key === 'color') {
          if (value !== 'true' && value !== 'false') {
            throw new UsageError(`Invalid value '${value}' for 'color': expected true or false`, {
              code: 'invalid_value',
              param: 'value',
            })
          }
          config[key] = value === 'true'
        } else {
          config[key] = value
        }

        writeConfig(config)
      } catch (err) {
        handleError(err, { json })
      }

      if (json) {
        printJson({ updated: key, config_path: CONFIG_PATH })
        return
      }
      success(`Config updated: ${key}`)
      hint(`  Saved to ${CONFIG_PATH}`)
    })
}
