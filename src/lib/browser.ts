import { execFile } from 'node:child_process'

const OPENERS: Record<string, string[]> = {
  darwin: ['open'],
  linux: ['xdg-open'],
  win32: ['cmd', '/c', 'start', ''],
}

export const openInBrowser = (url: string): Promise<void> => {
  const opener = OPENERS[process.platform]
  if (!opener) {
    return Promise.reject(new Error(`Unsupported platform: ${process.platform}`))
  }
  const [cmd, ...args] = opener
  return new Promise((resolve, reject) => {
    execFile(cmd, [...args, url], (err) => (err ? reject(err) : resolve()))
  })
}
