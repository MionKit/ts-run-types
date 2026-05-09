#!/usr/bin/env bash
# Verifies bin/ts-go-run-types matches the current Go source tree.
# Exits non-zero with a descriptive message if the binary is missing or stale,
# so callers (Vitest globalSetup, CI workflows, pre-publish scripts) can abort.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BIN="bin/ts-go-run-types"
PKG="./cmd/ts-go-run-types"
REBUILD_CMD="go build -o $BIN $PKG"

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() {
  echo -e "${RED}✗ Go binary check failed:${NC} $1" >&2
  echo -e "${YELLOW}→ Rebuild with:${NC} $REBUILD_CMD" >&2
  exit 1
}

if [ ! -f "$BIN" ]; then
  fail "$BIN does not exist."
fi

if ! command -v go >/dev/null 2>&1; then
  fail "Go toolchain not found on PATH (needed to verify $BIN is current)."
fi

# Perform a reference build into a temp path (cache-hot, sub-second) and
# compare its embedded build ID against the on-disk binary. `go list .Stale`
# is unreliable here because we build with `-o` to a custom location instead
# of $GOBIN, so it always reports "not installed but available in build cache".
TMP_BIN="$(mktemp)"
trap 'rm -f "$TMP_BIN"' EXIT
if ! go build -o "$TMP_BIN" "$PKG" 2>/dev/null; then
  fail "Failed to perform reference build for verification."
fi

disk_id="$(go tool buildid "$BIN" 2>/dev/null || true)"
ref_id="$(go tool buildid "$TMP_BIN" 2>/dev/null || true)"
if [ -z "$disk_id" ] || [ -z "$ref_id" ]; then
  fail "Could not read build IDs from $BIN or reference binary."
fi
if [ "$disk_id" != "$ref_id" ]; then
  fail "$BIN does not match current source (build ID mismatch)."
fi

echo -e "${GREEN}✓ Go binary is up to date with source.${NC}"
