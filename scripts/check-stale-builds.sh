#!/usr/bin/env bash
# Ensures the build artifacts the rest of the workspace depends on match the
# current source. Successor to the old check-go-binary.sh — same job for the
# Go binary, plus structural checks on the two TS package dists that the bench
# (and `pnpm test`, via the marker package's own vitest config) load.
#
# Targets (positional):
#   go            bin/ts-runtypes matches cmd/ + internal/ (build-id compare).
#   linux-go      bin/ts-runtypes-linux-<arch> matches the host binary —
#                 cross-compiled on macOS, copied on Linux. Used by the bench
#                 container to mount a Linux ELF on the host.
#   linux-extract bin/extract-fn-bodies-linux-<arch> — the source-body extractor
#                 as a Linux ELF, mounted into the bench container so the
#                 in-container serialization bench needs no Go toolchain.
#   marker-dist   packages/ts-runtypes/dist is internally consistent
#                 (every .d.ts.map has a matching .d.ts, sentinel files present,
#                 src not newer than dist). Repairs by wiping tsbuildinfo and
#                 running the package's `build` script — incremental tsc on its
#                 own would trust the corrupt buildinfo and re-skip emit.
#   plugin-dist   packages/runtypes-devtools/dist, same checks.
#   all           go + marker-dist + plugin-dist. Default when no args given.
#                 NOT linux-go — that's bench-only; the bench script asks for it
#                 explicitly so `pnpm test` doesn't pay the cross-compile cost.
#
# Why the dist checks are paired (sentinel + .d.ts.map / .d.ts pairing):
# tsc with `incremental: true` writes tsconfig.tsbuildinfo recording which
# inputs produced which outputs. If a previous emit was interrupted (Ctrl-C
# mid-build, a transient lib mismatch, …) the cheap .d.ts.map files can land
# without their .d.ts siblings; the buildinfo then memorizes that state and
# every subsequent incremental `tsc` skips emitting the missing .d.ts. The
# resolver loads them via the package's exports map, so missing declarations
# silently break call-site resolution downstream. Detecting the orphan map +
# wiping the buildinfo forces tsc to emit from scratch.
#
# Exit codes: 0 = everything up to date or repaired; non-zero = a build itself
# failed (toolchain broken, source error). Staleness alone is never a failure.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m'

GO_BIN="bin/ts-runtypes"
GO_PKG="./cmd/ts-runtypes"
EXTRACT_PKG="./cmd/extract-fn-bodies"
MARKER_PKG_DIR="packages/ts-runtypes"
PLUGIN_PKG_DIR="packages/runtypes-devtools"

# Marker dist sentinels — the .d.ts files whose absence in a "fresh" dist is a
# strong signal that declaration emit was interrupted. markers.d.ts in
# particular is the file the Go marker scanner needs to resolve InjectRunTypeId.
MARKER_SENTINELS=(
  "$MARKER_PKG_DIR/dist/index.d.ts"
  "$MARKER_PKG_DIR/dist/markers.d.ts"
  "$MARKER_PKG_DIR/dist/createRTFunctions.d.ts"
)
PLUGIN_SENTINELS=(
  "$PLUGIN_PKG_DIR/dist/index.d.ts"
)

fail() {
  echo -e "${RED}* check-stale-builds: $1${NC}" >&2
  exit 1
}

info()    { echo -e "${YELLOW}-> $1${NC}"; }
success() { echo -e "${GREEN}OK $1${NC}"; }

linux_goarch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)             echo "amd64" ;;
  esac
}

# ── go ───────────────────────────────────────────────────────────────────────

go_version_ldflags() {
  # Embed the workspace version into the binary so the on-disk RT cache
  # is automatically isolated across releases — see
  # internal/constants/version.go. Falls back to "dev" when node isn't
  # available so the build still completes in CI bootstrap scenarios.
  local version tsgo
  if command -v node >/dev/null 2>&1; then
    version="$(node -p "require('./package.json').version" 2>/dev/null || echo dev)"
  else
    version="dev"
  fi
  # tsgo revision is pure metadata (surfaced by --version); not folded into the
  # typeID hash, so it never perturbs the on-disk cache.
  tsgo="$(git -C third_party/tsgolint rev-parse --short HEAD 2>/dev/null || echo dev)"
  echo "-X github.com/mionkit/ts-runtypes/internal/constants.Version=${version} -X github.com/mionkit/ts-runtypes/internal/constants.TsgoVersion=${tsgo}"
}

