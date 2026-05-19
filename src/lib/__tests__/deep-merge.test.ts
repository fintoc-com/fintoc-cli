import { describe, expect, test } from 'vitest'
import { deepMerge } from '../deep-merge.js'

describe('deepMerge', () => {
  test('shallow-merges disjoint keys', () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
  })

  test('source scalars take precedence on conflicting leaves', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 99 })).toEqual({ a: 1, b: 99 })
  })

  test('recursively merges nested plain objects', () => {
    expect(
      deepMerge(
        { metadata: { keep: 'me', override: 'old' } },
        { metadata: { override: 'new', added: 'fresh' } },
      ),
    ).toEqual({ metadata: { keep: 'me', override: 'new', added: 'fresh' } })
  })

  test('arrays in source replace arrays in target completely (no index-wise merge)', () => {
    expect(deepMerge({ tags: ['a', 'b', 'c'] }, { tags: ['x'] })).toEqual({ tags: ['x'] })
  })

  test('arrays nested under objects are also replaced completely', () => {
    expect(
      deepMerge(
        { metadata: { labels: ['old-1', 'old-2', 'old-3'] } },
        { metadata: { labels: ['only'] } },
      ),
    ).toEqual({ metadata: { labels: ['only'] } })
  })

  test('source array replaces target object at the same key', () => {
    expect(deepMerge({ value: { nested: 1 } }, { value: ['a', 'b'] })).toEqual({
      value: ['a', 'b'],
    })
  })

  test('arrays in target pass through untouched when source omits them', () => {
    expect(deepMerge({ tags: ['a', 'b'], name: 'old' }, { name: 'new' })).toEqual({
      tags: ['a', 'b'],
      name: 'new',
    })
  })

  test('does not mutate the input objects', () => {
    const target = { tags: ['a', 'b', 'c'], nested: { keep: 1 } }
    const source = { tags: ['x'], nested: { added: 2 } }

    deepMerge(target, source)

    expect(target).toEqual({ tags: ['a', 'b', 'c'], nested: { keep: 1 } })
    expect(source).toEqual({ tags: ['x'], nested: { added: 2 } })
  })

  test('empty source returns a shallow copy of the target', () => {
    const target = { a: 1, nested: { b: 2 } }
    const result = deepMerge(target, {})

    expect(result).toEqual(target)
    expect(result).not.toBe(target)
  })
})
