# Fintoc CLI

[![npm version](https://img.shields.io/npm/v/@fintoc/cli.svg)](https://www.npmjs.com/package/@fintoc/cli)

Build, test, and manage your Fintoc integration right from the terminal.

![demo](docs/demo.gif)

**With the Fintoc CLI, you can:**

- Create, list, and manage payment intents, charges, transfers, and more
- Authenticate and store credentials securely in `~/.fintoc/config.toml`
- Diagnose setup issues with `fintoc doctor`
- Get machine-readable JSON output for scripts and CI/CD pipelines
- Pipe JSON payloads to create commands with `--from-json`

> **Early access** — This CLI is under active development (v0.x). Commands and flags may change between releases.

## Installation

### npm

```bash
npm install -g @fintoc/cli
fintoc --version
```

Requires Node.js >= 22.

### Homebrew

```bash
brew install fintoc-com/tap/fintoc
```

## Getting started

```bash
# 1. Authenticate with your API key
fintoc login

# 2. Verify your setup
fintoc doctor

# 3. Start using Fintoc resources
fintoc payment_intents list
fintoc charges create --amount 5000 --currency CLP --subscription-id sub_test_abc123
```

## Authentication

The CLI resolves your API key in this order:

1. `--api-key` flag (inline, per-command)
2. `FINTOC_API_KEY` environment variable
3. `~/.fintoc/config.toml` (saved via `fintoc login`)

```bash
fintoc login                                         # Interactive login (test mode by default)
fintoc login --mode live                             # Authenticate in live mode
fintoc login --api-key sk_test_...                   # Non-interactive login
fintoc payment_intents list --api-key sk_test_...    # One-off override
fintoc config show                                   # Show active configuration
fintoc logout                                        # Remove stored credentials
```

## Commands

### Auth

| Command                           | Description                           |
| --------------------------------- | ------------------------------------- |
| `fintoc login`                    | Authenticate with your Fintoc API key |
| `fintoc logout`                   | Remove stored credentials             |
| `fintoc config show`              | Show current configuration            |
| `fintoc config set <key> <value>` | Set a config value                    |

### Resources

Resources follow the pattern `fintoc [v2] <resource> <action> [args] [flags]`. Actions that act on a single object take its ID as the first argument.

| Resource                   | Actions                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment_intents`          | create, get, list, expire                                                                                                                    |
| `webhook_endpoints`        | create, get, list, update, delete, test                                                                                                      |
| `charges`                  | create, get, list, update, cancel                                                                                                            |
| `subscriptions`            | get, list                                                                                                                                    |
| `links`                    | get, list, update, delete, exchange                                                                                                          |
| `checkout_sessions`        | create, get, expire                                                                                                                          |
| `api_keys`                 | list                                                                                                                                         |
| `refunds`                  | create, get, list, cancel, voucher_url                                                                                                       |
| `subscription_intents`     | create, get, list                                                                                                                            |
| `payment_links`            | create, get, list, cancel                                                                                                                    |
| `disputes`                 | get, list, submit_for_review, create_document                                                                                                |
| `accounts`                 | get, list                                                                                                                                    |
| `movements`                | get, list                                                                                                                                    |
| `invoices`                 | get, list                                                                                                                                    |
| `tax_returns`              | get, list                                                                                                                                    |
| `refresh_intents`          | create, get, list                                                                                                                            |
| `payouts`                  | get, list, resources                                                                                                                         |
| `institutions`             | list                                                                                                                                         |
| `link_intents`             | create                                                                                                                                       |
| `tax_statements`           | get, list                                                                                                                                    |
| `v2 transfers`             | create, get, list, receipt, return                                                                                                           |
| `v2 accounts`              | create, get, list, update                                                                                                                    |
| `v2 account_verifications` | create, get, list                                                                                                                            |
| `v2 account_numbers`       | create, get, list, update, delete                                                                                                            |
| `v2 movements`             | get, list                                                                                                                                    |
| `v2 checkout_sessions`     | create, get, list, expire                                                                                                                    |
| `v2 customers`             | create, get, list                                                                                                                            |
| `v2 entities`              | create, get, list, settlement_account                                                                                                        |
| `v2 onboardings`           | create, get, list, submit, upload_document, add_document, delete_document, upload_shareholder_document, upload_legal_representative_document |
| `v2 payment_intents`       | create, get, list, cancel, voucher_url, check_eligibility                                                                                    |
| `v2 payment_methods`       | create, get, list, cancel, mandate_document                                                                                                  |
| `v2 products`              | create, get, list, update                                                                                                                    |
| `v2 subscriptions`         | create, get, list, update, cancel, detach_payment_method                                                                                     |
| `v2 invoices`              | create, get, list, update, finalize, pay, void, mark_uncollectible, add_lines, remove_lines                                                  |
| `v2 account_statements`    | list                                                                                                                                         |
| `v2 recipients`            | create, get, list, update, delete                                                                                                            |
| `v2 transfer_batches`      | create, get, list                                                                                                                            |
| `v2 events`                | get, list                                                                                                                                    |
| `v2 setup_intents`         | get                                                                                                                                          |
| `v2 subscription_items`    | create, update, delete                                                                                                                       |
| `v2 invoice_lines`         | update                                                                                                                                       |
| `v2 simulate`              | receive_transfer                                                                                                                             |

### Utilities

| Command                  | Description                              |
| ------------------------ | ---------------------------------------- |
| `fintoc doctor`          | Check CLI setup and connectivity         |
| `fintoc open dashboard`  | Open the Fintoc dashboard                |
| `fintoc webhooks listen` | Listen for webhook events in real time   |
| `fintoc trigger`         | Trigger a test event                     |
| `fintoc commands`        | List all commands (`--json` for details) |

## Usage examples

### List and filter resources

```bash
fintoc charges list --status succeeded --since 2026-01-01 --limit 5
```

### Get a resource by ID

```bash
fintoc payment_intents get pi_test_abc123
```

### Create with flags

```bash
fintoc charges create --amount 5000 --currency CLP --subscription-id sub_test_abc123
```

### Create with JSON

```bash
fintoc charges create --from-json payload.json
cat payload.json | fintoc charges create --from-json -
```

Flags can be mixed with `--from-json` — flag values take precedence over JSON keys. Objects deep-merge, but arrays are replaced wholesale: a flag that writes an array overwrites the JSON array completely instead of merging element-by-element.

```bash
# payload.json: { "url": "https://example.com", "enabled_events": ["a", "b", "c"] }
fintoc webhook_endpoints create --from-json payload.json --enabled-events only
# → sent as { url: "https://example.com", enabled_events: ["only"] }
```

### Delete with confirmation

```bash
fintoc webhook_endpoints delete we_test_abc123
fintoc webhook_endpoints delete we_test_abc123 --yes   # Skip confirmation (CI-friendly)
```

### Update

```bash
fintoc v2 products update prod_test_abc123 --name "Plan Pro"
fintoc v2 invoices update in_test_abc123 --metadata order_id=123 --metadata channel=web
```

`--metadata` and the other `key=value` flags are repeatable and build an object, one key per flag.

### Arrays of objects

Fields that are arrays of objects (subscription `items`, invoice `lines`, batch `transfers`) go in `--from-json`; the scalar fields also have flags:

```bash
# items.json: { "items": [{ "price_data": { ... }, "quantity": 1 }] }
fintoc v2 subscriptions create --customer cus_test_abc123 --from-json items.json
```

### Resource actions

Actions such as `cancel`, `pay`, `void` or `voucher_url` follow the same pattern: the ID of the object goes first as a positional argument. Actions on an existing object that move money or can't be undone (`cancel`, `expire`, `pay`, `void`, `finalize`, `return`, ...) ask for confirmation, like `delete`; use `--yes` to skip it:

```bash
fintoc refunds cancel re_test_abc123 --yes
fintoc v2 invoices pay in_test_abc123 --payment-method pm_test_abc123
fintoc v2 payment_intents voucher_url pi_test_abc123
fintoc payouts resources po_test_abc123 --resource-type payment_intent
```

### Upload files

Multipart operations take one `--file <field>=<path>` per file. Run the command with `--help` to see its fields:

```bash
fintoc v2 onboardings upload_document onb_test_abc123 proof_of_address \
  --entity-id ent_test_abc123 --file file=./proof.pdf
```

### Scripting and AI agents

- `fintoc --json commands` lists every command with its arguments, flags (type, API parameter and whether it goes in the path, query or body), options and aliases.
- With `--json`, results go to stdout and errors go to stderr as `{"error": {"type", "code", "param", "message"}}`, and nothing else is written to stderr (except for `webhooks listen`, which streams status lines). Usage errors have `type: "usage_error"` and a stable `code` such as `missing_flag`, `invalid_value`, `unknown_option`, `unknown_command` or `missing_command`.
- Without a TTY the CLI never prompts: commands that need confirmation fail until you pass `--yes`. When the API key is live, the confirmation says so.
- `list` returns up to `--limit` results. Without `--json` it warns on stderr when there may be more.
- `create` and actions that send a POST (`pay`, `cancel`, `return`, ...) accept `--idempotency-key`, so a retried request does not run twice.
- Resources and actions also answer to kebab-case (`payment-intents`, `submit-for-review`). Boolean flags work bare (`--active`) or with a value (`--active false`), and list flags take comma-separated or repeated values.

### Trigger test events

Fire a test event against your account — useful for exercising webhook handlers without producing real activity. Combine `--override` (dot-notation, repeatable) and `--from-json` to shape the payload; flags take precedence over JSON, and arrays are replaced wholesale (same semantics as `create --from-json`).

```bash
fintoc trigger payment_intent.succeeded
fintoc trigger payment_intent.succeeded --override amount=5000 --override currency=CLP
fintoc trigger payment_intent.succeeded --override metadata.order_id=abc123
fintoc trigger payment_intent.succeeded --from-json overrides.json
```

### Listen for webhooks

You can listen for webhook events locally in real time without the need to set up any additional services. By default, all events are listened to, but you can filter by specific event types or forward them to a local endpoint for testing.

```bash
fintoc webhooks listen
fintoc webhooks listen --events payment.succeeded,payment.failed
fintoc webhooks listen --forward-to http://localhost:3000/webhooks
```

### Commands that need a JWS key

`v2 transfers create`, `v2 transfers return`, `v2 transfer_batches create` and `v2 account_verifications create` are signed with a JWS private key:

```bash
fintoc v2 transfers create --amount 10000 --currency CLP \
  --account-id acc_test_abc123 \
  --counterparty-account-number 12345678 \
  --counterparty-institution-id cl_banco_estado \
  --jws-private-key ~/path/to/private_key.pem
```

The JWS key can also be set in `~/.fintoc/config.toml` as `jws_private_key`.

### JSON output

Use `--json` for machine-readable output. Use `--no-color` to disable colored output.

```bash
fintoc payment_intents list --json
fintoc v2 accounts get acc_test_abc123 --json
```

### Discovering flags

Every command documents its available flags:

```bash
fintoc charges create --help
fintoc v2 transfers list --help
```

## Documentation

- [Fintoc API Reference](https://docs.fintoc.com)
- [Get your API keys](https://dashboard.fintoc.com/api-keys)

## Feedback

If you have any feedback, [open an issue](https://github.com/fintoc-com/fintoc-cli/issues).

## Contributing

See [Developing the Fintoc CLI](../../wiki/developing-the-fintoc-cli) for more info on how to make contributions to this project.

## License

[BSD-3-Clause](LICENSE.md)
