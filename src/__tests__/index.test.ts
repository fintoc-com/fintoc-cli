import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLI_PATH = resolve(__dirname, '..', '..', 'dist', 'index.js')

describe('cli smoke test', () => {
  test('shows version with --version flag', () => {
    const output = execFileSync('node', [CLI_PATH, '--version'], {
      encoding: 'utf-8',
    }).trim()

    expect(output).toMatch(/^fintoc\/\d+\.\d+\.\d+ \w+ node-v\d+/)
  })

  test('shows help with --help flag', () => {
    const output = execFileSync('node', [CLI_PATH, '--help'], {
      encoding: 'utf-8',
    }).trim()

    expect(output).toContain('Fintoc CLI')
    expect(output).toContain('fintoc')
  })
})
