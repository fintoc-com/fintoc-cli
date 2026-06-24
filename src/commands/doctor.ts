import type { Command } from 'commander'
import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { maskKey, resolveAuth, whoami } from '../lib/auth.js'
import { CONFIG_PATH, readConfig } from '../lib/config.js'
import {
  API_HOST,
  CONFIG_FILE_PERMISSIONS,
  DASHBOARD_API_KEYS_URL,
  IP_ALLOWLIST_ERROR_CODES,
  NPM_CHECK_TIMEOUT_MS,
  NPM_PACKAGE_NAME,
} from '../lib/constants.js'
import { parseFintocError } from '../lib/errors.js'
import { error, hint, info, success, warn } from '../lib/output.js'
import { getCliVersion } from '../lib/version.js'

const checkCliVersion = () => {
  const currentVersion = getCliVersion()
  try {
    const latest = execSync(`npm view ${NPM_PACKAGE_NAME} version`, {
      encoding: 'utf-8',
      timeout: NPM_CHECK_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    if (latest === currentVersion) {
      success(`CLI version         ${currentVersion} (latest)`)
    } else {
      warn(`CLI version         ${currentVersion} (latest: ${latest})`)
    }
  } catch {
    success(`CLI version         ${currentVersion}`)
    hint('                    (could not check for updates)')
  }
}

const checkConfigFile = (authSource?: string) => {
  if (!existsSync(CONFIG_PATH)) {
    if (authSource) {
      warn(`Config file         ${CONFIG_PATH} not found (using ${authSource})`)
    } else {
      error(`Config file         ${CONFIG_PATH} not found`)
    }
    return
  }

  const stats = statSync(CONFIG_PATH)
  const mode = stats.mode & 0o777
  if (mode !== CONFIG_FILE_PERMISSIONS) {
    warn(
      `Config file         ${CONFIG_PATH} found (permissions: ${mode.toString(8)}, expected: 600)`,
    )
    return
  }

  success(`Config file         ${CONFIG_PATH} found`)
}

const checkApiKey = (options?: { apiKey?: string }) => {
  try {
    const auth = resolveAuth(options)
    success(`API key             ${maskKey(auth.secretKey)} (source: ${auth.source})`)
    return auth
  } catch {
    error('API key             not configured')
    hint('                    Run `fintoc login` or set FINTOC_API_KEY')
    return null
  }
}

const checkConnectivity = async (secretKey: string) => {
  try {
    const info = await whoami(secretKey)
    success(`Connectivity        ${API_HOST} reachable`)
    success(`Organization        ${info.organizationName} (${info.mode} mode)`)
  } catch (err) {
    const fields = parseFintocError(err)

    if (fields?.code && IP_ALLOWLIST_ERROR_CODES.has(fields.code)) {
      error(`Connectivity        ${API_HOST} reachable, but your IP is not allow-listed`)
      hint(`                    ${fields.message ?? 'Your IP is not in the allowed CIDR blocks.'}`)
      hint('                    Add your IP to the allow list in the dashboard:')
      hint(`                    ${DASHBOARD_API_KEYS_URL}`)
      return
    }

    if (fields?.type === 'authentication_error') {
      error(`Connectivity        ${API_HOST} reachable, but the API key was rejected`)
      hint('                    Check your API key is valid for this environment.')
      return
    }

    error(`Connectivity        could not reach ${API_HOST}`)
    hint('                    Check your internet connection and API key')
  }
}

const checkJwsKey = () => {
  const config = readConfig()
  if (!config.jws_private_key) {
    info('JWS private key     not configured (only needed for transfers create)')
    return
  }

  if (!existsSync(config.jws_private_key)) {
    error(`JWS private key     file not found: ${config.jws_private_key}`)
    return
  }

  success(`JWS private key     ${config.jws_private_key}`)
}

export const doctorCommand = (program: Command) => {
  const cmd = program.command('doctor').description('Check CLI setup and connectivity')
  cmd.configureHelp({ showGlobalOptions: true })
  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    const rootOpts = actionCmd.parent!.opts<{ apiKey?: string }>()
    hint('')
    checkCliVersion()

    const auth = checkApiKey(rootOpts)
    checkConfigFile(auth?.source)

    if (auth) {
      await checkConnectivity(auth.secretKey)
    } else {
      hint('  ⏭ Connectivity     skipped (no API key)')
      hint('  ⏭ Organization     skipped (no API key)')
    }

    checkJwsKey()
    hint('')
  })
}
