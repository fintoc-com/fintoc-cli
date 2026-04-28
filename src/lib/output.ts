/* eslint-disable no-console */

export const log = (message: string) => {
  console.log(message)
}

export const success = (message: string) => {
  console.log(`✔ ${message}`)
}

export const error = (message: string) => {
  console.error(`✘ ${message}`)
}

export const warn = (message: string) => {
  console.error(`⚠ ${message}`)
}

export const info = (message: string) => {
  console.log(`ℹ ${message}`)
}

// ANSI color helpers
const green = (text: string) => `\x1B[32m${text}\x1B[0m`
const yellow = (text: string) => `\x1B[33m${text}\x1B[0m`
const red = (text: string) => `\x1B[31m${text}\x1B[0m`
const dim = (text: string) => `\x1B[2m${text}\x1B[0m`

const STATUS_COLORS = {
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
} satisfies Record<string, (text: string) => string>

export const colorizeStatus = (status: string) => {
  if (!(status in STATUS_COLORS)) {
    return status
  }
  return STATUS_COLORS[status as keyof typeof STATUS_COLORS](status)
}

const toLabel = (path: string) => path.replace(/\./g, '_')

const getNestedValue = (obj: Record<string, unknown>, path: string): unknown => {
  if (!path.includes('.')) {
    return obj[path]
  }
  return path.split('.').reduce<unknown>((current, key) => {
    if (current !== null && current !== undefined && typeof current === 'object') {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

// Strip ANSI codes for width calculation
// eslint-disable-next-line no-control-regex
const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*m/g, '')

export type TableOptions = {
  columns: string[]
  rows: Record<string, unknown>[]
  total?: number
}

export const formatValue = (key: string, value: unknown) => {
  if (value === null || value === undefined) {
    return dim('—')
  }
  if (key === 'status' || key.endsWith('_status')) {
    return colorizeStatus(String(value))
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (typeof obj.name === 'string') {
      return obj.name
    }
    return JSON.stringify(value)
  }
  return String(value)
}

export const printTable = ({ columns, rows, total }: TableOptions) => {
  if (rows.length === 0) {
    log('No results found.')
    return
  }

  // Build formatted rows (with ANSI codes for display)
  const formattedRows = rows.map((row) =>
    columns.map((col) => formatValue(toLabel(col), getNestedValue(row, col))),
  )

  const headers = columns.map((col) => toLabel(col).toUpperCase())
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

export const printJson = (data: unknown) => {
  console.log(JSON.stringify(data, null, 2))
}

export const printDetail = (data: Record<string, unknown>, columns?: string[]) => {
  const keys = columns ?? Object.keys(data)
  if (keys.length === 0) {
    return
  }

  const labels = keys.map((k) => toLabel(k))
  const maxKeyLen = Math.max(...labels.map((l) => l.length))

  for (let i = 0; i < keys.length; i++) {
    const value = getNestedValue(data, keys[i])
    const label = labels[i].padEnd(maxKeyLen)
    const formatted = formatValue(labels[i], value)
    log(`${label}  ${formatted}`)
  }
}
