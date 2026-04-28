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

# List transfers (v2 resource)
fintoc v2 transfers list

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

Resources map to `fintoc <resource> <action> [flags]`. V2 API resources require the `v2` prefix: `fintoc v2 <resource> <action> [flags]`.

### V1 resources

| Resource | create | get | list | delete | expire |
|----------|:------:|:---:|:----:|:------:|:------:|
| `payment_intents` | | ✔ | ✔ | | |
| `webhook_endpoints` | ✔ | ✔ | ✔ | ✔ | |
| `charges` | ✔ | ✔ | ✔ | | |
| `subscriptions` | | ✔ | ✔ | | |
| `links` | | ✔ | ✔ | ✔ | |
| `checkout_sessions` | ✔ | ✔ | | | ✔ |
| `api_keys` | | | ✔ | | |

### V2 resources (require `v2` prefix)

| Resource | create | get | list |
|----------|:------:|:---:|:----:|
| `transfers` | ✔ | ✔ | ✔ |
| `accounts` | | ✔ | ✔ |

### Command patterns

```bash
# get — fetch a single resource by ID
fintoc <resource> get <id>
fintoc v2 <resource> get <id>

# list — list resources with optional filters
fintoc <resource> list [--status <value>] [--since <date>] [--until <date>] [--limit <n>]
fintoc v2 <resource> list [--status <value>] [--limit <n>]

# create — create a resource with flags or JSON
fintoc <resource> create --<flag> <value> ...
fintoc <resource> create --from-json <file|->

# delete — delete a resource (webhook_endpoints, links)
fintoc <resource> delete <id> [--yes]

# expire — expire a resource (checkout_sessions)
fintoc <resource> expire <id> [--yes]
```

### Examples

```bash
# Get a resource by ID
fintoc payment_intents get pi_test_abc123

# List with filters (comma-separated for multiple values)
fintoc charges list --status succeeded,failed --since 2026-01-01

# Create a v2 transfer
fintoc v2 transfers create --amount 10000 --currency CLP \
  --account-id acc_test_abc123 \
  --counterparty-account-number 12345678 \
  --counterparty-institution-id cl_banco_estado \
  --jws-private-key ~/path/to/private_key.pem

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
fintoc v2 accounts get acc_test_abc123 --json
```

### Discovering flags

Each command exposes its available flags via `--help`:

```bash
fintoc charges create --help
fintoc v2 transfers list --help
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
