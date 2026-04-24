export type FintocConfig = {
  secret_key?: string
  jws_private_key?: string
}

export type Verb = 'create' | 'get' | 'list' | 'delete'

export type FlagType = 'string' | 'number' | 'boolean' | 'string[]'

export type FlagDef = {
  name: string
  type: FlagType
  required?: boolean
  description?: string
}

export type ResourceDef = {
  name: string
  cliCommand: string
  sdkMethod: string
  sdkNamespace: 'v1' | 'v2'
  verbs: Verb[]
  priorityColumns: string[]
  createFlags?: FlagDef[]
  listFlags?: FlagDef[]
}
