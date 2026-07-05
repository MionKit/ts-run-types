#!/usr/bin/env bash
# build-playground.sh - host-side prebuild of the static assets the docs site's
# <RuntypesPlayground> Vue component fetches from /playground-app/:
#
#   public/playground-app/ts-runtypes.wasm.gz   the resolver compiled to wasm (gz)
#   public/playground-app/wasm_exec.js          Go's wasm runtime shim
#   public/playground-app/runtypes-sources.json the ts-runtypes source overlay the
#                                               resolver type-checks snippets against
#
# The Monaco UI itself is now a normal Nuxt Vue component (bundled by the site
# build), so there is NO separate vite bundle / manifest here anymore - only these
# host-built inputs, which the Node-only container cannot produce (no Go toolchain,
# and packages/ is a read-only mount). Run this on the HOST (needs the Go toolchain
# + bootstrapped submodule, see ../../../SETUP.md) before "scripts/website/site.sh dev".
# public/ is bind-mounted into the container, so the staged files ride in.
#
# The WASM build is STALENESS-GATED so repeated dev/build starts do NOT recompile
# when nothing changed (the common case is instant): a fast mtime pre-check over
# the Go inputs (against a stamp), then a `go tool buildid` compare (same mechanism
# as scripts/core/build.sh) that only recompiles on a real input change.
# Gzip - the slow part on the ~37 MiB wasm - runs ONLY when the wasm bytes actually
# changed. Output is git-ignored and reproducible; never committed.
set -euo pipefail

website_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo_root="$(cd "$website_dir/../.." && pwd)"
cd "$repo_root"

cache_dir="$repo_root/.cache/rt-wasm"
raw_wasm="$cache_dir/ts-runtypes.wasm"
raw_gz="$cache_dir/ts-runtypes.wasm.gz"
wasm_exec="$cache_dir/wasm_exec.js"
sources_json="$cache_dir/runtypes-sources.json"
stamp="$cache_dir/.wasm-stamp"
out_dir="$website_dir/public/playground-app"
# The playground imports the ts-runtypes RUNTIME factories. They are vendored INTO
# the site here (git-ignored, re-synced on change) because Vite's dev server only
# serves modules inside the Nuxt project root (packages/ is a separate read-only
# mount in the container). The compiled DIST (not src) is vendored: it is plain
# ESM, so Vite serves it verbatim with no per-file TS transpile - which would break
# on type-only re-exports in dev (unbundled). The resolver's type OVERLAY still
# comes from src (runtypes-sources.json), so type accuracy is unaffected.
vendor_dir="$website_dir/app/playground/.vendor/ts-runtypes-dist"

wasm_pkg="./cmd/ts-runtypes-wasm"
# Every Go input the wasm links; if none is newer than the stamp, tier 1
# short-circuits. The buildid compare (tier 2) is the backstop for the rare case
# an mtime moved without a real change (git checkout / touch).
wasm_inputs=(cmd/ts-runtypes-wasm internal go.mod go.sum)
# The source overlay tracks only the marker package's src.
sources_input="packages/ts-runtypes/src"

info() { echo "==> $1"; }
warn() { echo "==> WARN: $1" >&2; }
die()  { echo "==> ERROR: $1" >&2; exit 1; }

mkdir -p "$cache_dir" "$out_dir"

WASM_CHANGED=0
SOURCES_CHANGED=0

find_wasm_exec_src() {
  local goroot; goroot="$(go env GOROOT)"
  local candidate
  for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
    [ -f "$candidate" ] && { echo "$candidate"; return 0; }
  done
  return 1
}

# ---- WASM: two-tier staleness gate (rebuilds the raw .wasm only on real change) --

wasm_maybe_stale() {
  # Tier 1 (cheap): missing wasm/stamp, or any Go input newer than the stamp. The
  # stamp (not the wasm) is the anchor, so the false-alarm touch below never
  # perturbs the raw wasm's mtime (which the gz freshness check depends on).
  [ -f "$raw_wasm" ] && [ -f "$stamp" ] || return 0
  [ -n "$(find "${wasm_inputs[@]}" -type f -newer "$stamp" -print -quit 2>/dev/null)" ]
}

build_wasm_if_stale() {
  if ! wasm_maybe_stale; then
    info "wasm up to date (no Go input newer than the stamp)"
    return 0
  fi
  command -v go >/dev/null 2>&1 || { warn "Go toolchain not found - skipping wasm build (/playground will 404 until built)."; return 0; }

  info "wasm inputs changed - building reference (GOOS=js GOARCH=wasm) ..."
  local tmp; tmp="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp'" RETURN
  # No version ldflags: the asset is dev-only, and matching flags is what lets the
  # buildid compare cache (see core/build.sh check_go). Keep it flagless.
  GOOS=js GOARCH=wasm go build -o "$tmp" "$wasm_pkg" || die "wasm build failed."

  local disk_id ref_id
  disk_id="$(go tool buildid "$raw_wasm" 2>/dev/null || true)"
  ref_id="$(go tool buildid "$tmp" 2>/dev/null || true)"
  if [ -f "$raw_wasm" ] && [ -n "$disk_id" ] && [ "$disk_id" = "$ref_id" ]; then
    # False-alarm mtime (touch / checkout): bytes are identical. Quiet tier 1 for
    # next time by bumping the STAMP only; skip the expensive gzip + wasm_exec copy.
    touch "$stamp"
    info "wasm unchanged (buildid match) - skipped gzip"
    return 0
  fi

  mv "$tmp" "$raw_wasm"
  trap - RETURN
  touch "$stamp"
  WASM_CHANGED=1
  info "wasm rebuilt (buildid changed)"
}

