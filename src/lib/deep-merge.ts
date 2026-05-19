import { mergeWith } from 'es-toolkit/compat'

export const deepMerge = <T extends object, U extends object>(target: T, source: U): T & U =>
  mergeWith({}, target, source, (_, src) => (Array.isArray(src) ? src : undefined))
