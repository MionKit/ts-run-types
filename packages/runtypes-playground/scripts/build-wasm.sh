#!/usr/bin/env bash
# build-wasm.sh — compile the ts-runtypes resolver to WebAssembly and stage it
# as package assets the engine loads at runtime (via new URL(…, import.meta.url),
# resolved by the consumer's bundler).
#
# Output (assets/ts-runtypes.wasm, assets/wasm_exec.js) is git-ignored and
# reproducible. Run on the HOST (needs the Go toolchain + bootstrapped submodule,
# see ../../SETUP.md).

set -euo pipefail

pkg_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$pkg_dir/../.." && pwd)"
assets="$pkg_dir/assets"
mkdir -p "$assets"

echo "==> building ts-runtypes.wasm (GOOS=js GOARCH=wasm) …"
GOOS=js GOARCH=wasm go build -C "$repo_root" -o "$assets/ts-runtypes.wasm" ./cmd/ts-runtypes-wasm

goroot="$(go env GOROOT)"
for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
  if [ -f "$candidate" ]; then cp "$candidate" "$assets/wasm_exec.js"; break; fi
done
[ -f "$assets/wasm_exec.js" ] || { echo "error: wasm_exec.js not found under $goroot" >&2; exit 1; }

# Ship a gzip-compressed copy too: the raw Go wasm is ~37 MiB but ~8 MiB gzipped,
# which keeps the DEPLOYED asset under static-host per-file caps (e.g. Cloudflare
# Pages' 25 MiB limit) and cuts the visitor download ~4.5x. The browser loader
# (src/core/wasmLoader.ts) fetches the .gz and inflates it with DecompressionStream;
# the raw .wasm stays for the Node test resolver and local debugging.
echo "==> gzip-compressing the wasm (browser loader inflates it) ..."
gzip -9 -c "$assets/ts-runtypes.wasm" > "$assets/ts-runtypes.wasm.gz"

echo "==> done:"
ls -la "$assets/ts-runtypes.wasm" "$assets/ts-runtypes.wasm.gz" "$assets/wasm_exec.js"
