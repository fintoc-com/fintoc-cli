---
name: add-api-resource
description: Add or update public v1/v2 API resources, verbs, and flags in fintoc-cli. Also use to assess whether new API fields or a fintoc SDK bump require CLI changes.
---

# Add or update an API resource

## CLI model

Every resource is one `ResourceDef` entry in `src/resources/registry.ts`. `src/resources/factory.ts` turns it into `fintoc [v2] <resource> <verb>` commands that call the `fintoc` node SDK. The CLI only calls the published SDK, so a resource or verb can only be added once the SDK has it.

Check the SDK first. Look for the manager in `node_modules/fintoc/build/main/lib/core.d.ts` (`Fintoc` is v1, `FintocV2` is v2), or in its parent manager's `.js` if it is nested, and for its verbs in `XManager.methods = [...]` inside the manager's `.js`. If the manager or a verb you need is missing, run `npm install fintoc@latest`. If it is still missing, stop: it needs a fintoc-node release first.

## Choose the scope

| Change | Implementation |
| --- | --- |
| New resource | Append a registry entry at the end of the array. Copy `account_numbers` (v2, create and delete). |
| New verb | Add it to the entry's `verbs`, with its flags when it takes any. |
| New flag or filter | Add it to the verb's flags (`createFlags`, `listFlags`, `getFlags`, `testFlags`). |
| Nested resource | Use a dotted `sdkMethod`. Copy `movements`. |
| New field | Usually no change, since `get` and `--json` show every field. Add a flag only for a new create param or list filter, and touch `priorityColumns` only if the field matters in `list`. |

Do not rename or remove existing flags or verbs, since users' scripts depend on them.

## Registry entry

| Field | Rule |
| --- | --- |
| `name`, `cliCommand` | snake_case plural API name (`account_numbers`) |
| `displayName` | Singular, human readable (`account number`) |
| `sdkNamespace` | `'v1'` for `Fintoc`, `'v2'` for `FintocV2` |
| `sdkMethod` | camelCase manager property (`accountNumbers`). Nested managers use a dotted path (`accounts.movements`) |
| `verbs` | Only the ones in the manager's `methods`, out of `create`, `get`, `list`, `delete`, `expire`, `test` |
| `needsJws` | `true` when the API requires a JWS signature to create |
| `priorityColumns` | 1 to 6 fields for `list`, usually `id` first |
| `createFlags` | Must be non-empty when there is `create` |
| `getArg` | Only when `get` takes something other than an id (see `links`) |

Flags: `name` is kebab-case and is sent as snake_case, so it must match the API param. Use `nestedPath` for fields inside an object (`counterparty.account_number`). Set `required: true` only if the API requires it. For enum filters like `status`, link the object docs with a `DOCS_*_URL` constant from `src/lib/constants.ts` instead of listing values.

Watch out for:

- Nested managers only work for `get` and `list`. Limit `verbs` to those two and add the parent id as a required flag to each verb's flags (`getFlags`, `listFlags`), matching the SDK placeholder (`account-id` → `{account_id}`).
- A flag segment that starts with a digit (`address-line-1`) breaks the flag. Use a letter-only name and put the API param in `nestedPath` (`address_line_1`).
- The help text pluralizes with `${displayName}s`, so an irregular plural (`entity` → "entitys") reads wrong. Keep it and mention it in the PR.
- Anything the factory does not support (an `update` verb, new flag types) stays out. Changing the factory needs its own design and review, so mention it in the PR instead.

## Tests

In `src/resources/__tests__/registry.test.ts`:

- Update the hardcoded counts and name lists in `schema validation` and `v2 resources`. A new v2 resource also goes in the `v2Names` set.
- Add a test under `resource-specific flags` for required flags, JWS or a dotted `sdkMethod`.
- If the `name` already exists in the other namespace, look entries up by `name` and `sdkNamespace`, and make the `v2Names` check compare both, so the v1 entry stays covered.

Some tests run against the compiled `dist/`, so build before running them. Then check the generated help:

```sh
npm run lint && npm run typecheck && npm run build && npm run test
node dist/index.js [v2] <resource> <verb> --help
```

## Documentation and PR

Add or update the row in the Resources table in `README.md`, with v1 rows before v2 rows.

Follow the repository's PR template and mention the SDK bump and anything left out. Keep CLI version bumps and releases separate from resource changes.
