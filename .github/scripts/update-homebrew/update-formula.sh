#!/usr/bin/env bash
# Required env: TARBALL_URL, TARBALL_SHA256, VERSION
# Assumes homebrew-tap has been checked out at ./homebrew-tap.
set -euo pipefail

for var in TARBALL_URL TARBALL_SHA256 VERSION; do
  [ -z "${!var}" ] && echo "::error::$var is empty" && exit 1
done

envsubst '$TARBALL_URL $TARBALL_SHA256 $VERSION' > homebrew-tap/Formula/fintoc.rb <<'RUBY'
class Fintoc < Formula
  desc "CLI for the Fintoc API"
  homepage "https://github.com/fintoc-com/fintoc-cli"
  url "$TARBALL_URL"
  version "$VERSION"
  sha256 "$TARBALL_SHA256"
  license "BSD-3-Clause"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "fintoc/#{version}", shell_output("#{bin}/fintoc --version")
  end
end
RUBY

echo "Formula written for version $VERSION"
