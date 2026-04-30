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

```bash
npm install -g @fintoc/cli
fintoc --version
```

Requires Node.js >= 22.

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
2. `FINTOC_SECRET_KEY` environment variable
3. `~/.fintoc/config.toml` (saved via `fintoc login`)

```bash
fintoc login                                        # Interactive login
fintoc login --api-key sk_test_...                   # Non-interactive login
fintoc payment_intents list --api-key sk_test_...    # One-off override
fintoc config show                                   # Show active configuration
fintoc logout                                        # Remove stored credentials
```

## Commands

### Auth

| Command | Description |
|---|---|
| `fintoc login` | Authenticate with your API key |
| `fintoc logout` | Remove stored credentials |
| `fintoc config show` | Show active configuration |

### Resources

Resources follow the pattern `fintoc <resource> <action> [flags]`.

| Resource | Actions |
|---|---|
| `payment_intents` | get, list |
| `charges` | create, get, list |
| `webhook_endpoints` | create, get, list, delete |
| `checkout_sessions` | create, get, expire |
| `subscriptions` | get, list |
| `links` | get, list, delete |
| `api_keys` | list |
| `v2 transfers` | create, get, list |
| `v2 accounts` | get, list |

### Utilities

| Command | Description |
|---|---|
| `fintoc doctor` | Check CLI setup and connectivity |
| `fintoc open dashboard` | Open the Fintoc dashboard in your browser |

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

Flags can be mixed with `--from-json` — flag values take precedence over JSON keys.

### Delete with confirmation

```bash
fintoc webhook_endpoints delete we_test_abc123
fintoc webhook_endpoints delete we_test_abc123 --yes   # Skip confirmation (CI-friendly)
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