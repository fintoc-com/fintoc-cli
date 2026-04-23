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

# Check your current configuration
fintoc config

# Remove stored credentials
fintoc logout
```

## Authentication

The CLI resolves your API key in this order:

1. `--api-key` flag (inline, per-command)
2. `FINTOC_SECRET_KEY` environment variable
3. `~/.fintoc/config.toml` (saved via `fintoc login`)

### `fintoc login`

Interactive prompt to save your API key. Validates the key against the Fintoc API before storing it.

```bash
fintoc login
# Or non-interactively:
fintoc login --api-key sk_test_...
```

### `fintoc logout`

Removes stored credentials from `~/.fintoc/config.toml`.

### `fintoc config`

Displays the active configuration: organization, mode (test/live), masked API key, and credential source.

```
$ fintoc config
  Organization:  Acme Corp
  Mode:          test
  Secret key:    sk_test_····
  API version:   2023-11-15
  Config path:   ~/.fintoc/config.toml
  Source:        config file
```

## Development

```bash
npm install
npm run build        # Bundle to dist/
npm run test         # Run tests
npm run lint         # ESLint + Prettier
npm run typecheck    # Type-check without emitting
```
