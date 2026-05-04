import { describe, expect, test } from 'vitest'
import { resources, v1Resources, v2Resources } from '../registry.js'

describe('resource registry', () => {
  describe('schema validation', () => {
    test('contains all 12 resources', () => {
      expect(resources).toHaveLength(12)

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
        'account_verifications',
        'account_numbers',
        'movements',
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

    test('all flag types are valid', () => {
      const validTypes = new Set(['string', 'integer', 'boolean', 'string[]'])
      for (const resource of resources) {
        for (const flag of resource.createFlags ?? []) {
          expect(validTypes.has(flag.type)).toBe(true)
        }
        for (const flag of resource.listFlags ?? []) {
          expect(validTypes.has(flag.type)).toBe(true)
        }
        for (const flag of resource.getFlags ?? []) {
          expect(validTypes.has(flag.type)).toBe(true)
        }
      }
    })
  })

  describe('v2 resources', () => {
    test('transfers and accounts use v2 namespace', () => {
      const transfers = resources.find((r) => r.name === 'transfers')!
      const accounts = resources.find((r) => r.name === 'accounts')!

      expect(transfers.sdkNamespace).toBe('v2')
      expect(accounts.sdkNamespace).toBe('v2')
    })

    test('all other resources use v1 namespace', () => {
      const v2Names = new Set([
        'transfers',
        'accounts',
        'account_verifications',
        'account_numbers',
        'movements',
      ])
      const nonV2 = resources.filter((r) => !v2Names.has(r.name))
      for (const resource of nonV2) {
        expect(resource.sdkNamespace).toBe('v1')
      }
    })

    test('v1Resources contains only v1 namespace resources', () => {
      expect(v1Resources.every((r) => r.sdkNamespace === 'v1')).toBe(true)
      expect(v1Resources).toHaveLength(7)
    })

    test('v2Resources contains only v2 namespace resources', () => {
      expect(v2Resources.every((r) => r.sdkNamespace === 'v2')).toBe(true)
      expect(v2Resources.map((r) => r.name)).toEqual([
        'transfers',
        'accounts',
        'account_verifications',
        'account_numbers',
        'movements',
      ])
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

  describe('resource-specific flags', () => {
    test('checkout_sessions requires amount and currency', () => {
      const checkoutSessions = resources.find((r) => r.name === 'checkout_sessions')!
      const requiredFlags = checkoutSessions.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['amount', 'currency'])
    })

    test('transfers requires amount, currency, account-id, counterparty-account-number, and counterparty-institution-id', () => {
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

    test('webhook_endpoints requires url and enabled-events', () => {
      const webhooks = resources.find((r) => r.name === 'webhook_endpoints')!
      const requiredFlags = webhooks.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['url', 'enabled-events'])
    })

    test('webhook_endpoints enabled-events is string[] type', () => {
      const webhooks = resources.find((r) => r.name === 'webhook_endpoints')!
      const eventsFlag = webhooks.createFlags!.find((f) => f.name === 'enabled-events')!
      expect(eventsFlag.type).toBe('string[]')
    })

    test('account_verifications requires account-number and needs JWS', () => {
      const av = resources.find((r) => r.name === 'account_verifications')!
      expect(av.needsJws).toBe(true)
      const requiredFlags = av.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['account-number'])
    })

    test('account_numbers requires account-id for create', () => {
      const an = resources.find((r) => r.name === 'account_numbers')!
      const requiredFlags = an.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['account-id'])
    })

    test('movements requires account-id for get and list', () => {
      const movements = resources.find((r) => r.name === 'movements')!
      expect(movements.getFlags).toBeDefined()
      expect(movements.getFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'account-id',
      ])
      expect(movements.listFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'account-id',
      ])
    })

    test('movements uses nested sdkMethod path', () => {
      const movements = resources.find((r) => r.name === 'movements')!
      expect(movements.sdkMethod).toBe('accounts.movements')
    })
  })
})
