import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  colorizeStatus,
  error,
  formatValue,
  log,
  printDetail,
  printJson,
  printTable,
  success,
  warn,
} from '../output.js'

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

describe('colorizeStatus', () => {
  test('applies green to succeeded', () => {
    const result = colorizeStatus('succeeded')
    expect(result).toContain('succeeded')
    expect(result).toContain('\x1B[32m')
  })

  test('applies yellow to pending', () => {
    const result = colorizeStatus('pending')
    expect(result).toContain('pending')
    expect(result).toContain('\x1B[33m')
  })

  test('applies red to failed', () => {
    const result = colorizeStatus('failed')
    expect(result).toContain('failed')
    expect(result).toContain('\x1B[31m')
  })

  test('returns unknown status uncolored', () => {
    expect(colorizeStatus('custom')).toBe('custom')
  })
})

describe('formatValue', () => {
  test('formats null as dim dash', () => {
    const result = formatValue('id', null)
    expect(result).toContain('—')
  })

  test('formats undefined as dim dash', () => {
    const result = formatValue('id', undefined)
    expect(result).toContain('—')
  })

  test('colorizes status values', () => {
    const result = formatValue('status', 'succeeded')
    expect(result).toContain('\x1B[32m')
  })

  test('formats Date as YYYY-MM-DD', () => {
    const result = formatValue('created_at', new Date('2026-04-22T12:00:00Z'))
    expect(result).toBe('2026-04-22')
  })

  test('joins arrays with commas', () => {
    expect(formatValue('events', ['a', 'b', 'c'])).toBe('a, b, c')
  })

  test('converts other values to string', () => {
    expect(formatValue('amount', 10000)).toBe('10000')
  })
})

describe('printTable', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('prints no results message for empty rows', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printTable({ columns: ['id'], rows: [] })
    expect(spy).toHaveBeenCalledWith('No results found.')
  })

  test('prints header and rows', () => {
    const calls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      calls.push(msg)
    })

    printTable({
      columns: ['id', 'status'],
      rows: [
        { id: 'pi_123', status: 'pending' },
        { id: 'pi_456', status: 'succeeded' },
      ],
    })

    expect(calls[0]).toContain('ID')
    expect(calls[0]).toContain('STATUS')
    expect(calls[1]).toContain('pi_123')
    expect(calls[2]).toContain('pi_456')
    expect(calls[4]).toContain('Showing 2 results')
  })

  test('shows "X of Y" when total exceeds shown', () => {
    const calls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      calls.push(msg)
    })

    printTable({
      columns: ['id'],
      rows: [{ id: 'pi_123' }],
      total: 50,
    })

    const footer = calls.find((c) => c.includes('Showing'))
    expect(footer).toContain('1 of 50')
  })

  test('uses singular "result" for single row', () => {
    const calls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      calls.push(msg)
    })

    printTable({
      columns: ['id'],
      rows: [{ id: 'pi_123' }],
    })

    const footer = calls.find((c) => c.includes('Showing'))
    expect(footer).toContain('1 result')
  })
})

describe('printJson', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('prints formatted JSON', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    printJson({ id: 'pi_123', amount: 10000 })
    expect(spy).toHaveBeenCalledWith(JSON.stringify({ id: 'pi_123', amount: 10000 }, null, 2))
  })
})

describe('printDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('prints key-value pairs', () => {
    const calls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      calls.push(msg)
    })

    printDetail({ id: 'pi_123', amount: 10000 })

    expect(calls[0]).toContain('id')
    expect(calls[0]).toContain('pi_123')
    expect(calls[1]).toContain('amount')
    expect(calls[1]).toContain('10000')
  })

  test('respects column filter', () => {
    const calls: string[] = []
    vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      calls.push(msg)
    })

    printDetail({ id: 'pi_123', amount: 10000, secret: 'hidden' }, ['id', 'amount'])

    expect(calls).toHaveLength(2)
    expect(calls.every((c) => !c.includes('hidden'))).toBe(true)
  })
})
