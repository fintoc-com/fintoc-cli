import { afterEach, describe, expect, test, vi } from 'vitest'

import { error, log, success, warn } from '../output.js'

describe('output', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('log writes to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    log('hello')
    expect(spy).toHaveBeenCalledWith('hello')
  })

  test('success writes to stdout with ✔ prefix', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    success('done')
    expect(spy).toHaveBeenCalledWith('✔ done')
  })

  test('error writes to stderr with ✘ prefix', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    error('fail')
    expect(spy).toHaveBeenCalledWith('✘ fail')
  })

  test('warn writes to stderr with ⚠ prefix', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warn('careful')
    expect(spy).toHaveBeenCalledWith('⚠ careful')
  })
})
