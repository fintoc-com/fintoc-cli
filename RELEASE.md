# Release

## How to publish a new version

1. Create a branch and bump the version in `package.json`:

```bash
git checkout main && git pull
git checkout -b release/vX.X.X
npm version patch --no-git-tag-version   # or minor/major
```

2. Create a PR with the version bump and merge it.

3. After merging, create and push the tag from main:

```bash
git checkout main && git pull
git tag vX.X.X
git push --tags
```

4. GitHub Actions detects the `v*` tag and automatically:
   - Installs dependencies
   - Builds the project
   - Runs tests
   - Publishes to npm with provenance

5. Verify:

```bash
npm view @fintoc/cli version
```

## CI requirements

The workflow requires a `NPM_TOKEN` secret configured in the repo (Settings → Secrets and variables → Actions). This is a Granular Access Token from npmjs.com with read/write permissions on `@fintoc/cli`.
