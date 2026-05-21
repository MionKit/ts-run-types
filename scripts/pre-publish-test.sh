#!/usr/bin/env bash
set -euo pipefail

# Pre-publish verification for ts-go-run-types monorepo.
# Runs Go + JS test suites, lint, formatting check, and a fresh build.

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

step=0
total_steps=7

print_step() {
  step=$((step + 1))
  echo ""
  echo -e "${GREEN}[$step/$total_steps] $1${NC}"
  echo "──────────────────────────────────────────"
}

# ── Step 1: Fresh start ──
print_step "Fresh start (clean + reinstall)"
pnpm run fresh-start

# ── Step 2: Verify cache skeletons are in sync ──
# internal/cachetpl/skeletons/*.ts mirrors packages/ts-go-run-types/src/caches/*.ts.
# Drift would mean the Go binary embeds stale skeletons.
print_step "Cache skeleton sync check"
pnpm run check:cache-skeletons

# ── Step 3: Build the Go binary ──
# JS plugin tests spawn this binary, so it must exist before `pnpm test`.
print_step "Build Go binary"
go build -o bin/ts-go-run-types ./cmd/ts-go-run-types
./bin/ts-go-run-types --help > /dev/null || true

# ── Step 4: Go test suite ──
print_step "Go tests"
go test ./internal/...

# ── Step 5: Lint & formatting ──
print_step "Lint & check formatting"
pnpm run lint
pnpm run check-format

# ── Step 6: JS test suites ──
print_step "JS tests (Vitest projects)"
pnpm run test

# ── Step 7: Build all JS packages ──
print_step "Build JS packages"
pnpm run build

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  All pre-publish checks passed!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo ""
echo "Ready to publish. Run:"
echo "  pnpm run npm-publish"
echo ""