# Ensure the browser-facing derived artifacts exist and are fresh vs the raw wasm.
# Self-heals a partial cache (e.g. only the raw wasm present) without a recompile,
# and gzips ONLY when the wasm bytes are newer than the existing gz.
ensure_wasm_derived() {
  [ -f "$raw_wasm" ] || { warn "no raw wasm in $cache_dir - /playground will 404 until built on a Go host"; return 0; }
  if [ ! -f "$raw_gz" ] || [ "$raw_wasm" -nt "$raw_gz" ]; then
    command -v gzip >/dev/null 2>&1 || die "gzip not found."
    info "gzip -9 the wasm (browser inflates via DecompressionStream) ..."
    gzip -9 -c "$raw_wasm" > "$raw_gz"
    WASM_CHANGED=1
  fi
  if [ ! -f "$wasm_exec" ]; then
    command -v go >/dev/null 2>&1 || { warn "wasm_exec.js missing and no Go to copy it from."; return 0; }
    local exec_src; exec_src="$(find_wasm_exec_src)" || die "wasm_exec.js not found under $(go env GOROOT)"
    cp "$exec_src" "$wasm_exec"
    WASM_CHANGED=1
  fi
}

# ---- Source overlay: staleness gate on packages/ts-runtypes/src -------------

build_sources_if_stale() {
  if [ -f "$sources_json" ] && [ -z "$(find "$sources_input" -type f -newer "$sources_json" -print -quit 2>/dev/null)" ]; then
    info "ts-runtypes source overlay up to date"
    return 0
  fi
  command -v node >/dev/null 2>&1 || die "node not found (needed to build the source overlay)."
  info "building ts-runtypes source overlay ..."
  node scripts/website/playground-overlay.mjs "$sources_input" "$sources_json" || die "source overlay build failed."
  SOURCES_CHANGED=1
}

# ---- Vendor the ts-runtypes runtime source into the site (in-project) --------

vendor_runtime_if_stale() {
  # Keep the marker package's dist fresh vs its src (rebuilds only when stale; the
  # same tsc check `pnpm test` runs). Then vendor that dist into the site.
  bash "$repo_root/scripts/core/build.sh" marker-dist >/dev/null 2>&1 || warn "ts-runtypes dist freshness check failed - vendoring whatever exists"
  local dist_src="$repo_root/packages/ts-runtypes/dist"
  [ -d "$dist_src" ] || { warn "packages/ts-runtypes/dist missing - run 'pnpm run build' first"; return 0; }
  # Re-sync only when a dist file is newer than the vendor dir's stamp (cp -R
  # preserves file mtimes, so the DIR mtime - set by touch after each sync - is the anchor).
  if [ -d "$vendor_dir" ] && [ -z "$(find "$dist_src" -type f -newer "$vendor_dir" -print -quit 2>/dev/null)" ]; then
    info "ts-runtypes runtime vendor up to date"
    return 0
  fi
  info "vendoring ts-runtypes runtime dist into the site ..."
  rm -rf "$vendor_dir"
  mkdir -p "$vendor_dir"
  cp -R "$dist_src/." "$vendor_dir/"
  touch "$vendor_dir"
  SOURCES_CHANGED=1
}

# ---- Stage into public/playground-app/ --------------------------------------

stage() {
  # Copy when a source is newer than the staged copy, or the staged copy is
  # missing (fresh checkout / cleaned public). Only the .gz + wasm_exec + overlay
  # ship to the browser; the raw .wasm stays in the cache (buildid oracle + Node
  # test resolver, ~37 MiB, over the Cloudflare 25 MiB per-file cap).
  local pair src dst
  for pair in "$raw_gz|$out_dir/ts-runtypes.wasm.gz" "$wasm_exec|$out_dir/wasm_exec.js" "$sources_json|$out_dir/runtypes-sources.json"; do
    src="${pair%%|*}"; dst="${pair##*|}"
    [ -f "$src" ] || { warn "missing $src - the /playground page will not load until it is built"; continue; }
    if [ ! -f "$dst" ] || [ "$src" -nt "$dst" ]; then cp "$src" "$dst"; fi
  done
}

build_wasm_if_stale
ensure_wasm_derived
build_sources_if_stale
vendor_runtime_if_stale
stage

if [ "$WASM_CHANGED" = "1" ] || [ "$SOURCES_CHANGED" = "1" ]; then
  info "staged playground assets -> $out_dir"
else
  info "playground assets already fresh -> $out_dir"
fi
ls -la "$out_dir"
