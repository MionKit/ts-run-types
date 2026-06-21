#!/usr/bin/env bash
# build.sh — compile the ts-runtypes resolver to WebAssembly and stage the
# files the Node/browser playground needs next to it.
#
# Prereqs (same as the rest of the repo, see SETUP.md):
#   - Go >= 1.26
#   - the tsgolint submodule bootstrapped + patches applied:
#       git submodule update --init --recursive
#       (cd third_party/tsgolint/typescript-go && git apply --3way ../patches/*.patch)
#
# Output (all git-ignored, reproducible from this script):
#   playground/ts-runtypes.wasm   the compiled resolver
#   playground/wasm_exec.js       Go's runtime shim (copied from $GOROOT)
#   playground/ts-runtypes.d.ts   marker ambient declaration (copied from fixtures)
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="$repo_root/playground"

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

# The resolver needs the ambient `declare module 'ts-runtypes'` so the marker
# call site resolves. Keep the playground copy in sync with the canonical fixture.
cp "$repo_root/internal/testfixtures/runtypes.d.ts" "$out_dir/ts-runtypes.d.ts"

echo "done:"
ls -la "$out_dir/ts-runtypes.wasm" "$out_dir/wasm_exec.js" "$out_dir/ts-runtypes.d.ts"
