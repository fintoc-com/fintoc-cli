import { afterEach, describe, expect, test, vi } from 'vitest'
import { readConfig } from '../config.js'
import {
  _resetColorCache,
  colorizeStatus,
  error,
  formatValue,
  log,
  printDetail,
  printJson,
  printTable,
  success,
  supportsColor,
  warn,
} from '../output.js'

vi.mock('../config.js', () => ({
  readConfig: vi.fn(() => ({})),
}))

describe('supportsColor', () => {
  const originalEnv = process.env

  afterEach(() => {
    _resetColorCache()
    process.env = originalEnv
  })

  describe('when FORCE_COLOR is set', () => {
    test('returns true for non-zero value', () => {
      process.env = { ...originalEnv, FORCE_COLOR: '1' }
      expect(supportsColor()).toBe(true)
    })

    test('returns false for FORCE_COLOR=0', () => {
      process.env = { ...originalEnv, FORCE_COLOR: '0' }
      expect(supportsColor()).toBe(false)
    })
  })

  describe('when NO_COLOR is set', () => {
    test('returns false', () => {
      process.env = { ...originalEnv, NO_COLOR: '' }
      expect(supportsColor()).toBe(false)
    })

    test('returns false even with a value', () => {
      process.env = { ...originalEnv, NO_COLOR: '1' }
      expect(supportsColor()).toBe(false)
    })
  })

  describe('when config.color is set', () => {
    test('returns true when color is true in config', () => {
      const { FORCE_COLOR: _fc, NO_COLOR: _nc, ...envWithout } = originalEnv
      process.env = envWithout
      vi.mocked(readConfig).mockReturnValue({ color: true })
      expect(supportsColor()).toBe(true)
    })

    test('returns false when color is false in config', () => {
      const { FORCE_COLOR: _fc, NO_COLOR: _nc, ...envWithout } = originalEnv
      process.env = envWithout
      vi.mocked(readConfig).mockReturnValue({ color: false })
      expect(supportsColor()).toBe(false)
    })

    test('env vars take precedence over config', () => {
      process.env = { ...originalEnv, NO_COLOR: '' }
      vi.mocked(readConfig).mockReturnValue({ color: true })
      expect(supportsColor()).toBe(false)
    })
  })

  describe('when neither FORCE_COLOR nor NO_COLOR nor config is set', () => {
    test('returns based on stdout.isTTY', () => {
      const { FORCE_COLOR: _fc, NO_COLOR: _nc, ...envWithout } = originalEnv
      process.env = envWithout
      vi.mocked(readConfig).mockReturnValue({})
      expect(supportsColor()).toBe(!!process.stdout.isTTY)
    })
  })
})

describe('colorizeStatus without color', () => {
  const originalEnv = process.env

  afterEach(() => {
    _resetColorCache()
    process.env = originalEnv
  })

  test('returns plain text when NO_COLOR is set', () => {
    process.env = { ...originalEnv, NO_COLOR: '' }
    expect(colorizeStatus('succeeded')).toBe('succeeded')
  })
})

describe('console wrappers', () => {
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
  const originalEnv = process.env

  afterEach(() => {
    _resetColorCache()
    process.env = originalEnv
  })

  test('applies green to succeeded when color is enabled', () => {
    process.env = { ...originalEnv, FORCE_COLOR: '1' }
    const result = colorizeStatus('succeeded')
    expect(result).toContain('succeeded')
    expect(result).toContain('\x1B[32m')
  })

  test('applies yellow to pending when color is enabled', () => {
    process.env = { ...originalEnv, FORCE_COLOR: '1' }
    const result = colorizeStatus('pending')
    expect(result).toContain('pending')
    expect(result).toContain('\x1B[33m')
  })

  test('applies red to failed when color is enabled', () => {
    process.env = { ...originalEnv, FORCE_COLOR: '1' }
    const result = colorizeStatus('failed')
    expect(result).toContain('failed')
    expect(result).toContain('\x1B[31m')
  })

  test('returns unknown status uncolored', () => {
    expect(colorizeStatus('custom')).toBe('custom')
  })
})

