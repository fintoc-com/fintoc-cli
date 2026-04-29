# Fintoc CLI

> **Early access** — This CLI is under active development (v0.x). Commands and flags may change between releases. [Report issues or feedback](https://github.com/fintoc-com/fintoc-cli/issues).

Manage your Fintoc resources from the terminal.

## Installation

```bash
npm install -g @fintoc/cli
```

Requires Node.js >= 22.

## Quick start

```bash
# Authenticate with your API key
fintoc login

# List payment intents
fintoc payment_intents list

# Get a resource by ID
fintoc payment_intents get pi_test_abc123

# Create a charge
fintoc charges create --amount 5000 --currency CLP --subscription-id sub_test_abc123

# Check your setup
fintoc doctor
```

Run `fintoc` or `fintoc --help` to see all available commands.

## Authentication

The CLI resolves your API key in this order:

1. `--api-key` flag (inline, per-command)
2. `FINTOC_SECRET_KEY` environment variable
3. `~/.fintoc/config.toml` (saved via `fintoc login`)

```bash
# Interactive login (prompts for key)
fintoc login

# Non-interactive login
fintoc login --api-key sk_test_...

# One-off override
fintoc payment_intents list --api-key sk_test_...

# Show active configuration
fintoc config

# Remove stored credentials
fintoc logout
```

## Commands

### Resources

Resources follow the pattern `fintoc <resource> <action> [flags]`. V2 API resources use the `v2` prefix.

#### V1

| Resource | create | get | list | delete | expire |
|---|:---:|:---:|:---:|:---:|:---:|
| `payment_intents` | | ✔ | ✔ | | |
| `webhook_endpoints` | ✔ | ✔ | ✔ | ✔ | |
| `charges` | ✔ | ✔ | ✔ | | |
| `subscriptions` | | ✔ | ✔ | | |
| `links` | | ✔ | ✔ | ✔ | |
| `checkout_sessions` | ✔ | ✔ | | | ✔ |
| `api_keys` | | | ✔ | | |

#### V2

| Resource | create | get | list |
|---|:---:|:---:|:---:|
| `v2 transfers` | ✔ | ✔ | ✔ |
| `v2 accounts` | | ✔ | ✔ |

### Actions

```bash
# get — fetch by ID
fintoc payment_intents get <id>

# list — with optional filters
fintoc charges list --status succeeded --since 2026-01-01 --limit 5

# create — with flags or JSON
fintoc charges create --amount 5000 --currency CLP --subscription-id sub_test_abc123
fintoc charges create --from-json payload.json
cat payload.json | fintoc charges create --from-json -

# delete — with confirmation
fintoc webhook_endpoints delete <id>
fintoc webhook_endpoints delete <id> --yes   # skip confirmation (CI-friendly)

# expire — with confirmation
fintoc checkout_sessions expire <id>
```

Flags can be mixed with `--from-json` — flag values take precedence over JSON keys.

### V2 transfers

Transfers require a JWS private key for `create`:

```bash
fintoc v2 transfers create --amount 10000 --currency CLP \
  --account-id acc_test_abc123 \
  --counterparty-account-number 12345678 \
  --counterparty-institution-id cl_banco_estado \
  --jws-private-key ~/path/to/private_key.pem
```

The JWS key can also be set in `~/.fintoc/config.toml` as `jws_private_key`.

### Output

By default the CLI prints a formatted table. Use `--json` for machine-readable output:

```bash
fintoc payment_intents list --json
fintoc v2 accounts get acc_test_abc123 --json
```

Use `--no-color` to disable colored output.

### Discovering flags

Each command documents its available flags via `--help`:

```bash
fintoc charges create --help
fintoc v2 transfers list --help
```

## Utilities

```bash
# Diagnose setup and connectivity
fintoc doctor

# Open the Fintoc dashboard
fintoc open dashboard
```

## Development

```bash
npm install
npm run build        # Bundle to dist/
npm run test         # Run tests (requires build)
npm run lint         # ESLint + Prettier
npm run typecheck    # Type-check without emitting
```
