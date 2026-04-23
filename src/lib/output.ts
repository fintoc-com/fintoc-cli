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
