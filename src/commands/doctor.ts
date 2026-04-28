import type { Command } from 'commander'
import { execSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'

import { maskKey, resolveAuth, whoami } from '../lib/auth.js'
import { CONFIG_PATH, readConfig } from '../lib/config.js'
import { API_HOST, NPM_PACKAGE_NAME } from '../lib/constants.js'
import { error, info, log, success, warn } from '../lib/output.js'
import { getCliVersion } from '../lib/version.js'

const checkCliVersion = () => {
  const currentVersion = getCliVersion()
  try {
    const latest = execSync(`npm view ${NPM_PACKAGE_NAME} version`, {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    if (latest === currentVersion) {
      success(`CLI version         ${currentVersion} (latest)`)
    } else {
      warn(`CLI version         ${currentVersion} (latest: ${latest})`)
    }
  } catch {
    success(`CLI version         ${currentVersion}`)
    log('                    (could not check for updates)')
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
  if (mode !== 0o600) {
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
    log('                    Run `fintoc login` or set FINTOC_SECRET_KEY')
    return null
  }
}

const checkConnectivity = async (secretKey: string) => {
  try {
    const info = await whoami(secretKey)
    success(`Connectivity        ${API_HOST} reachable`)
    success(`Organization        ${info.organizationName} (${info.mode} mode)`)
  } catch {
    error(`Connectivity        could not reach ${API_HOST}`)
    log('                    Check your internet connection and API key')
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
  program
    .command('doctor')
    .description('Check CLI setup and connectivity')
    .action(async (_opts: unknown, cmd: Command) => {
      const rootOpts = cmd.parent!.opts<{ apiKey?: string }>()
      log('')
      checkCliVersion()

      const auth = checkApiKey(rootOpts)
      checkConfigFile(auth?.source)

      if (auth) {
        await checkConnectivity(auth.secretKey)
      } else {
        log('  ⏭ Connectivity     skipped (no API key)')
        log('  ⏭ Organization     skipped (no API key)')
      }

      checkJwsKey()
      log('')
    })
}