check_go() {
  command -v go >/dev/null 2>&1 || fail "Go toolchain not found on PATH (needed to build $GO_BIN)."
  local ldflags; ldflags="$(go_version_ldflags)"

  info "Checking $GO_BIN..."

  if [ ! -f "$GO_BIN" ]; then
    info "Building $GO_BIN (missing; may take a moment on a cold cache)..."
    mkdir -p "$(dirname "$GO_BIN")"
    go build -ldflags "$ldflags" -o "$GO_BIN" "$GO_PKG" || fail "Build failed."
    success "Built $GO_BIN."
    return 0
  fi

  # Build a reference and compare build IDs. `go list .Stale` is unreliable
  # when we build with `-o` to a custom location, so it always reports "not
  # installed but available in build cache" — buildid is the reliable signal.
  info "Verifying $GO_BIN matches current source..."
  local tmp_bin; tmp_bin="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp_bin'" EXIT
  go build -ldflags "$ldflags" -o "$tmp_bin" "$GO_PKG" || fail "Reference build failed."

  local disk_id ref_id
  disk_id="$(go tool buildid "$GO_BIN"  2>/dev/null || true)"
  ref_id="$(go tool buildid "$tmp_bin" 2>/dev/null || true)"
  if [ -z "$disk_id" ] || [ -z "$ref_id" ]; then
    fail "Could not read build IDs from $GO_BIN or reference binary."
  fi
  if [ "$disk_id" != "$ref_id" ]; then
    info "Replacing $GO_BIN (stale: build ID mismatch)..."
    mv "$tmp_bin" "$GO_BIN"
    success "Built $GO_BIN."
  else
    rm -f "$tmp_bin"
    success "$GO_BIN is up to date with source."
  fi
  trap - EXIT
}

# ── linux-go ────────────────────────────────────────────────────────────────

check_linux_go() {
  # The bench container is Linux; the host bin is Mach-O on macOS, so we need
  # a parallel ELF at bin/ts-runtypes-linux-<arch>. On Linux hosts this is
  # just a copy of the host binary that the bench mount finds at a stable name.
  local goarch; goarch="$(linux_goarch)"
  local linux_bin="bin/ts-runtypes-linux-${goarch}"

  # The Go binary must be fresh first; otherwise we'd cross-compile (or copy)
  # a stale host binary forward into the linux slot.
  check_go

  info "Checking $linux_bin..."
  if [ "$(uname -s)" = "Darwin" ]; then
    if [ ! -f "$linux_bin" ] || [ ! -s "$linux_bin" ]; then
      info "Cross-building (linux/$goarch)..."
      command -v go >/dev/null 2>&1 || fail "Go toolchain not found."
      GOOS=linux GOARCH="$goarch" go build -ldflags "$(go_version_ldflags)" -o "$linux_bin" "$GO_PKG" || fail "Cross-build failed."
      success "Built $linux_bin."
      return 0
    fi
    # Compare against a freshly cross-compiled reference; same approach as `go`.
    local tmp_bin; tmp_bin="$(mktemp)"
    # shellcheck disable=SC2064
    trap "rm -f '$tmp_bin'" EXIT
    GOOS=linux GOARCH="$goarch" go build -ldflags "$(go_version_ldflags)" -o "$tmp_bin" "$GO_PKG" || fail "Cross-build (reference) failed."
    local disk_id ref_id
    disk_id="$(go tool buildid "$linux_bin" 2>/dev/null || true)"
    ref_id="$(go tool buildid "$tmp_bin"    2>/dev/null || true)"
    if [ -z "$disk_id" ] || [ "$disk_id" != "$ref_id" ]; then
      info "Replacing $linux_bin (stale)..."
      mv "$tmp_bin" "$linux_bin"
      success "Built $linux_bin."
    else
      rm -f "$tmp_bin"
      success "$linux_bin is up to date with source."
    fi
    trap - EXIT
  else
    # Linux host: just keep the linux-tagged path in sync with the host bin.
    if [ ! -f "$linux_bin" ] || [ "$GO_BIN" -nt "$linux_bin" ]; then
      cp -f "$GO_BIN" "$linux_bin"
      success "Synced $linux_bin from $GO_BIN."
    else
      success "$linux_bin is up to date with $GO_BIN."
    fi
  fi
}

# ── linux-extract ────────────────────────────────────────────────────────────

check_linux_extract() {
  # The serialization benchmark runs inside the Node 26 container (no Go
  # toolchain), so the source-extractor `go run ./cmd/extract-fn-bodies` becomes
  # a bind-mounted Linux ELF at bin/extract-fn-bodies-linux-<arch>. No version
  # ldflags (only ts-runtypes embeds the cache version). A fresh reference build
  # + build-id compare detects staleness; on a Linux host GOOS=linux is native.
  local goarch; goarch="$(linux_goarch)"
  local linux_bin="bin/extract-fn-bodies-linux-${goarch}"
  command -v go >/dev/null 2>&1 || fail "Go toolchain not found (needed to build $linux_bin)."

  info "Checking $linux_bin..."
  local tmp_bin; tmp_bin="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$tmp_bin'" EXIT
  GOOS=linux GOARCH="$goarch" go build -o "$tmp_bin" "$EXTRACT_PKG" || fail "Cross-build failed."
  local disk_id ref_id
  disk_id="$(go tool buildid "$linux_bin" 2>/dev/null || true)"
  ref_id="$(go tool buildid "$tmp_bin"    2>/dev/null || true)"
  if [ ! -f "$linux_bin" ] || [ -z "$disk_id" ] || [ "$disk_id" != "$ref_id" ]; then
    mkdir -p "$(dirname "$linux_bin")"
    info "Replacing $linux_bin (stale or missing)..."
    mv "$tmp_bin" "$linux_bin"
    success "Built $linux_bin."
  else
    rm -f "$tmp_bin"
    success "$linux_bin is up to date with source."
  fi
  trap - EXIT
}

