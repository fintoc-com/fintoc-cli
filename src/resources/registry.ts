import type { ResourceDef } from '../types.js'

export const resources: ResourceDef[] = [
  {
    name: 'payment_intents',
    displayName: 'payment intent',
    cliCommand: 'payment_intents',
    sdkMethod: 'paymentIntents',
    sdkNamespace: 'v1',
    verbs: ['create', 'get', 'list'],
    priorityColumns: ['id', 'amount', 'currency', 'status', 'created_at'],
    createFlags: [
      {
        name: 'amount',
        type: 'number',
        required: true,
        description: 'Amount in smallest currency unit',
      },
      {
        name: 'currency',
        type: 'string',
        required: true,
        description: 'Currency code (e.g., CLP, MXN)',
      },
      {
        name: 'customer-email',
        type: 'string',
        description: 'Customer email address',
      },
    ],
    listFlags: [
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status (pending, succeeded, failed, expired)',
      },
      {
        name: 'since',
        type: 'string',
        description: 'Show results created after this date (ISO 8601)',
      },
      {
        name: 'until',
        type: 'string',
        description: 'Show results created before this date (ISO 8601)',
      },
    ],
  },
  {
    name: 'transfers',
    displayName: 'transfer',
    cliCommand: 'transfers',
    sdkMethod: 'transfers',
    sdkNamespace: 'v2',
    verbs: ['create', 'get', 'list'],
    needsJws: true,
    priorityColumns: ['id', 'amount', 'currency', 'status', 'created_at'],
    createFlags: [
      {
        name: 'amount',
        type: 'number',
        required: true,
        description: 'Amount in smallest currency unit',
      },
      {
        name: 'currency',
        type: 'string',
        required: true,
        description: 'Currency code (e.g., CLP)',
      },
      {
        name: 'counterparty-account-number',
        type: 'string',
        required: true,
        description: 'Destination account number',
      },
    ],
    listFlags: [
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status (pending, succeeded, failed, rejected)',
      },
      {
        name: 'since',
        type: 'string',
        description: 'Show results created after this date (ISO 8601)',
      },
      {
        name: 'until',
        type: 'string',
        description: 'Show results created before this date (ISO 8601)',
      },
    ],
  },
  {
    name: 'accounts',
    displayName: 'account',
    cliCommand: 'accounts',
    sdkMethod: 'accounts',
    sdkNamespace: 'v2',
    verbs: ['get', 'list'],
    priorityColumns: ['id', 'name', 'type', 'currency', 'balance', 'status'],
    listFlags: [{ name: 'type', type: 'string', description: 'Filter by account type' }],
  },
  {
    name: 'webhook_endpoints',
    displayName: 'webhook endpoint',
    cliCommand: 'webhook_endpoints',
    sdkMethod: 'webhookEndpoints',
    sdkNamespace: 'v1',
    verbs: ['create', 'get', 'list', 'delete'],
    priorityColumns: ['id', 'url', 'status', 'enabled_events', 'created_at'],
    createFlags: [
      {
        name: 'url',
        type: 'string',
        required: true,
        description: 'Endpoint URL to receive webhooks',
      },
      {
        name: 'enabled-events',
        type: 'string[]',
        required: true,
        description: 'Events to subscribe to (comma-separated)',
      },
      { name: 'description', type: 'string', description: 'Description of the webhook endpoint' },
    ],
    listFlags: [],
  },
  {
    name: 'charges',
    displayName: 'charge',
    cliCommand: 'charges',
    sdkMethod: 'charges',
    sdkNamespace: 'v1',
    verbs: ['create', 'get', 'list'],
    priorityColumns: ['id', 'amount', 'currency', 'status', 'created_at'],
    createFlags: [
      {
        name: 'amount',
        type: 'number',
        required: true,
        description: 'Amount in smallest currency unit',
      },
      {
        name: 'currency',
        type: 'string',
        required: true,
        description: 'Currency code (e.g., CLP, MXN)',
      },
    ],
    listFlags: [
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status (pending, in_progress, succeeded, failed)',
      },
      {
        name: 'since',
        type: 'string',
        description: 'Show results created after this date (ISO 8601)',
      },
      {
        name: 'until',
        type: 'string',
        description: 'Show results created before this date (ISO 8601)',
      },
      {
        name: 'subscription-id',
        type: 'string',
        description: 'Filter by subscription ID',
      },
    ],
  },
  {
    name: 'subscriptions',
    displayName: 'subscription',
    cliCommand: 'subscriptions',
    sdkMethod: 'subscriptions',
    sdkNamespace: 'v1',
    verbs: ['get', 'list'],
    priorityColumns: ['id', 'status', 'amount', 'currency', 'created_at'],
    listFlags: [
      {
        name: 'since',
        type: 'string',
        description: 'Show results created after this date (ISO 8601)',
      },
      {
        name: 'until',
        type: 'string',
        description: 'Show results created before this date (ISO 8601)',
      },
    ],
  },
  {
    name: 'links',
    displayName: 'link',
    cliCommand: 'links',
    sdkMethod: 'links',
    sdkNamespace: 'v1',
    verbs: ['get', 'list', 'delete'],
    priorityColumns: ['id', 'holder_name', 'institution', 'status', 'created_at'],
    listFlags: [
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status (active, inactive, login_required)',
      },
    ],
  },
  {
    name: 'api_keys',
    displayName: 'API key',
    cliCommand: 'api_keys',
    sdkMethod: 'apiKeys',
    sdkNamespace: 'v1',
    verbs: ['list'],
    priorityColumns: ['id', 'name', 'mode', 'last_four', 'created_at'],
    listFlags: [],
  },
]
