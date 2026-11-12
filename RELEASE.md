# Releasing

Automático al mergear a `main` un PR con label de release. Toma ~3–5 min.

## Cómo

1. Agrega al PR el label `release:patch`, `release:minor` o `release:major` (solo uno).
2. Escribe en la sección `## Release notes` del PR, en inglés, lo que verán quienes usan la CLI.
   Si queda vacía, se usan las notas autogeneradas de GitHub.
3. Mergea. Los PRs sin label no publican.

### Manual (respaldo)

1. https://github.com/fintoc-com/fintoc-cli/actions → **Release** → **Run workflow**.
2. `bump`: `patch` / `minor` / `major`. `release-notes`: markdown opcional.
3. **Run workflow**. Solo corre desde `main`.

## Qué hace

`Release` workflow (`release.yml`):

`resolve` decide bump y notas (inputs del dispatch o label y descripción del PR mergeado) →
`npm ci` + `lint` + `typecheck` + `build` + `test` →
[`release/prepare`](https://github.com/fintoc-com/release-action/tree/main/prepare) bumpea y pushea commit + tag a `main` (atómico) →
`npm publish --access public --provenance` →
[`release/finalize`](https://github.com/fintoc-com/release-action/tree/main/finalize) crea la GitHub Release.

Eso dispara automáticamente `Update Homebrew tap` (`update-homebrew.yml`):

Espera propagación de npm → descarga tarball, calcula SHA → actualiza `Formula/fintoc.rb` en [`homebrew-tap`](https://github.com/fintoc-com/homebrew-tap) → push como `fin-releases[bot]`.

## Si falla

| Falla en | Estado | Recovery |
|---|---|---|
| Antes del push de `release/prepare`, incluido el push rechazado porque `main` se movió | Nada en el remote | Re-run del Release workflow, o dispatch manual desde el nuevo `main` |
| `npm publish` (después del push) | Commit + tag en `main`, versión no publicada en npm | `git checkout <tag>` + `npm publish --access public` + `gh release create <tag>`. O saltarse la versión: el próximo release bumpea desde ella |
| `release/finalize` (post-publish) | Paquete en npm + tag, sin GitHub Release | `gh release create <tag> --notes '...'` |
| `Update Homebrew tap` | npm + tag + release OK, fórmula atrasada | Re-run del Update Homebrew (acepta `version` input para una versión específica) |
