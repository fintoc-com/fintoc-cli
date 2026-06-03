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

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `fintoc login`       | Authenticate with your API key |
| `fintoc logout`      | Remove stored credentials      |
| `fintoc config show` | Show active configuration      |

### Resources

Resources follow the pattern `fintoc <resource> <action> [flags]`.

| Resource                   | Actions                   |
| -------------------------- | ------------------------- |
| `payment_intents`          | get, list                 |
| `charges`                  | create, get, list         |
| `webhook_endpoints`        | create, get, list, delete |
| `checkout_sessions`        | create, get, expire       |
| `subscriptions`            | get, list                 |
| `links`                    | get, list, delete         |
| `api_keys`                 | list                      |
| `v2 transfers`             | create, get, list         |
| `v2 accounts`              | get, list                 |
| `v2 account_verifications` | create, get, list         |
| `v2 account_numbers`       | create, get, list, delete |
| `v2 movements`             | get, list                 |

### Utilities

| Command                  | Description                               |
| ------------------------ | ----------------------------------------- |
| `fintoc doctor`          | Check CLI setup and connectivity          |
| `fintoc open dashboard`  | Open the Fintoc dashboard in your browser |
| `fintoc webhooks listen` | Listen for webhook events in real time    |
| `fintoc trigger`         | Trigger a test event                      |

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

### V2 transfers (JWS required)

Transfers require a JWS private key for `create`:

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
