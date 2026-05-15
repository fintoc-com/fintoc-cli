#!/usr/bin/env bash
# Resolve and validate the version to sync into the Homebrew formula.
# Strips a leading "v" and refuses anything not matching x.y.z.
#
# Required env: RAW_VERSION (may be empty if neither workflow_dispatch input
#               nor release event provided one), GITHUB_OUTPUT
set -euo pipefail

if [ -z "${RAW_VERSION:-}" ]; then
  echo "::error::No version provided and no release tag in event"
  exit 1
fi

VERSION="${RAW_VERSION#v}"
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "::error::Invalid version: $VERSION"
  exit 1
fi

echo "version=$VERSION" >> "$GITHUB_OUTPUT"
echo "Resolved version: $VERSION"
