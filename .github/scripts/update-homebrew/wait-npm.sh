#!/usr/bin/env bash
# Poll the npm registry until @fintoc/cli@$VERSION shows up.
# Required env: VERSION
set -euo pipefail

MAX_ATTEMPTS=30
SLEEP_SECONDS=10

for i in $(seq 1 "$MAX_ATTEMPTS"); do
  if npm view "@fintoc/cli@$VERSION" version 2>/dev/null; then
    echo "Found @fintoc/cli@$VERSION on npm"
    exit 0
  fi
  echo "Attempt $i/$MAX_ATTEMPTS - waiting ${SLEEP_SECONDS}s..."
  sleep "$SLEEP_SECONDS"
done

echo "Timed out waiting for @fintoc/cli@$VERSION on npm"
npm view "@fintoc/cli" versions --json || true
exit 1
