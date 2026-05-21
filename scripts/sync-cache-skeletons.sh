#!/usr/bin/env bash
# Sync the hand-authored cache skeletons into the Go module's embed tree.
#
# Canonical source: packages/ts-go-run-types/src/caches/*.ts
# Embed mirror:     internal/cachetpl/skeletons/*.ts
#
# The Go side cannot `//go:embed` files outside the module root, so we
# keep a mirrored copy under internal/cachetpl/skeletons/ and verify
# they match in pre-commit / CI.
#
# Usage:
#   scripts/sync-cache-skeletons.sh         # copy src -> mirror
#   scripts/sync-cache-skeletons.sh --check # exit non-zero if drift
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/packages/ts-go-run-types/src/caches"
DST_DIR="$ROOT/internal/cachetpl/skeletons"

mode="copy"
if [ "${1-}" = "--check" ]; then
  mode="check"
fi

mkdir -p "$DST_DIR"

drift=0
for src in "$SRC_DIR"/*.ts; do
  name="$(basename "$src")"
  dst="$DST_DIR/$name"
  if [ "$mode" = "check" ]; then
    if [ ! -f "$dst" ] || ! diff -q "$src" "$dst" >/dev/null 2>&1; then
      echo "drift: $src vs $dst" >&2
      drift=1
    fi
  else
    cp "$src" "$dst"
  fi
done

# Make sure the mirror tree doesn't have stale files the source dropped.
for dst in "$DST_DIR"/*.ts; do
  name="$(basename "$dst")"
  src="$SRC_DIR/$name"
  if [ ! -f "$src" ]; then
    if [ "$mode" = "check" ]; then
      echo "stale mirror file: $dst (no source $src)" >&2
      drift=1
    else
      rm "$dst"
    fi
  fi
done

if [ "$mode" = "check" ] && [ "$drift" -ne 0 ]; then
  echo "" >&2
  echo "Cache skeletons under internal/cachetpl/skeletons/ are out of" >&2
  echo "sync with packages/ts-go-run-types/src/caches/. Run:" >&2
  echo "  pnpm run gen:cache-skeletons" >&2
  exit 1
fi
