/* eslint-disable no-console */

export const log = (message: string): void => {
  console.log(message)
}

export const success = (message: string): void => {
  console.log(`✔ ${message}`)
}

export const error = (message: string): void => {
  console.error(`✘ ${message}`)
}

export const warn = (message: string): void => {
  console.error(`⚠ ${message}`)
}

// ANSI color helpers
const green = (text: string): string => `\x1B[32m${text}\x1B[0m`
const yellow = (text: string): string => `\x1B[33m${text}\x1B[0m`
const red = (text: string): string => `\x1B[31m${text}\x1B[0m`
const dim = (text: string): string => `\x1B[2m${text}\x1B[0m`

const STATUS_ICONS: Record<string, (text: string) => string> = {
  succeeded: green,
  active: green,
  paid: green,
  enabled: green,
  pending: yellow,
  processing: yellow,
  in_progress: yellow,
  login_required: yellow,
  failed: red,
  rejected: red,
  expired: red,
  inactive: red,
  disabled: red,
}

export const colorizeStatus = (status: string): string => {
  const colorFn = STATUS_ICONS[status]
  return colorFn ? colorFn(status) : status
}

// Strip ANSI codes for width calculation
// eslint-disable-next-line no-control-regex
const stripAnsi = (str: string): string => str.replace(/\x1B\[[0-9;]*m/g, '')

export type TableOptions = {
  columns: string[]
  rows: Record<string, unknown>[]
  total?: number
}

export const formatValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return dim('—')
  if (key === 'status') return colorizeStatus(String(value))
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

export const printTable = ({ columns, rows, total }: TableOptions): void => {
  if (rows.length === 0) {
    log('No results found.')
    return
  }

  // Build formatted rows (with ANSI codes for display)
  const formattedRows = rows.map((row) => columns.map((col) => formatValue(col, row[col])))

  // Calculate column widths using stripped ANSI text
  const headers = columns.map((col) => col.toUpperCase())
  const widths = columns.map((col, i) => {
    const cellWidths = formattedRows.map((row) => stripAnsi(row[i]).length)
    return Math.max(headers[i].length, ...cellWidths)
  })

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ')
  log(dim(`  ${headerLine}`))

  // Print rows
  for (const row of formattedRows) {
    const line = row
      .map((cell, i) => {
        const padding = widths[i] - stripAnsi(cell).length
        return cell + ' '.repeat(Math.max(0, padding))
      })
      .join('  ')
    log(`  ${line}`)
  }

  // Footer
  log('')
  const shown = rows.length
  if (total !== undefined && total > shown) {
    log(`Showing ${shown} of ${total} results`)
  } else {
    log(`Showing ${shown} ${shown === 1 ? 'result' : 'results'}`)
  }
}

export const printJson = (data: unknown): void => {
  console.log(JSON.stringify(data, null, 2))
}

export const printDetail = (data: Record<string, unknown>, columns?: string[]): void => {
  const keys = columns ?? Object.keys(data)
  const maxKeyLen = Math.max(...keys.map((k) => k.length))

  for (const key of keys) {
    if (!(key in data)) continue
    const label = key.padEnd(maxKeyLen)
    const value = formatValue(key, data[key])
    log(`${label}  ${value}`)
  }
}
