import { describe, expect, test } from 'vitest'

import { resources } from '../registry.js'

describe('resource registry', () => {
  test('contains all 9 resources', () => {
    expect(resources).toHaveLength(9)

    const names = resources.map((r) => r.name)
    expect(names).toEqual([
      'payment_intents',
      'transfers',
      'accounts',
      'webhook_endpoints',
      'charges',
      'subscriptions',
      'links',
      'checkout_sessions',
      'api_keys',
    ])
  })

  test('every resource has required fields', () => {
    for (const resource of resources) {
      expect(resource.name).toBeTruthy()
      expect(resource.cliCommand).toBeTruthy()
      expect(resource.sdkMethod).toBeTruthy()
      expect(['v1', 'v2']).toContain(resource.sdkNamespace)
      expect(resource.verbs.length).toBeGreaterThan(0)
      expect(resource.priorityColumns.length).toBeGreaterThanOrEqual(1)
      expect(resource.priorityColumns.length).toBeLessThanOrEqual(6)
    }
  })

  test('verbs are valid', () => {
    const validVerbs = new Set(['create', 'get', 'list', 'delete', 'expire'])
    resources.forEach((resource) => {
      resource.verbs.forEach((verb) => {
        expect(validVerbs.has(verb)).toBe(true)
      })
    })
  })

  test('resources with create verb have createFlags', () => {
    resources
      .filter((resource) => resource.verbs.includes('create'))
      .forEach((resource) => {
        expect(resource.createFlags).toBeDefined()
        expect(resource.createFlags!.length).toBeGreaterThan(0)
      })
  })

  test('createFlags with required=true exist for resources that need them', () => {
    const checkoutSessions = resources.find((r) => r.name === 'checkout_sessions')!
    const requiredFlags = checkoutSessions.createFlags!.filter((f) => f.required)
    expect(requiredFlags.map((f) => f.name)).toEqual(['amount', 'currency'])
  })

  test('all flag types are valid', () => {
    const validTypes = new Set(['string', 'number', 'boolean', 'string[]'])
    for (const resource of resources) {
      for (const flag of resource.createFlags ?? []) {
        expect(validTypes.has(flag.type)).toBe(true)
      }
      for (const flag of resource.listFlags ?? []) {
        expect(validTypes.has(flag.type)).toBe(true)
      }
    }
  })

  describe('v2 resources', () => {
    test('transfers and accounts use v2 namespace', () => {
      const transfers = resources.find((r) => r.name === 'transfers')!
      const accounts = resources.find((r) => r.name === 'accounts')!

      expect(transfers.sdkNamespace).toBe('v2')
      expect(accounts.sdkNamespace).toBe('v2')
    })

    test('all other resources use v1 namespace', () => {
      const v1Resources = resources.filter((r) => !['transfers', 'accounts'].includes(r.name))
      for (const resource of v1Resources) {
        expect(resource.sdkNamespace).toBe('v1')
      }
    })
  })

  describe('resource-specific verbs', () => {
    test('api_keys only supports list', () => {
      const apiKeys = resources.find((r) => r.name === 'api_keys')!
      expect(apiKeys.verbs).toEqual(['list'])
    })

    test('webhook_endpoints and links support delete', () => {
      const webhooks = resources.find((r) => r.name === 'webhook_endpoints')!
      const links = resources.find((r) => r.name === 'links')!

      expect(webhooks.verbs).toContain('delete')
      expect(links.verbs).toContain('delete')
    })

    test('subscriptions and accounts are read-only (get + list)', () => {
      const subscriptions = resources.find((r) => r.name === 'subscriptions')!
      const accounts = resources.find((r) => r.name === 'accounts')!

      expect(subscriptions.verbs).toEqual(['get', 'list'])
      expect(accounts.verbs).toEqual(['get', 'list'])
    })
  })

  describe('transfers create flags', () => {
    test('requires amount, currency, account-id, counterparty-account-number, and counterparty-institution-id', () => {
      const transfers = resources.find((r) => r.name === 'transfers')!
      const requiredFlags = transfers.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual([
        'amount',
        'currency',
        'account-id',
        'counterparty-account-number',
        'counterparty-institution-id',
      ])
    })
  })

  describe('webhook_endpoints create flags', () => {
    test('requires url and enabled-events', () => {
      const webhooks = resources.find((r) => r.name === 'webhook_endpoints')!
      const requiredFlags = webhooks.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['url', 'enabled-events'])
    })

    test('enabled-events is string[] type', () => {
      const webhooks = resources.find((r) => r.name === 'webhook_endpoints')!
      const eventsFlag = webhooks.createFlags!.find((f) => f.name === 'enabled-events')!
      expect(eventsFlag.type).toBe('string[]')
    })
  })
})
