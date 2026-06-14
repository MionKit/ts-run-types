#!/usr/bin/env bash
# build.sh — stage every runtime artifact the standalone playground serves.
#
# Produces git-ignored, reproducible output under public/:
#   public/playground/ts-runtypes.wasm   the resolver compiled to WebAssembly
#   public/playground/wasm_exec.js       Go's browser runtime shim
#   public/runtime/                      the ts-runtypes runtime (browser ESM)
#
# Run on the HOST (needs the Go toolchain + bootstrapped submodule, see
# ../../SETUP.md). The committed source (index.html, *.mjs, styles.css) lives
# alongside this script; only the staged artifacts above are git-ignored.

set -euo pipefail

web_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$web_dir/../.." && pwd)"
public_dir="$web_dir/public"
wasm_out="$public_dir/playground"
runtime_out="$public_dir/runtime"

mkdir -p "$wasm_out" "$runtime_out"

echo "==> building ts-runtypes.wasm (GOOS=js GOARCH=wasm) …"
GOOS=js GOARCH=wasm go build -C "$repo_root" -o "$wasm_out/ts-runtypes.wasm" ./cmd/ts-runtypes-wasm

goroot="$(go env GOROOT)"
wasm_exec=""
for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
  if [ -f "$candidate" ]; then wasm_exec="$candidate"; break; fi
done
if [ -z "$wasm_exec" ]; then
  echo "error: could not find wasm_exec.js under $goroot" >&2
  exit 1
fi
cp "$wasm_exec" "$wasm_out/wasm_exec.js"

echo "==> building the ts-runtypes runtime (browser ESM) …"
pnpm --filter ts-runtypes run build >/dev/null
# The runtime dist is plain relative-import ESM with no node/bare deps, so the
# browser can load it as-is. Mirror it under public/runtime/.
rm -rf "$runtime_out"
mkdir -p "$runtime_out"
cp -R "$repo_root/packages/ts-runtypes/dist/." "$runtime_out/"

echo "==> done. staged:"
ls -la "$wasm_out/ts-runtypes.wasm" "$wasm_out/wasm_exec.js"
echo "    runtime entry: $runtime_out/index.js"
echo ""
echo "Run the site:  node $web_dir/server.mjs   ->  http://localhost:5174"
