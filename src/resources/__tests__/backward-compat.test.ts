import type { Surface } from './cli-surface.js'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { resources } from '../registry.js'
import { cliSurface, mergeSurface } from './cli-surface.js'

const FIXTURE = new URL('./fixtures/published-surface.json', import.meta.url)

const current = cliSurface(resources)

// UPDATE_CLI_SURFACE=1 only adds what is new, so it cannot hide a breaking change
if (process.env.UPDATE_CLI_SURFACE) {
  const published = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as Surface
  writeFileSync(FIXTURE, `${JSON.stringify(mergeSurface(published, current), null, 2)}\n`)
}

const published = JSON.parse(readFileSync(FIXTURE, 'utf-8')) as Surface

describe('backward compatibility with the published CLI', () => {
  test.each(Object.keys(published))('%s keeps its contract', (command) => {
    const before = published[command]
    const after = current[command]
    expect(after, 'command removed').toBeDefined()
    expect(after.args.length, 'number of positional arguments changed').toBe(before.args.length)

    for (const [name, flag] of Object.entries(before.flags)) {
      const now = after.flags[name]
      expect(now, `--${name} removed (mark it deprecated instead)`).toBeDefined()
      expect(now.type, `--${name} changed type`).toBe(flag.type)
      if (!flag.required) {
        expect(now.required, `--${name} became required`).toBe(false)
      }
    }
    for (const [name, flag] of Object.entries(after.flags)) {
      if (!before.flags[name]) {
        expect(flag.required, `new flag --${name} is required`).toBe(false)
      }
    }
    for (const option of before.options) {
      expect(after.options, `${option} removed`).toContain(option)
    }
    if (!before.confirm) {
      expect(after.confirm, 'now asks for confirmation, which breaks scripts without --yes').toBe(
        false,
      )
    }
  })
})
