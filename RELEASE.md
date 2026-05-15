# Releasing

Manual desde Actions. Toma ~3–5 min.

## Cómo

1. https://github.com/fintoc-com/fintoc-cli/actions → **Release** → **Run workflow**.
2. `bump`: `patch` / `minor` / `major`. `release-notes`: markdown opcional.
3. **Run workflow**. Solo corre desde `main`.

## Qué hace

`Release` workflow (`release.yml`):

`npm ci` + `lint` + `typecheck` + `build` + `test` →
[`release/prepare`](https://github.com/fintoc-com/release-action/tree/main/prepare) bumpea local →
`npm publish --access public --provenance` →
[`release/finalize`](https://github.com/fintoc-com/release-action/tree/main/finalize) pushea commit + tag, crea GitHub Release.

Eso dispara automáticamente `Update Homebrew tap` (`update-homebrew.yml`):

Espera propagación de npm → descarga tarball, calcula SHA → actualiza `Formula/fintoc.rb` en [`homebrew-tap`](https://github.com/fintoc-com/homebrew-tap) → push como `fin-releases[bot]`.

## Si falla

| Falla en | Estado | Recovery |
|---|---|---|
| Antes o durante `npm publish` | Nada en el remote | Re-run del Release workflow |
| `release/finalize` (post-publish) | Paquete en npm, sin tag/release | PR con el commit del bump + `gh release create` |
| `Update Homebrew tap` | npm + tag + release OK, fórmula atrasada | Re-run del Update Homebrew (acepta `version` input para una versión específica) |
