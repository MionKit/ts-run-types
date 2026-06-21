#!/usr/bin/env bash
# build-playground.sh — compile the ts-runtypes resolver to WebAssembly and
# stage it as static assets the docs site serves to the browser.
#
# The RuntypesPlayground.vue component loads these client-side:
#   public/playground/ts-runtypes.wasm   the compiled resolver
#   public/playground/wasm_exec.js       Go's browser runtime shim
#
# Run this on the HOST (it needs the Go toolchain + bootstrapped submodule,
# see ../../SETUP.md) before `scripts/website.sh dev`. The container image is
# Node-only, and public/ is bind-mounted into it, so the staged files ride in.
#
# Output is git-ignored and reproducible — never committed.
set -euo pipefail

website_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$website_dir/.." && pwd)"
out_dir="$website_dir/public/playground"
mkdir -p "$out_dir"

echo "building ts-runtypes.wasm (GOOS=js GOARCH=wasm) …"
GOOS=js GOARCH=wasm go build -C "$repo_root" -o "$out_dir/ts-runtypes.wasm" ./cmd/ts-runtypes-wasm

goroot="$(go env GOROOT)"
wasm_exec=""
for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
  if [ -f "$candidate" ]; then wasm_exec="$candidate"; break; fi
done
if [ -z "$wasm_exec" ]; then
  echo "error: could not find wasm_exec.js under $goroot" >&2
  exit 1
fi
cp "$wasm_exec" "$out_dir/wasm_exec.js"

echo "done:"
ls -la "$out_dir/ts-runtypes.wasm" "$out_dir/wasm_exec.js"