describe('formatValue', () => {
  const originalEnv = process.env

  afterEach(() => {
    _resetColorCache()
    process.env = originalEnv
  })

  test('formats null as dim dash', () => {
    const result = formatValue('id', null)
    expect(result).toContain('—')
  })

  test('formats undefined as dim dash', () => {
    const result = formatValue('id', undefined)
    expect(result).toContain('—')
  })

  test('colorizes status values when color is enabled', () => {
    process.env = { ...originalEnv, FORCE_COLOR: '1' }
    const result = formatValue('status', 'succeeded')
    expect(result).toContain('\x1B[32m')
  })

  test('colorizes keys ending with _status when color is enabled', () => {
    process.env = { ...originalEnv, FORCE_COLOR: '1' }
    const result = formatValue('payment_status', 'succeeded')
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

  test('formats object with name property using name', () => {
    const institution = { id: 'cl_banco_de_chile', name: 'Banco de Chile', country: 'cl' }
    expect(formatValue('institution', institution)).toBe('Banco de Chile')
  })

  test('formats object without name as JSON', () => {
    const obj = { id: 'abc', country: 'cl' }
    expect(formatValue('metadata', obj)).toBe(JSON.stringify(obj))
  })
})

describe('printTable', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('when rows are empty', () => {
    test('prints no results message', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
      printTable({ columns: ['id'], rows: [] })
      expect(spy).toHaveBeenCalledWith('No results found.')
    })
  })

  describe('when rows have data', () => {
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

    test('resolves nested paths in columns', () => {
      const calls: string[] = []
      vi.spyOn(console, 'log').mockImplementation((msg: string) => {
        calls.push(msg)
      })

      printTable({
        columns: ['id', 'entity.holder_name'],
        rows: [{ id: 'acc_1', entity: { holder_name: 'Acme Corp' } }],
      })

      expect(calls[0]).toContain('ENTITY_HOLDER_NAME')
      expect(calls[0]).not.toContain('ENTITY.HOLDER_NAME')
      expect(calls[1]).toContain('Acme Corp')
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

  describe('when total exceeds shown', () => {
    test('shows "X of Y" in footer', () => {
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

  describe('rendering', () => {
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
  })

  describe('when column filter is provided', () => {
    test('only shows filtered columns', () => {
      const calls: string[] = []
      vi.spyOn(console, 'log').mockImplementation((msg: string) => {
        calls.push(msg)
      })

      printDetail({ id: 'pi_123', amount: 10000, secret: 'hidden' }, ['id', 'amount'])

      expect(calls).toHaveLength(2)
      expect(calls.every((c) => !c.includes('hidden'))).toBe(true)
    })
  })

  describe('when columns contain nested paths', () => {
    test('resolves nested values and uses full path as label', () => {
      const calls: string[] = []
      vi.spyOn(console, 'log').mockImplementation((msg: string) => {
        calls.push(msg)
      })

      printDetail({ id: 'acc_1', entity: { holder_name: 'Acme Corp' } }, [
        'id',
        'entity.holder_name',
      ])

      expect(calls).toHaveLength(2)
      expect(calls[1]).toContain('entity_holder_name')
      expect(calls[1]).toContain('Acme Corp')
    })

    test('shows dash when nested path resolves to undefined', () => {
      const calls: string[] = []
      vi.spyOn(console, 'log').mockImplementation((msg: string) => {
        calls.push(msg)
      })

      printDetail({ id: 'acc_1', entity: {} }, ['id', 'entity.holder_name'])

      expect(calls).toHaveLength(2)
      expect(calls[1]).toContain('entity_holder_name')
      expect(calls[1]).toContain('—')
    })
  })

  describe('when no columns are provided', () => {
    test('shows all top-level keys', () => {
      const calls: string[] = []
      vi.spyOn(console, 'log').mockImplementation((msg: string) => {
        calls.push(msg)
      })

      printDetail({ id: 'pi_123', amount: 10000, status: 'pending' })

      expect(calls).toHaveLength(3)
      expect(calls[0]).toContain('pi_123')
      expect(calls[1]).toContain('10000')
    })
  })
})
