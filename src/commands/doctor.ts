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
  JWS_COMMANDS,
  NPM_CHECK_TIMEOUT_MS,
  NPM_PACKAGE_NAME,
} from '../lib/constants.js'
import { parseFintocError } from '../lib/errors.js'
import { error, hint, info, printJson, success, warn } from '../lib/output.js'
import { getCliVersion } from '../lib/version.js'

const LABEL_WIDTH = 20
const DETAIL_INDENT = 2 + LABEL_WIDTH

type CheckStatus = 'ok' | 'warn' | 'error' | 'info'

type CheckResult = { check: string; status: CheckStatus; message: string; details?: string[] }

const SYMBOL_OUTPUT = { ok: success, warn, error, info } satisfies Record<
  CheckStatus,
  (m: string) => void
>

const printCheck = ({ check, status, message, details = [] }: CheckResult) => {
  SYMBOL_OUTPUT[status](`${check.padEnd(LABEL_WIDTH)}${message}`)
  details.forEach((text) => hint(`${' '.repeat(DETAIL_INDENT)}${text}`))
}

const checkCliVersion = (): CheckResult => {
  const currentVersion = getCliVersion()
  try {
    const latest = execSync(`npm view ${NPM_PACKAGE_NAME} version`, {
      encoding: 'utf-8',
      timeout: NPM_CHECK_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    return latest === currentVersion
      ? { check: 'CLI version', status: 'ok', message: `${currentVersion} (latest)` }
      : { check: 'CLI version', status: 'warn', message: `${currentVersion} (latest: ${latest})` }
  } catch {
    return {
      check: 'CLI version',
      status: 'ok',
      message: currentVersion,
      details: ['(could not check for updates)'],
    }
  }
}

const checkConfigFile = (authSource?: string): CheckResult => {
  if (!existsSync(CONFIG_PATH)) {
    return authSource
      ? {
          check: 'Config file',
          status: 'warn',
          message: `${CONFIG_PATH} not found (using ${authSource})`,
        }
      : { check: 'Config file', status: 'error', message: `${CONFIG_PATH} not found` }
  }

  const mode = statSync(CONFIG_PATH).mode & 0o777
  if (mode !== CONFIG_FILE_PERMISSIONS) {
    return {
      check: 'Config file',
      status: 'warn',
      message: `${CONFIG_PATH} found (permissions: ${mode.toString(8)}, expected: 600)`,
    }
  }

  return { check: 'Config file', status: 'ok', message: `${CONFIG_PATH} found` }
}

const checkApiKey = (options?: { apiKey?: string }) => {
  try {
    const auth = resolveAuth(options)
    const result: CheckResult = {
      check: 'API key',
      status: 'ok',
      message: `${maskKey(auth.secretKey)} (source: ${auth.source})`,
    }
    return { auth, result }
  } catch {
    const result: CheckResult = {
      check: 'API key',
      status: 'error',
      message: 'not configured',
      details: ['Run `fintoc login` or set FINTOC_API_KEY'],
    }
    return { auth: null, result }
  }
}

const checkConnectivity = async (secretKey: string): Promise<CheckResult[]> => {
  try {
    const info = await whoami(secretKey)
    return [
      { check: 'Connectivity', status: 'ok', message: `${API_HOST} reachable` },
      {
        check: 'Organization',
        status: 'ok',
        message: `${info.organizationName} (${info.mode} mode)`,
      },
    ]
  } catch (err) {
    const fields = parseFintocError(err)

    if (fields?.code && IP_ALLOWLIST_ERROR_CODES.has(fields.code)) {
      return [
        {
          check: 'Connectivity',
          status: 'error',
          message: `${API_HOST} reachable, but your IP is not allow-listed`,
          details: [
            fields.message ?? 'Your IP is not in the allowed CIDR blocks.',
            'Add your IP to the allow list in the dashboard:',
            DASHBOARD_API_KEYS_URL,
          ],
        },
      ]
    }

    if (fields?.type === 'authentication_error') {
      return [
        {
          check: 'Connectivity',
          status: 'error',
          message: `${API_HOST} reachable, but the API key was rejected`,
          details: ['Check your API key is valid for this environment.'],
        },
      ]
    }

    return [
      {
        check: 'Connectivity',
        status: 'error',
        message: `could not reach ${API_HOST}`,
        details: ['Check your internet connection and API key'],
      },
    ]
  }
}

const checkJwsKey = (): CheckResult => {
  const config = readConfig()
  if (!config.jws_private_key) {
    return {
      check: 'JWS private key',
      status: 'info',
      message: `not configured (only needed for ${JWS_COMMANDS})`,
    }
  }

  if (!existsSync(config.jws_private_key)) {
    return {
      check: 'JWS private key',
      status: 'error',
      message: `file not found: ${config.jws_private_key}`,
    }
  }

  return { check: 'JWS private key', status: 'ok', message: config.jws_private_key }
}

export const doctorCommand = (program: Command) => {
  const cmd = program.command('doctor').description('Check CLI setup and connectivity')
  cmd.configureHelp({ showGlobalOptions: true })
  cmd.action(async (_opts: unknown, actionCmd: Command) => {
    const rootOpts = actionCmd.parent!.opts<{ apiKey?: string; json?: boolean }>()
    const { auth, result: apiKey } = checkApiKey(rootOpts)
    const checks: CheckResult[] = [checkCliVersion(), apiKey, checkConfigFile(auth?.source)]

    if (auth) {
      checks.push(...(await checkConnectivity(auth.secretKey)))
    } else {
      checks.push(
        { check: 'Connectivity', status: 'info', message: 'skipped (no API key)' },
        { check: 'Organization', status: 'info', message: 'skipped (no API key)' },
      )
    }
    checks.push(checkJwsKey())

    if (rootOpts.json) {
      printJson({ ok: checks.every((c) => c.status !== 'error'), checks })
      return
    }
    hint('')
    checks.forEach(printCheck)
    hint('')
  })
}
