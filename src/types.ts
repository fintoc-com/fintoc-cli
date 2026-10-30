import type { Buffer } from 'node:buffer'

export type FintocMode = 'test' | 'live'

export type FintocConfig = {
  secret_key?: string
  jws_private_key?: string
  key_name?: string
  expires_at?: string
  color?: boolean
}

export type Verb = 'create' | 'get' | 'list' | 'update' | 'delete'

export type FlagType = 'string' | 'integer' | 'boolean' | 'string[]' | 'map'

export type FlagDef = {
  name: string
  type: FlagType
  required?: boolean
  description?: string
  nestedPath?: string
  // Fills a path placeholder of a nested manager (e.g. {entity_id}). Always required, even with --from-json
  pathParam?: boolean
  // Hidden from help and not sent; using it prints this message as a warning
  deprecated?: string
}

// A multipart file field, passed as `--file <field>=<path>`. `field` is the dotted body path
export type FileDef = {
  field: string
  required?: boolean
  description?: string
}

export type ArgDef = {
  name: string
  description?: string
  // Sends the value in the request body under this key instead of as an SDK argument
  bodyField?: string
}

export type ActionDef = {
  name: string
  sdkMethod: string
  description: string
  // read: GET that returns an object. list: GET that returns a paginated list. write: anything else
  kind?: 'read' | 'list' | 'write'
  // Positional id passed as the first SDK argument. `false` when the SDK method takes no id
  idArg?: ArgDef | false
  extraArgs?: ArgDef[]
  flags?: FlagDef[]
  fromJson?: boolean
  files?: FileDef[]
  // Pass the `file` field as a positional SDK argument (after extraArgs) instead of inside the body
  fileAsArg?: boolean
  confirm?: boolean
  // Confirmation phrase with {resource} and {id} placeholders. Defaults to "<action> {resource} '{id}'"
  confirmPhrase?: string
  // Only for POST actions: the SDK sends it as the Idempotency-Key header
  idempotencyKey?: boolean
  needsJws?: boolean
  // Supports {resource} and {id} placeholders
  successMessage?: string
  priorityColumns?: string[]
}

export type ResourceDef = {
  name: string
  displayName: string
  pluralDisplayName?: string
  // Defaults to "Manage <plural>"
  description?: string
  cliCommand: string
  sdkMethod: string
  sdkNamespace: 'v1' | 'v2'
  verbs: Verb[]
  needsJws?: boolean
  priorityColumns: string[]
  createFlags?: FlagDef[]
  createFiles?: FileDef[]
  listFlags?: FlagDef[]
  getFlags?: FlagDef[]
  updateFlags?: FlagDef[]
  deleteFlags?: FlagDef[]
  getArg?: { name: string; description: string }
  actions?: ActionDef[]
}

export type SdkManager = {
  create?: (body: Record<string, unknown>) => Promise<unknown>
  get?: (id: string, params?: Record<string, unknown>) => Promise<unknown>
  list?: (params: Record<string, unknown>) => Promise<unknown>
  update?: (id: string, body: Record<string, unknown>) => Promise<unknown>
  delete?: (id: string, params?: Record<string, unknown>) => Promise<unknown>
}

export type UploadFile = {
  data: Buffer
  filename: string
  contentType?: string
}

export type Serializable = {
  serialize: () => Record<string, unknown>
}
