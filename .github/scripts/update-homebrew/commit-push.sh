#!/usr/bin/env bash
# Commit the updated formula as the fin-releases bot and push to homebrew-tap.
# Idempotent: exits 0 if the formula already matches.
#
# Required env: APP_SLUG, TOKEN, VERSION
# Assumes homebrew-tap has been checked out at ./homebrew-tap with TOKEN
# already configured as the remote credential.
set -euo pipefail

BOT_NAME="${APP_SLUG}[bot]"
BOT_ID=$(GH_TOKEN="$TOKEN" gh api "/users/${BOT_NAME}" --jq .id)

cd homebrew-tap
git config user.name  "$BOT_NAME"
git config user.email "${BOT_ID}+${BOT_NAME}@users.noreply.github.com"

git add Formula/fintoc.rb
if git diff --cached --quiet; then
  echo "Formula already up to date"
  exit 0
fi

git commit -m "fintoc $VERSION" -m "https://github.com/fintoc-com/fintoc-cli/releases/tag/v$VERSION"
git push
