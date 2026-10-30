import type { Command } from 'commander'

import type { BrowserLoginResult, BrowserLoginSession } from '../lib/browser-login.js'
import type { FintocConfig, FintocMode } from '../types.js'

import { confirm, password } from '@inquirer/prompts'
import { Option } from 'commander'

import { whoami } from '../lib/auth.js'
import { BrowserLoginError, startBrowserLogin } from '../lib/browser-login.js'
import { CONFIG_PATH, readConfig, writeConfig } from '../lib/config.js'
import { BROWSER_LOGIN_TIMEOUT_MS } from '../lib/constants.js'
import { handleError, UsageError } from '../lib/errors.js'
import { error, hint, info, printJson, success, warn } from '../lib/output.js'

type LoginOpts = { mode: FintocMode; yes?: boolean }
type RootOpts = { apiKey?: string; json?: boolean }

const modeFromSecret = (secret: string): FintocMode | null => {
  if (secret.startsWith('sk_live_')) {
    return 'live'
  }
  if (secret.startsWith('sk_test_')) {
    return 'test'
  }
  return null
}

const isPromptCancelled = (err: unknown): boolean =>
  err instanceof Error && err.name === 'ExitPromptError'

const persistAndAnnounce = (
  existingConfig: FintocConfig,
  outcome: BrowserLoginResult,
  json?: boolean,
) => {
  const next: FintocConfig = {
    ...existingConfig,
    secret_key: outcome.secret,
    key_name: outcome.keyName,
    expires_at: outcome.expiresAt,
  }

  try {
    writeConfig(next)
  } catch {
    throw new Error(`Authentication succeeded but could not write to ${CONFIG_PATH}`)
  }

  if (json) {
    printJson({
      authenticated: true,
      organization: outcome.organizationName,
      mode: outcome.mode,
      key_name: outcome.keyName ?? null,
      config_path: CONFIG_PATH,
    })
    return
  }

  success(`Authenticated as ${outcome.organizationName} (${outcome.mode} mode)`)
  hint(
    outcome.keyName
      ? `  Key '${outcome.keyName}' stored in ${CONFIG_PATH}`
      : `  Key stored in ${CONFIG_PATH}`,
  )

  const isRelogin = !!existingConfig.secret_key
  if (isRelogin && existingConfig.jws_private_key) {
    warn(`  jws_private_key is still set but may not apply to this org/mode`)
    hint(`  Update it with: fintoc config set jws_private_key <path>`)
  }
}

const saveSecret = async (existingConfig: FintocConfig, secretKey: string, json?: boolean) => {
  if (!modeFromSecret(secretKey)) {
    throw new UsageError(`Invalid key format: expected 'sk_test_...' or 'sk_live_...'`, {
      code: 'invalid_value',
      param: 'api-key',
    })
  }
  const { organizationName, mode } = await whoami(secretKey)
  persistAndAnnounce(existingConfig, { secret: secretKey, organizationName, mode }, json)
}

type ConfirmReloginOpts = { config: FintocConfig; skipPrompt: boolean }

const confirmRelogin = async ({ config, skipPrompt }: ConfirmReloginOpts): Promise<boolean> => {
  if (skipPrompt || !config.secret_key) {
    return true
  }

  const mode = modeFromSecret(config.secret_key) ?? 'test'
  const keySuffix = config.key_name ? ` (key '${config.key_name}')` : ''

  const phrase = `replace the existing session (${mode} mode${keySuffix})`
  if (!process.stdin.isTTY) {
    throw new UsageError(`Confirmation required to ${phrase}. Use --yes to skip.`, {
      code: 'confirmation_required',
      param: 'yes',
    })
  }

  const proceed = await confirm(
    { message: `Are you sure you want to ${phrase}?`, default: false },
    { output: process.stderr },
  )
  if (!proceed) {
    hint('Aborted.')
  }
  return proceed
}

const promptPaste = (signal: AbortSignal) =>
  password(
    {
      message: 'Or paste your secret key:',
      mask: '•',
      validate: (v) =>
        modeFromSecret(v.trim()) !== null || `Expected 'sk_test_...' or 'sk_live_...'`,
    },
    { signal, output: process.stderr },
  ).then((s) => s.trim())

const handleBrowserError = (err: BrowserLoginError, mode: FintocMode): never => {
  error(err.message)
  switch (err.reason) {
    case 'mismatch': {
      const otherMode = mode === 'test' ? 'live' : 'test'
      hint(`\n  Re-run with the right mode:  fintoc login --mode ${otherMode}`)
      break
    }
    case 'denied':
    case 'timeout':
      hint('\n  Run again:        fintoc login')
      hint('  Or paste inline:  fintoc login --api-key sk_...')
      break
    default:
      err.reason satisfies never
  }
  process.exit(1)
}

const runBrowserFlow = async (existingConfig: FintocConfig, mode: FintocMode) => {
  const promptAc = new AbortController()
  let session: BrowserLoginSession | undefined
  try {
    session = await startBrowserLogin({ mode })

    info('Opening browser to authenticate...')
    hint(`\n  If the browser doesn't open, visit:\n  ${session.url}`)
    hint(`  Waiting for authorization (${BROWSER_LOGIN_TIMEOUT_MS / 60_000} min timeout).\n`)

    const callback = session.result.then((result) => ({ kind: 'callback' as const, result }))
    const paste = promptPaste(promptAc.signal).then((secretKey) => ({
      kind: 'paste' as const,
      secretKey,
    }))

    const winner = await Promise.race([callback, paste])
    if (winner.kind === 'callback') {
      persistAndAnnounce(existingConfig, winner.result)
    } else {
      const pastedMode = modeFromSecret(winner.secretKey)
      if (pastedMode !== mode) {
        throw new BrowserLoginError(
          'mismatch',
          `Pasted key looks like '${pastedMode}' but expected '${mode}'`,
        )
      }
      await saveSecret(existingConfig, winner.secretKey)
    }
  } catch (err) {
    if (err instanceof BrowserLoginError) {
      handleBrowserError(err, mode)
    } else {
      throw err
    }
  } finally {
    promptAc.abort()
    session?.cancel()
  }
}

export const loginCommand = (program: Command) => {
  program
    .command('login')
    .description('Authenticate with your Fintoc API key')
    .addOption(
      new Option('--mode <mode>', 'Authorization mode').choices(['test', 'live']).default('test'),
    )
    .option('-y, --yes', 'Skip confirmation when overriding an existing session')
    .configureHelp({ showGlobalOptions: true })
    .action(async (opts: LoginOpts, actionCmd: Command) => {
      const { apiKey, json } = actionCmd.optsWithGlobals<RootOpts>()
      try {
        if (!process.stdin.isTTY && !apiKey) {
          throw new UsageError('Browser login needs an interactive terminal', {
            code: 'missing_input',
            param: 'api-key',
            hints: [
              'Pass the key via flag:  fintoc login --api-key sk_...',
              'Or set env:             export FINTOC_API_KEY=sk_...',
            ],
          })
        }

        const existingConfig = readConfig()
        if (!(await confirmRelogin({ config: existingConfig, skipPrompt: !!opts.yes }))) {
          return
        }

        if (apiKey) {
          await saveSecret(existingConfig, apiKey, json)
          return
        }
        await runBrowserFlow(existingConfig, opts.mode)
      } catch (err) {
        if (isPromptCancelled(err)) {
          hint('Aborted.')
          return
        }
        handleError(err, { json })
      }
    })
}
