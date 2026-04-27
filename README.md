# Fintoc CLI

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

# Create a charge from a JSON file
fintoc charges create --from-json payload.json

# Check your setup
fintoc doctor
```

## Authentication

The CLI resolves your API key in this order:

1. `--api-key` flag (inline, per-command)
2. `FINTOC_SECRET_KEY` environment variable
3. `~/.fintoc/config.toml` (saved via `fintoc login`)

```bash
# Interactive login
fintoc login

# Non-interactive
fintoc login --api-key sk_test_...

# One-off override
fintoc payment_intents list --api-key sk_test_...

# Show active configuration
fintoc config

# Remove stored credentials
fintoc logout
```

## Resources

| Resource | create | get | list | delete | expire |
|----------|:------:|:---:|:----:|:------:|:------:|
| `payment_intents` | | ✔ | ✔ | | |
| `transfers` | ✔ | ✔ | ✔ | | |
| `accounts` | | ✔ | ✔ | | |
| `webhook_endpoints` | ✔ | ✔ | ✔ | ✔ | |
| `charges` | ✔ | ✔ | ✔ | | |
| `subscriptions` | | ✔ | ✔ | | |
| `links` | | ✔ | ✔ | ✔ | |
| `checkout_sessions` | ✔ | ✔ | | | ✔ |
| `api_keys` | | | ✔ | | |

### Examples

```bash
# Get a resource by ID
fintoc payment_intents get pi_test_abc123

# List with filters
fintoc charges list --status succeeded --since 2026-01-01

# Create with flags
fintoc transfers create --amount 10000 --currency CLP --counterparty-account-number 12345678

# Create from a JSON file
fintoc checkout_sessions create --from-json session.json

# Pipe from stdin
cat payload.json | fintoc charges create --from-json -

# Mix JSON body with flag overrides
fintoc charges create --from-json base.json --amount 5000

# Delete with confirmation skip
fintoc webhook_endpoints delete we_test_abc123 --yes
```

### Output

By default the CLI prints a formatted table. Use `--json` for machine-readable output:

```bash
fintoc payment_intents list --json
fintoc charges get ch_test_abc123 --json
```

## Utilities

```bash
# Diagnose setup and connectivity
fintoc doctor

# Open the Fintoc dashboard in your browser
fintoc open dashboard
```

## Development

```bash
npm install
npm run build        # Bundle to dist/
npm run test         # Run tests
npm run lint         # ESLint + Prettier
npm run typecheck    # Type-check without emitting
```
