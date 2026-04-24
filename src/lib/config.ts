import type { FintocConfig } from '../types.js'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'

import { join } from 'node:path'

import { parse, stringify } from 'smol-toml'

export const CONFIG_DIR = join(homedir(), '.fintoc')
export const CONFIG_PATH = join(CONFIG_DIR, 'config.toml')

const isFileNotFound = (err: unknown) =>
  err instanceof Error && 'code' in err && err.code === 'ENOENT'

export const readConfig = (): FintocConfig => {
  try {
    const content = readFileSync(CONFIG_PATH, 'utf-8')
    return parse(content) as FintocConfig
  } catch (err) {
    if (isFileNotFound(err)) {
      return {}
    }
    throw err
  }
}

export const writeConfig = (config: FintocConfig) => {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })

  const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined))

  writeFileSync(CONFIG_PATH, stringify(clean), { mode: 0o600 })
}

export const clearConfig = () => {
  try {
    unlinkSync(CONFIG_PATH)
  } catch (err) {
    if (isFileNotFound(err)) {
      return
    }
    throw err
  }
}
