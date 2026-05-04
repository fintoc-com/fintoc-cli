# Release

## How to publish a new version

1. Create a release branch and bump the version:

```bash
git checkout main && git pull
git checkout -b release/vX.X.X
npm version patch --no-git-tag-version   # or minor/major
```

2. Commit, push, and create a PR:

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to X.X.X"
git push -u origin release/vX.X.X
gh pr create --title "Version X.X.X 🎉"
```

3. Merge the PR. Everything else is automatic — `release.yml` detects the merged `release/*` branch, creates a `vX.X.X` tag, and publishes to npm.

4. Verify:

```bash
npm view @fintoc/cli version
```

## CI requirements

The publish workflow requires a `NPM_TOKEN` secret in the repo (Settings → Secrets and variables → Actions). This is a Granular Access Token from npmjs.com with read/write permissions on `@fintoc/cli` and 2FA bypass enabled.