# ── marker-dist / plugin-dist ───────────────────────────────────────────────

# Returns 0 (truthy "stale") if ANY of:
#   - the dist dir is missing,
#   - any sentinel file is missing,
#   - any .d.ts.map in dist/ has no matching .d.ts sibling (partial emit),
#   - any file under src/ is newer than the dist sentinel index file.
dist_is_stale() {
  local dist_dir="$1" src_dir="$2"; shift 2
  local sentinels=("$@")

  [ -d "$dist_dir" ] || return 0
  local s
  for s in "${sentinels[@]}"; do
    [ -f "$s" ] || return 0
  done
  # Orphan .d.ts.map → broken emit, the exact failure mode we keep hitting.
  if find "$dist_dir" -type f -name "*.d.ts.map" -print 2>/dev/null \
       | while IFS= read -r m; do [ -f "${m%.d.ts.map}.d.ts" ] || { echo orphan; break; }; done \
       | grep -q orphan; then
    return 0
  fi
  # mtime-based source drift; the first sentinel doubles as the freshness anchor.
  local anchor="${sentinels[0]}"
  if [ -d "$src_dir" ] && [ -n "$(find "$src_dir" -type f -newer "$anchor" -print -quit 2>/dev/null)" ]; then
    return 0
  fi
  return 1
}

rebuild_pkg_dist() {
  local pkg_dir="$1" pkg_name="$2"
  # Clean wipe: rimraf both dist/ and tsbuildinfo. We deliberately don't trust
  # incremental tsc here — the entire reason this script exists is that tsc's
  # incremental cache can memorize a half-emitted state and refuse to recover.
  rm -rf "$pkg_dir/dist" "$pkg_dir/tsconfig.tsbuildinfo"
  info "Rebuilding $pkg_name dist..."
  pnpm --filter "$pkg_name" run build || fail "$pkg_name build failed."
}

check_marker_dist() {
  info "Checking $MARKER_PKG_DIR/dist..."
  if dist_is_stale "$MARKER_PKG_DIR/dist" "$MARKER_PKG_DIR/src" "${MARKER_SENTINELS[@]}"; then
    info "$MARKER_PKG_DIR/dist is stale or incomplete - rebuilding clean"
    rebuild_pkg_dist "$MARKER_PKG_DIR" "ts-runtypes"
    # Re-check post-build; if it's still stale, the build script is broken.
    if dist_is_stale "$MARKER_PKG_DIR/dist" "$MARKER_PKG_DIR/src" "${MARKER_SENTINELS[@]}"; then
      fail "$MARKER_PKG_DIR/dist still incomplete after rebuild (build script bug)."
    fi
    success "Rebuilt $MARKER_PKG_DIR/dist."
  else
    success "$MARKER_PKG_DIR/dist is up to date."
  fi
}

check_plugin_dist() {
  info "Checking $PLUGIN_PKG_DIR/dist..."
  if dist_is_stale "$PLUGIN_PKG_DIR/dist" "$PLUGIN_PKG_DIR/src" "${PLUGIN_SENTINELS[@]}"; then
    info "$PLUGIN_PKG_DIR/dist is stale or incomplete - rebuilding clean"
    rebuild_pkg_dist "$PLUGIN_PKG_DIR" "runtypes-devtools"
    if dist_is_stale "$PLUGIN_PKG_DIR/dist" "$PLUGIN_PKG_DIR/src" "${PLUGIN_SENTINELS[@]}"; then
      fail "$PLUGIN_PKG_DIR/dist still incomplete after rebuild (build script bug)."
    fi
    success "Rebuilt $PLUGIN_PKG_DIR/dist."
  else
    success "$PLUGIN_PKG_DIR/dist is up to date."
  fi
}

# ── dispatch ────────────────────────────────────────────────────────────────

run_target() {
  case "$1" in
    go)           check_go ;;
    linux-go)     check_linux_go ;;
    linux-extract) check_linux_extract ;;
    marker-dist)  check_marker_dist ;;
    plugin-dist)  check_plugin_dist ;;
    all)          check_go; check_marker_dist; check_plugin_dist ;;
    *) fail "unknown target '$1'. Valid: go | linux-go | marker-dist | plugin-dist | all" ;;
  esac
}

main() {
  if [ $# -eq 0 ]; then
    run_target all
    return
  fi
  for t in "$@"; do run_target "$t"; done
}

main "$@"
