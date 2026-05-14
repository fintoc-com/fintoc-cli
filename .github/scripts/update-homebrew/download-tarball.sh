#!/usr/bin/env bash
# Download the published tarball of @fintoc/cli@$VERSION and compute its
# SHA256. Writes `url` and `sha256` to $GITHUB_OUTPUT for downstream steps
# (the Homebrew formula needs both).
#
# Required env: VERSION, GITHUB_OUTPUT
set -euo pipefail

URL="https://registry.npmjs.org/@fintoc/cli/-/cli-${VERSION}.tgz"
TARBALL=$(mktemp)

HTTP_CODE=$(curl -sL -o "$TARBALL" -w '%{http_code}' "$URL")
if [ "$HTTP_CODE" != "200" ]; then
  echo "Failed to download tarball (HTTP $HTTP_CODE)"
  exit 1
fi

SHA256=$(sha256sum "$TARBALL" | awk '{print $1}')
echo "sha256=$SHA256" >> "$GITHUB_OUTPUT"
echo "url=$URL" >> "$GITHUB_OUTPUT"
echo "Tarball downloaded: $URL (sha256=$SHA256)"
