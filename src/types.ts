export type FintocConfig = {
  secret_key?: string
  jws_private_key?: string
  color?: boolean
}

export type Verb = 'create' | 'get' | 'list' | 'delete' | 'expire'

export type FlagType = 'string' | 'number' | 'boolean' | 'string[]'

export type FlagDef = {
  name: string
  type: FlagType
  required?: boolean
  description?: string
  nestedPath?: string
}

export type ResourceDef = {
  name: string
  displayName: string
  cliCommand: string
  sdkMethod: string
  sdkNamespace: 'v1' | 'v2'
  verbs: Verb[]
  needsJws?: boolean
  priorityColumns: string[]
  createFlags?: FlagDef[]
  listFlags?: FlagDef[]
}

export type SdkManager = {
  create?: (body: Record<string, unknown>) => Promise<unknown>
  get?: (id: string) => Promise<unknown>
  list?: (params: Record<string, unknown>) => Promise<unknown>
  delete?: (id: string) => Promise<unknown>
  expire?: (id: string) => Promise<unknown>
}

export type Serializable = {
  serialize: () => Record<string, unknown>
}
