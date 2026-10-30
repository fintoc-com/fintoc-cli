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
| Any other SDK method (`cancel`, `expire`, `submit`, uploads) | Add an entry to `actions`. Copy `v2 invoices` (body flags), `v2 onboardings` (extra positional args and files) or `v1 refunds` (`voucher_url`, a read). |
| New flag or filter | Add it to the verb's flags (`createFlags`, `listFlags`, `getFlags`, `updateFlags`, `deleteFlags`) or to the action's `flags`. |
| Nested resource | Use a dotted `sdkMethod` and a `pathParam` flag for the parent id. Copy `movements` or `subscription_items`. |
| File upload | Add `createFiles` or the action's `files`. Set `fileAsArg` only when the SDK takes the file as a positional argument instead of inside the body. |
| New field | Usually no change, since `get` and `--json` show every field. Add a flag only for a new create param or list filter, and touch `priorityColumns` only if the field matters in `list`. |

Do not rename or remove existing flags or verbs, since users' scripts depend on them. To retire a flag, set `deprecated` with the reason: it is hidden from help, not sent, and warns when used. `backward-compat.test.ts` enforces this against `fixtures/published-surface.json`: removing a command, flag or option, changing a flag's type or the positional arguments, making a flag required, or adding a confirmation fails. After adding commands or flags, run `UPDATE_CLI_SURFACE=1 npm run test` so they are protected too. That only adds to the fixture, so it cannot hide a breaking change. Set `idempotencyKey: true` on actions that send a POST.

## Registry entry

| Field | Rule |
| --- | --- |
| `name`, `cliCommand` | snake_case plural API name (`account_numbers`) |
| `displayName` | Singular, human readable (`account number`) |
| `sdkNamespace` | `'v1'` for `Fintoc`, `'v2'` for `FintocV2` |
| `sdkMethod` | camelCase manager property (`accountNumbers`). Nested managers use a dotted path (`accounts.movements`) |
| `verbs` | Only the ones in the manager's `methods`, out of `create`, `get`, `list`, `update`, `delete` |
| `actions` | Every other method. `kind` is `read` or `list` for GETs, `write` (default) otherwise. Set `confirm` for destructive ones |
| `needsJws` | `true` when the API requires a JWS signature to create. Actions that sign set their own `needsJws` |
| `priorityColumns` | 1 to 6 fields for `list`, usually `id` first |
| `createFlags` | Must be non-empty when there is `create` |
| `getArg` | Only when `get` takes something other than an id (see `links`) |

Flags: `name` is kebab-case and is sent as snake_case, so it must match the API param. Use `nestedPath` for fields inside an object (`counterparty.account_number`). Set `required: true` only if the API requires it. Use type `map` for key-value objects such as `metadata` (`--metadata key=value`, repeatable). For enum filters like `status`, link the object docs with a `DOCS_*_URL` constant from `src/lib/constants.ts` instead of listing values.

Watch out for:

- Nested managers fill their parent id from a flag that matches the SDK placeholder (`account-id` → `{account_id}`). Mark it `pathParam: true` so it stays required even with `--from-json`.
- A flag segment that starts with a digit (`address-line-1`) breaks the flag. Use a letter-only name and put the API param in `nestedPath` (`address_line_1`).
- The help text pluralizes with `${displayName}s`. Set `pluralDisplayName` for irregular plurals (`entity` → `entities`).
- When v1 and v2 share a resource name, give both a `description` that says which API they belong to (`Manage accounts (Transfers API)`).
- Anything the factory does not support (new flag types, arrays of objects as flags) goes through `--from-json`. Changing the factory needs its own design and review, so mention it in the PR instead.

## Style

Every command must read like the rest of the CLI. `registry.test.ts` checks most of these rules:

- Descriptions are sentence case with no trailing period. Write "ID" in uppercase.
- Flags reuse the wording of the same flag elsewhere. The shared ones (`recipient-account-*`, `sender-account-*`, `business-profile-*`, `customer-email`, `metadata`, ...) must match exactly.
- Values: closed lists as `(a, b, c)`, examples as `(e.g., x)`, long or changing lists as `(see ${DOCS_*_URL})`. Country rules go last after a semicolon: `(checking_account, sight_account; required in Chile)` or `(Mexico only)`.
- Amounts say "in the smallest currency unit". Dates say `(ISO 8601)` and timestamps `(ISO 8601 datetime, UTC)`. Date filters are inclusive: "Show results created on or after this date (ISO 8601)".
- Update flags reuse the create description, without "New". Booleans describe the true case only.
- A command that acts on one object takes its ID as the first positional. If the SDK expects it in the body, set `bodyField` on the `ArgDef`.
- Write actions have a `successMessage` like `"{resource} '{id}' canceled"`. Confirmations read "Are you sure you want to <action> {resource} '{id}'?"; set `confirmPhrase` when that reads wrong (`remove lines from {resource} '{id}'`).
- Path placeholders are `pathParam: true`, so they stay required and show as `in: path` in `fintoc commands --json`.

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
