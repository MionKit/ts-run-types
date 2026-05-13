#!/usr/bin/env bash
set -euo pipefail

# Packs all public ts-run-types packages into tarballs with unversioned names.
# Tarballs are placed in <dest>/tarballs/ by default.
#
# Usage: bash scripts/pack-packages.sh [--dest <dir>]
#   --dest <dir>  Override the output directory (default: <repo-root>/tarballs)

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# ── Parse args ──
DEST_DIR="$ROOT_DIR/tarballs"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST_DIR="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Public packages to pack ──
PACKAGES=(
  "@mionjs/ts-run-types"
  "vite-plugin-runtypes"
)

# ── Pack ──
mkdir -p "$DEST_DIR"
rm -f "$DEST_DIR/"*.tgz 2>/dev/null || true

cd "$ROOT_DIR"
for pkg in "${PACKAGES[@]}"; do
  echo "  Packing $pkg..."
  # `pnpm pack` rewrites workspace:* deps to concrete versions in the tarball.
  pnpm --filter "$pkg" pack --pack-destination "$DEST_DIR" --silent
done

# ── Rename to unversioned names ──
renamed=0
shopt -s nullglob
for tb in "$DEST_DIR"/*.tgz; do
  filename="$(basename "$tb")"
  unversioned="$(echo "$filename" | sed -E 's/-[0-9]+\.[0-9]+\.[0-9]+.*\.tgz$/.tgz/')"
  if [[ "$filename" != "$unversioned" ]]; then
    mv "$tb" "$DEST_DIR/$unversioned"
    echo "  📦 $filename → $unversioned"
    renamed=$((renamed + 1))
  fi
done

echo ""
echo "Packed $renamed tarballs into $DEST_DIR"
