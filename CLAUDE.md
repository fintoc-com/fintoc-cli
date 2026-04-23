# Fintoc CLI

## Project
- Node.js CLI tool, ESM (`"type": "module"`)
- TypeScript, bundled with tsup to `dist/index.js`
- Runtime deps: commander, fintoc, smol-toml, @inquirer/prompts

## Commands
- `npm run build` — build to dist/
- `npm run test` — run tests (requires build first)
- `npm run lint` — ESLint + Prettier check
- `npm run lint:fix` — auto-fix lint + format
- `npm run typecheck` — type-check without emitting

## Structure
- `src/index.ts` — entry point, Commander setup
- `src/commands/` — one file per command
- `src/resources/` — resource registry + command factory
- `src/lib/` — shared utilities (auth, config, output, errors)
- `src/types.ts` — shared type definitions
- `tests/` — Vitest tests

## Conventions
- ESLint config uses `@antfu/eslint-config` (same as dashboard)
- Prettier runs as ESLint rule (no separate .prettierrc)
- No semicolons, single quotes, printWidth 100
- `no-console: error` — use proper output utilities instead
