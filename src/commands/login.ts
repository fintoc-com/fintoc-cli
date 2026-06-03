import type { Command } from 'commander'

import type { BrowserLoginResult, BrowserLoginSession } from '../lib/browser-login.js'
import type { FintocConfig, FintocMode } from '../types.js'

import { confirm, password } from '@inquirer/prompts'
import { Option } from 'commander'

import { whoami } from '../lib/auth.js'
import { BrowserLoginError, startBrowserLogin } from '../lib/browser-login.js'
import { CONFIG_PATH, readConfig, writeConfig } from '../lib/config.js'
import { BROWSER_LOGIN_TIMEOUT_MS } from '../lib/constants.js'
import { handleError } from '../lib/errors.js'
import { error, hint, info, success, warn } from '../lib/output.js'

type LoginOpts = { mode: FintocMode; yes?: boolean }
type RootOpts = { apiKey?: string }

const SECRET_KEY_PATTERN = /^sk_(?:test|live)_/

const isPromptCancelled = (err: unknown): boolean =>
  err instanceof Error && err.name === 'ExitPromptError'

const persistAndAnnounce = (existingConfig: FintocConfig, outcome: BrowserLoginResult) => {
  const next: FintocConfig = {
    ...existingConfig,
    secret_key: outcome.secret,
    key_name: outcome.keyName,
    expires_at: outcome.expiresAt,
  }

  try {
    writeConfig(next)
  } catch {
    error(`Authentication succeeded but could not write to ${CONFIG_PATH}`)
    process.exit(1)
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

const saveSecret = async (existingConfig: FintocConfig, secretKey: string) => {
  if (!SECRET_KEY_PATTERN.test(secretKey)) {
    error(`Invalid key format. Expected 'sk_test_...' or 'sk_live_...'.`)
    process.exit(1)
  }
  try {
    const { organizationName, mode } = await whoami(secretKey)
    persistAndAnnounce(existingConfig, { secret: secretKey, organizationName, mode })
  } catch (err) {
    handleError(err)
  }
}

type ConfirmReloginOpts = { config: FintocConfig; skipPrompt: boolean }

const confirmRelogin = async ({ config, skipPrompt }: ConfirmReloginOpts): Promise<boolean> => {
  if (skipPrompt || !config.secret_key) {
    return true
  }

  const mode = config.secret_key.startsWith('sk_live_') ? 'live' : 'test'
  const keySuffix = config.key_name ? ` (key '${config.key_name}')` : ''

  if (!process.stdin.isTTY) {
    error(`Non-interactive terminal detected. Cannot prompt to override existing session.`)
    hint(`\n  Existing session: ${mode} mode${keySuffix}.`)
    hint(`  Re-run with --yes to override.`)
    process.exit(1)
  }

  const proceed = await confirm({
    message: `Already authenticated in ${mode} mode${keySuffix}. Continue?`,
    default: true,
  })
  if (!proceed) {
    hint('Login aborted.')
  }
  return proceed
}

const promptPaste = (signal: AbortSignal) =>
  password(
    {
      message: 'Or paste your secret key:',
      mask: '•',
      validate: (v) =>
        SECRET_KEY_PATTERN.test(v.trim()) || `Expected 'sk_test_...' or 'sk_live_...'`,
    },
    { signal },
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
      try {
        const { apiKey } = actionCmd.optsWithGlobals<RootOpts>()

        if (!process.stdin.isTTY && !apiKey) {
          error('Non-interactive terminal detected.')
          hint('\n  Pass the key via flag:  fintoc login --api-key sk_...')
          hint('  Or set env:             export FINTOC_API_KEY=sk_...')
          process.exit(1)
        }

        const existingConfig = readConfig()
        if (!(await confirmRelogin({ config: existingConfig, skipPrompt: !!opts.yes }))) {
          return
        }

        if (apiKey) {
          await saveSecret(existingConfig, apiKey)
          return
        }
        await runBrowserFlow(existingConfig, opts.mode)
      } catch (err) {
        if (isPromptCancelled(err)) {
          hint('Login aborted.')
          return
        }
        handleError(err)
      }
    })
}
