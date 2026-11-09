# Fintoc CLI

## Project
- Node.js CLI tool, ESM (`"type": "module"`)
- TypeScript, bundled with tsup to `dist/index.js`
- Runtime deps: commander, fintoc, smol-toml, @inquirer/prompts, es-toolkit, ws, zod

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
- `src/**/__tests__/` — Vitest tests, colocated with source files
- `.agents/skills/` — agent skills, shared by Codex and Claude Code (`.claude/skills` links here)

## Conventions
- ESLint config uses `@antfu/eslint-config` (same as dashboard)
- Prettier runs as ESLint rule (no separate .prettierrc)
- No semicolons, single quotes, printWidth 100
- `no-console: error` — use proper output utilities instead

## Releases
Merging a PR to `main` with a `release:patch`, `release:minor` or `release:major` label
publishes a release, with notes from the PR's `## Release notes` section (see `RELEASE.md`).
Do not bump the version in feature PRs.

Pick one label by what CLI users get:

- `release:minor`: new commands, verbs or flags.
- `release:patch`: fixes to existing behavior, with no new public surface.
- `release:major`: removes or changes a command or flag incompatibly. `backward-compat.test.ts` blocks these, so agree on it with the team first.
- No label: changes CLI users don't get, such as tests, CI, docs or agent files.

Write `## Release notes` in English for CLI users: one bullet per change, naming what changed
(command, verb, flag or error), without internal details.
