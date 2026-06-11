#!/usr/bin/env bash
# Ensures bin/ts-go-run-types matches the current Go source tree.
# If the binary is missing or stale, rebuilds it in place. Only exits
# non-zero when the toolchain or build itself is broken — staleness alone
# is no longer a failure.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BIN="bin/ts-go-run-types"
PKG="./cmd/ts-go-run-types"
# Embed the workspace version into the binary so the on-disk RT cache
# is automatically isolated across releases — see
# internal/constants/version.go. Falls back to "dev" when node isn't
# available (CI bootstrap scenarios) so the build still completes.
if command -v node >/dev/null 2>&1; then
  VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo dev)"
else
  VERSION="dev"
fi
LDFLAGS="-X github.com/mionkit/ts-run-types/internal/constants.Version=${VERSION}"

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() {
  echo -e "${RED}✗ ts-go-run-types build failed:${NC} $1" >&2
  exit 1
}

if ! command -v go >/dev/null 2>&1; then
  fail "Go toolchain not found on PATH (needed to build $BIN)."
fi

echo -e "${YELLOW}→ Checking ts-go-run-types (version=$VERSION)...${NC}"

# Fast path: when the binary is missing we KNOW we're about to build,
# so announce it upfront and build straight into $BIN — no temp dance.
if [ ! -f "$BIN" ]; then
  echo -e "${YELLOW}→ Building ts-go-run-types ($BIN does not exist; this may take a moment on a cold cache)...${NC}"
  mkdir -p "$(dirname "$BIN")"
  if ! go build -ldflags "$LDFLAGS" -o "$BIN" "$PKG"; then
    fail "Build failed."
  fi
  echo -e "${GREEN}✓ Built $BIN.${NC}"
  exit 0
fi

# Binary exists — compare its build ID against a reference build to
# detect staleness. We have to compile the reference to read its build
# ID (`go list .Stale` is unreliable when we build with `-o` to a custom
# location instead of $GOBIN, so it always reports "not installed but
# available in build cache"). Cache-hot this is sub-second; cold or
# after a source edit it's the real build cost — announce that so the
# log doesn't sit silent for a few seconds.
echo -e "${YELLOW}→ Verifying $BIN matches current source (rebuilding if stale)...${NC}"
TMP_BIN="$(mktemp)"
trap 'rm -f "$TMP_BIN"' EXIT
if ! go build -ldflags "$LDFLAGS" -o "$TMP_BIN" "$PKG"; then
  fail "Reference build failed."
fi

disk_id="$(go tool buildid "$BIN" 2>/dev/null || true)"
ref_id="$(go tool buildid "$TMP_BIN" 2>/dev/null || true)"
if [ -z "$disk_id" ] || [ -z "$ref_id" ]; then
  fail "Could not read build IDs from $BIN or reference binary."
fi

if [ "$disk_id" != "$ref_id" ]; then
  echo -e "${YELLOW}→ Replacing $BIN (stale: build ID mismatch)...${NC}"
  mv "$TMP_BIN" "$BIN"
  echo -e "${GREEN}✓ Built $BIN.${NC}"
else
  echo -e "${GREEN}✓ ts-go-run-types is up to date with source.${NC}"
fi
