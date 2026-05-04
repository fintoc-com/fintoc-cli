# Release

## How to publish a new version

1. Make sure you're on `main` with everything merged:

```bash
git checkout main && git pull
```

2. Bump the version (creates a commit + git tag automatically):

```bash
npm version patch   # 0.1.0 → 0.1.1
npm version minor   # 0.1.1 → 0.2.0
npm version major   # 0.2.0 → 1.0.0
```

3. Push the commit and tag:

```bash
git push && git push --tags
```

4. GitHub Actions detects the `v*` tag and automatically:
   - Installs dependencies
   - Builds the project
   - Runs tests
   - Publishes to npm with provenance

5. Verify:

```bash
npm view @fintoc/cli version
npx --package @fintoc/cli fintoc --version
```

## CI requirements

The workflow requires a `NPM_TOKEN` secret configured in the repo (Settings → Secrets and variables → Actions). This is a Granular Access Token from npmjs.com with read/write permissions on `@fintoc/cli`.
