#!/usr/bin/env bash
# build-playground.sh - build the runtypes-playground package's self-contained
# browser bundle (the <runtypes-playground> web component + Monaco + the
# ts-runtypes resolver compiled to WebAssembly) and stage it as static assets the
# docs site serves to the browser.
#
# The RuntypesPlayground.vue component loads these client-side from /playground-app/:
#   public/playground-app/manifest.json   entry -> content-hashed chunk map
#   public/playground-app/assets/*        the web-component bundle, Monaco workers,
#                                         ts-runtypes.wasm + Go's wasm_exec.js
#
# The assets live under /playground-app/ (NOT /playground/) on purpose: the docs
# page itself is the content route /playground, and a public/playground/index.html
# would shadow it. The standalone example (dist-site/index.html) is for other
# hosts; the docs site embeds the web component and stages only the bundle.
#
# Run this on the HOST (it needs the Go toolchain + bootstrapped submodule, see
# ../../../SETUP.md) before "scripts/website.sh dev". The container image is
# Node-only, and public/ is bind-mounted into it, so the staged files ride in.
#
# Output is git-ignored and reproducible - never committed.
set -euo pipefail

website_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$website_dir/../.." && pwd)"
pkg_dir="$repo_root/packages/runtypes-playground"
out_dir="$website_dir/public/playground-app"

echo "==> building runtypes-playground bundle (resolver WASM + Monaco web component) ..."
( cd "$repo_root" && pnpm --filter runtypes-playground run build:all )

echo "==> staging into $out_dir"
rm -rf "$out_dir"
mkdir -p "$out_dir/assets"
cp -R "$pkg_dir/dist-site/assets/." "$out_dir/assets/"
# Vite writes the manifest under .vite/; copy it to a plain path the component
# fetches (Nitro does not serve dot-directories from public/).
cp "$pkg_dir/dist-site/.vite/manifest.json" "$out_dir/manifest.json"

echo "==> done:"
ls -la "$out_dir"
