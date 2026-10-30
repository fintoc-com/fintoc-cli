import { describe, expect, test } from 'vitest'
import { resources, v1Resources, v2Resources } from '../registry.js'

const find = (name: string, namespace: 'v1' | 'v2') =>
  resources.find((r) => r.name === name && r.sdkNamespace === namespace)!

describe('resource registry', () => {
  describe('schema validation', () => {
    test('contains all 42 resources', () => {
      expect(resources).toHaveLength(42)

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
        'refunds',
        'subscription_intents',
        'payment_links',
        'disputes',
        'accounts',
        'movements',
        'invoices',
        'tax_returns',
        'refresh_intents',
        'checkout_sessions',
        'customers',
        'entities',
        'onboardings',
        'payment_intents',
        'payment_methods',
        'products',
        'subscriptions',
        'invoices',
        'account_statements',
        'recipients',
        'transfer_batches',
        'payouts',
        'institutions',
        'link_intents',
        'tax_statements',
        'events',
        'setup_intents',
        'subscription_items',
        'invoice_lines',
        'simulate',
      ])
    })

    test('names are unique within each namespace', () => {
      const keys = resources.map((r) => `${r.sdkNamespace}:${r.name}`)
      expect(new Set(keys).size).toBe(keys.length)
    })

    test('every resource has required fields', () => {
      for (const resource of resources) {
        expect(resource.name).toBeTruthy()
        expect(resource.cliCommand).toBeTruthy()
        expect(resource.sdkMethod).toBeTruthy()
        expect(['v1', 'v2']).toContain(resource.sdkNamespace)
        expect(resource.verbs.length + (resource.actions?.length ?? 0)).toBeGreaterThan(0)
        expect(resource.priorityColumns.length).toBeGreaterThanOrEqual(1)
        expect(resource.priorityColumns.length).toBeLessThanOrEqual(6)
      }
    })

    test('verbs are valid', () => {
      const validVerbs = new Set(['create', 'get', 'list', 'update', 'delete'])
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
      const validTypes = new Set(['string', 'integer', 'boolean', 'string[]', 'map'])
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
        for (const flag of [
          ...(resource.updateFlags ?? []),
          ...(resource.deleteFlags ?? []),
          ...(resource.actions ?? []).flatMap((a) => a.flags ?? []),
        ]) {
          expect(validTypes.has(flag.type)).toBe(true)
        }
      }
    })
  })

  describe('flag names', () => {
    test('are unique within each command', () => {
      for (const resource of resources) {
        const groups = [
          resource.createFlags,
          resource.listFlags,
          resource.getFlags,
          resource.updateFlags,
          resource.deleteFlags,
          ...(resource.actions ?? []).map((a) => a.flags),
        ]
        for (const flags of groups) {
          const names = (flags ?? []).map((f) => f.name)
          expect(new Set(names).size, `${resource.sdkNamespace} ${resource.name}`).toBe(
            names.length,
          )
        }
      }
    })

    test('never start with no-, which commander reads as a negated boolean', () => {
      const allFlags = resources.flatMap((r) => [
        ...(r.createFlags ?? []),
        ...(r.listFlags ?? []),
        ...(r.getFlags ?? []),
        ...(r.updateFlags ?? []),
        ...(r.deleteFlags ?? []),
        ...(r.actions ?? []).flatMap((a) => a.flags ?? []),
      ])
      expect(allFlags.filter((f) => f.name.startsWith('no-')).map((f) => f.name)).toEqual([])
    })
  })

  describe('v2 resources', () => {
    test('transfers and accounts use v2 namespace', () => {
      const transfers = find('transfers', 'v2')
      const accounts = find('accounts', 'v2')

      expect(transfers.sdkNamespace).toBe('v2')
      expect(accounts.sdkNamespace).toBe('v2')
    })

    test('v1Resources contains only v1 namespace resources', () => {
      expect(v1Resources.every((r) => r.sdkNamespace === 'v1')).toBe(true)
      expect(v1Resources.map((r) => r.name)).toEqual([
        'payment_intents',
        'webhook_endpoints',
        'charges',
        'subscriptions',
        'links',
        'checkout_sessions',
        'api_keys',
        'refunds',
        'subscription_intents',
        'payment_links',
        'disputes',
        'accounts',
        'movements',
        'invoices',
        'tax_returns',
        'refresh_intents',
        'payouts',
        'institutions',
        'link_intents',
        'tax_statements',
      ])
    })

    test('v2Resources contains only v2 namespace resources', () => {
      expect(v2Resources.every((r) => r.sdkNamespace === 'v2')).toBe(true)
      expect(v2Resources.map((r) => r.name)).toEqual([
        'transfers',
        'accounts',
        'account_verifications',
        'account_numbers',
        'movements',
        'checkout_sessions',
        'customers',
        'entities',
        'onboardings',
        'payment_intents',
        'payment_methods',
        'products',
        'subscriptions',
        'invoices',
        'account_statements',
        'recipients',
        'transfer_batches',
        'events',
        'setup_intents',
        'subscription_items',
        'invoice_lines',
        'simulate',
      ])
    })
  })

  describe('resource-specific verbs', () => {
    test('api_keys only supports list', () => {
      const apiKeys = find('api_keys', 'v1')
      expect(apiKeys.verbs).toEqual(['list'])
    })

    test('webhook_endpoints and links support delete', () => {
      const webhooks = find('webhook_endpoints', 'v1')
      const links = find('links', 'v1')

      expect(webhooks.verbs).toContain('delete')
      expect(links.verbs).toContain('delete')
    })

    test('v1 subscriptions and v1 accounts are read-only (get + list)', () => {
      expect(find('subscriptions', 'v1').verbs).toEqual(['get', 'list'])
      expect(find('accounts', 'v1').verbs).toEqual(['get', 'list'])
    })

    test('v2 accounts supports create and update', () => {
      expect(find('accounts', 'v2').verbs).toEqual(['create', 'get', 'list', 'update'])
    })

    test.each([
      ['payment_intents', 'v1'],
      ['checkout_sessions', 'v1'],
      ['checkout_sessions', 'v2'],
    ] as const)('%s (%s) declares expire as a confirmed action', (name, namespace) => {
      const resource = find(name, namespace)
      expect(resource.verbs).not.toContain('expire')
      const expire = resource.actions!.find((a) => a.name === 'expire')!
      expect(expire.sdkMethod).toBe('expire')
      expect(expire.confirm).toBe(true)
    })

    test('read-only resources expose only their SDK verbs', () => {
      expect(find('payouts', 'v1').verbs).toEqual(['get', 'list'])
      expect(find('institutions', 'v1').verbs).toEqual(['list'])
      expect(find('link_intents', 'v1').verbs).toEqual(['create'])
      expect(find('events', 'v2').verbs).toEqual(['get', 'list'])
      expect(find('setup_intents', 'v2').verbs).toEqual(['get'])
    })

    test('recipients support delete', () => {
      expect(find('recipients', 'v2').verbs).toContain('delete')
    })
  })

  describe('resource-specific flags', () => {
    test('checkout_sessions requires amount and currency', () => {
      const checkoutSessions = find('checkout_sessions', 'v1')
      const requiredFlags = checkoutSessions.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['amount', 'currency'])
    })

    test('transfers requires amount, currency, account-id and counterparty-account-number', () => {
      const transfers = find('transfers', 'v2')
      const requiredFlags = transfers.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual([
        'amount',
        'currency',
        'account-id',
        'counterparty-account-number',
      ])
    })

    test('webhook_endpoints requires url and enabled-events', () => {
      const webhooks = find('webhook_endpoints', 'v1')
      const requiredFlags = webhooks.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['url', 'enabled-events'])
    })

    test('webhook_endpoints enabled-events is string[] type', () => {
      const webhooks = find('webhook_endpoints', 'v1')
      const eventsFlag = webhooks.createFlags!.find((f) => f.name === 'enabled-events')!
      expect(eventsFlag.type).toBe('string[]')
    })

    test('webhook_endpoints supports test action with required type flag', () => {
      const webhooks = find('webhook_endpoints', 'v1')
      const testAction = webhooks.actions!.find((a) => a.name === 'test')!
      expect(testAction.sdkMethod).toBe('test')
      const requiredTestFlags = testAction.flags!.filter((f) => f.required).map((f) => f.name)
      expect(requiredTestFlags).toEqual(['type'])
    })

    test('refresh_intents create requires link-token', () => {
      const refreshIntents = find('refresh_intents', 'v1')
      expect(refreshIntents.verbs).toContain('create')
      const requiredFlags = refreshIntents.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['link-token'])
    })

    test('disputes create_document uploads the file inside the body', () => {
      const disputes = find('disputes', 'v1')
      const createDocument = disputes.actions!.find((a) => a.name === 'create_document')!
      expect(createDocument.sdkMethod).toBe('createDocument')
      expect(createDocument.fileAsArg).toBeUndefined()
      expect(createDocument.files).toEqual([
        expect.objectContaining({ field: 'file', required: true }),
      ])
    })

    test('account_verifications requires account-number and needs JWS', () => {
      const av = find('account_verifications', 'v2')
      expect(av.needsJws).toBe(true)
      const requiredFlags = av.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['account-number'])
    })

    test('account_numbers requires account-id for create', () => {
      const an = find('account_numbers', 'v2')
      const requiredFlags = an.createFlags!.filter((f) => f.required)
      expect(requiredFlags.map((f) => f.name)).toEqual(['account-id'])
    })

    test('movements requires account-id for get and list', () => {
      const movements = find('movements', 'v2')
      expect(movements.getFlags).toBeDefined()
      expect(movements.getFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'account-id',
      ])
      expect(movements.listFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'account-id',
      ])
    })

    test('movements uses nested sdkMethod path', () => {
      const movements = find('movements', 'v2')
      expect(movements.sdkMethod).toBe('accounts.movements')
    })

    test.each([
      ['payment_intents', 'v1', ['amount', 'currency']],
      ['accounts', 'v2', ['entity-id']],
      ['refunds', 'v1', ['resource-id', 'resource-type']],
      ['payment_links', 'v1', ['amount', 'currency']],
      ['checkout_sessions', 'v2', ['currency']],
      ['entities', 'v2', ['country-code', 'holder-name']],
      ['payment_intents', 'v2', ['amount', 'currency', 'payment-method']],
      ['products', 'v2', ['name']],
      ['recipients', 'v2', ['entity-id', 'account-number', 'holder-name']],
      ['link_intents', 'v1', ['country', 'holder-type', 'product']],
    ] as const)('%s (%s) required create flags', (name, namespace, expected) => {
      const resource = find(name, namespace)
      expect(resource.createFlags!.filter((f) => f.required).map((f) => f.name)).toEqual(expected)
    })

    test.each(['accounts', 'invoices', 'tax_returns', 'tax_statements', 'refresh_intents'])(
      'v1 %s requires link-token for get and list',
      (name) => {
        const resource = find(name, 'v1')
        expect(resource.getFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
          'link-token',
        ])
        expect(resource.listFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
          'link-token',
        ])
      },
    )

    test('v1 movements requires account-id and link-token for get and list', () => {
      const movements = find('movements', 'v1')
      expect(movements.sdkMethod).toBe('accounts.movements')
      expect(movements.getFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'account-id',
        'link-token',
      ])
      expect(movements.listFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'account-id',
        'link-token',
      ])
    })

    test('onboardings uses nested sdkMethod and requires entity-id', () => {
      const onboardings = find('onboardings', 'v2')
      expect(onboardings.sdkMethod).toBe('entities.onboardings')
      expect(onboardings.getFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'entity-id',
      ])
      expect(onboardings.listFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'entity-id',
      ])
    })

    test('account_statements uses nested sdkMethod, list only, requires account-id', () => {
      const statements = find('account_statements', 'v2')
      expect(statements.sdkMethod).toBe('accounts.accountStatements')
      expect(statements.verbs).toEqual(['list'])
      expect(statements.listFlags!.filter((f) => f.required).map((f) => f.name)).toEqual([
        'account-id',
      ])
    })
  })

  describe('actions', () => {
    const allActions = resources.flatMap((r) =>
      (r.actions ?? []).map((a) => ({ resource: r, action: a })),
    )

    test('action names are unique per resource and do not clash with verbs', () => {
      for (const resource of resources) {
        const names = (resource.actions ?? []).map((a) => a.name)
        expect(new Set(names).size).toBe(names.length)
        for (const name of names) {
          expect(resource.verbs).not.toContain(name)
        }
      }
    })

    test('destructive actions require confirmation', () => {
      const destructive = new Set([
        'cancel',
        'expire',
        'void',
        'pay',
        'finalize',
        'mark_uncollectible',
        'remove_lines',
        'detach_payment_method',
        'delete_document',
        'return',
        'submit_for_review',
      ])
      for (const { action } of allActions.filter(({ action }) => destructive.has(action.name))) {
        expect(action.confirm).toBe(true)
      }
    })

    test('upload actions take the file as a positional SDK argument', () => {
      const uploads = find('onboardings', 'v2').actions!.filter((a) => a.files?.length)
      expect(uploads.map((a) => a.name)).toEqual([
        'upload_document',
        'add_document',
        'upload_shareholder_document',
        'upload_legal_representative_document',
      ])
      for (const action of uploads) {
        expect(action.fileAsArg).toBe(true)
        expect(action.files).toEqual([expect.objectContaining({ field: 'file', required: true })])
      }
    })

    test('transfers return needs JWS and takes no id', () => {
      const returnAction = find('transfers', 'v2').actions!.find((a) => a.name === 'return')!
      expect(returnAction.needsJws).toBe(true)
      expect(returnAction.idArg).toBe(false)
    })

    test('nested write resources mark their parent id as a path param', () => {
      for (const [name, flag] of [
        ['subscription_items', 'subscription-id'],
        ['invoice_lines', 'invoice-id'],
      ] as const) {
        const resource = find(name, 'v2')
        for (const flags of [resource.createFlags, resource.updateFlags, resource.deleteFlags]) {
          if (flags) {
            expect(flags.find((f) => f.name === flag)?.pathParam).toBe(true)
          }
        }
      }
    })

    test('payment_methods create requires the four consent documents as files', () => {
      const files = find('payment_methods', 'v2').createFiles!
      expect(files.map((f) => f.field)).toEqual([
        'mx_direct_debit.consent_documents.contract',
        'mx_direct_debit.consent_documents.selfie',
        'mx_direct_debit.consent_documents.id_front',
        'mx_direct_debit.consent_documents.id_back',
      ])
      expect(files.every((f) => f.required)).toBe(true)
    })
  })
})
