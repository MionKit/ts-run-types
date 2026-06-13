#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# benchmarks.sh — drive the isolated (podman) validation benchmarks.
#
# Compares ts-go-run-types validators against zod / typebox / ajv / typia. The
# validator libraries + vite live ONLY inside a podman image; the host never
# installs them. At run time the benchmark sources, the ts-go-run-types Go
# binary, and the first-party packages (@mionjs/ts-go-run-types,
# vite-plugin-runtypes) are bind-mounted in. vite + the Go binary build the
# ts-go-run-types validators; the other libraries are plain runtime deps.
#
# Usage:
#   scripts/benchmarks.sh prep          # build the Go binary + JS packages (host)
#   scripts/benchmarks.sh build-image   # build the podman image
#   scripts/benchmarks.sh bench         # build + run the benchmark in the container
#   scripts/benchmarks.sh build         # vite build only (-> benchmarks/dist)
#   scripts/benchmarks.sh smoke         # quick verify: prep + image + vite build in container
#   scripts/benchmarks.sh shell         # debug shell inside the container
#   scripts/benchmarks.sh clean         # remove the image
#
# Env overrides: WEBSITE_*-style knobs, prefixed BENCH_:
#   BENCH_ENGINE (podman) BENCH_IMAGE (tsrt-bench:dev)
#   BENCH_CA_CERT  file/dir of extra CA certs (corporate / MITM proxy)
#   BENCH_BUILD_NETWORK / BENCH_RUN_NETWORK   podman build/run network
#   BENCH_TYPIA=1   also build + run the typia column (needs the typia transform)
#   BENCH_MOUNT_OPTS   extra bind-mount opts, e.g. ":z" on SELinux hosts
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BENCH_DIR="$ROOT_DIR/benchmarks"

ENGINE="${BENCH_ENGINE:-podman}"
IMAGE="${BENCH_IMAGE:-tsrt-bench:dev}"
CONTAINER_BASE="${BENCH_CONTAINER:-tsrt-bench}"
MOUNT_OPTS="${BENCH_MOUNT_OPTS:-}"
CA_SRC="${BENCH_CA_CERT:-}"
BUILD_NETWORK="${BENCH_BUILD_NETWORK:-}"
RUN_NETWORK="${BENCH_RUN_NETWORK:-}"
CACERTS_DIR="$BENCH_DIR/.cacerts"

BIN="$ROOT_DIR/bin/ts-go-run-types"
MARKER_PKG="$ROOT_DIR/packages/ts-go-run-types"
PLUGIN_PKG="$ROOT_DIR/packages/vite-plugin-runtypes"

# The container is Linux; on macOS hosts we cross-compile a separate Linux
# binary for the bind mount. On Linux hosts the host binary already works.
linux_goarch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)             echo "amd64" ;;
  esac
}
LINUX_BIN="$ROOT_DIR/bin/ts-go-run-types-linux-$(linux_goarch)"

die() { echo "benchmarks.sh: $*" >&2; exit 1; }

# mapfile-style line collector that works on bash 3.2 (macOS /bin/bash).
# Usage: read_lines VAR_NAME < <(producer-cmd)
read_lines() {
  local _n="$1" _l
  eval "$_n=()"
  while IFS= read -r _l; do eval "$_n+=(\"\$_l\")"; done
}

require_engine() {
  command -v "$ENGINE" >/dev/null 2>&1 \
    || die "container engine '$ENGINE' not found. Install podman (https://podman.io)."
}

# True when TARGET is missing OR any source file under SRC_DIR is newer than it.
needs_rebuild() {
  local target="$1"; shift
  [ -e "$target" ] || return 0
  local d
  for d in "$@"; do
    [ -d "$d" ] || continue
    [ -n "$(find "$d" -type f -newer "$target" -print -quit 2>/dev/null)" ] && return 0
  done
  return 1
}

# Build the host Go binary if missing or stale relative to cmd/ + internal/.
ensure_host_binary() {
  command -v go >/dev/null 2>&1 || die "go toolchain not found (needed to build the resolver binary)."
  if needs_rebuild "$BIN" "$ROOT_DIR/cmd" "$ROOT_DIR/internal"; then
    echo "==> building Go binary (host: $(uname -s)/$(uname -m))"
    ( cd "$ROOT_DIR" && go build -o bin/ts-go-run-types ./cmd/ts-go-run-types )
  fi
}

# Build the Linux cross-binary the container needs. On Linux hosts this is the
# same binary as the host one; on macOS we cross-compile separately.
ensure_linux_binary() {
  ensure_host_binary
  if [ "$(uname -s)" = Darwin ]; then
    if needs_rebuild "$LINUX_BIN" "$ROOT_DIR/cmd" "$ROOT_DIR/internal"; then
      local goarch; goarch="$(linux_goarch)"
      echo "==> cross-building Go binary (linux/$goarch) for the container"
      ( cd "$ROOT_DIR" && GOOS=linux GOARCH="$goarch" go build -o "$LINUX_BIN" ./cmd/ts-go-run-types )
    fi
  else
    if needs_rebuild "$LINUX_BIN" "$ROOT_DIR/cmd" "$ROOT_DIR/internal" || [ "$BIN" -nt "$LINUX_BIN" ]; then
      cp -f "$BIN" "$LINUX_BIN"
    fi
  fi
}

# Build the vite plugin dist if missing or stale.
ensure_plugin_dist() {
  if needs_rebuild "$PLUGIN_PKG/dist/index.js" "$PLUGIN_PKG/src"; then
    echo "==> building vite-plugin-runtypes"
    ( cd "$ROOT_DIR" && pnpm --filter vite-plugin-runtypes run build )
  fi
}

# Build the marker package runtime if missing or stale. Uses direct tsc with
# noEmitOnError=false to work around the marker package's known
# Temporal-ambient typecheck error (which would otherwise block JS emit).
ensure_marker_dist() {
  if needs_rebuild "$MARKER_PKG/dist/formats/index.js" "$MARKER_PKG/src"; then
    echo "==> building @mionjs/ts-go-run-types (noEmitOnError=false)"
    ( cd "$MARKER_PKG" && pnpm exec tsc -p tsconfig.json --noEmitOnError false ) \
      || echo "  (typecheck reported errors; runtime .js was still emitted - continuing)"
  fi
}

# Rebuild the podman image if missing or stale relative to its Containerfile
# and the in-image manifest (package.json + pnpm-workspace.yaml + .npmrc).
ensure_bench_image_fresh() {
  require_engine
  if ! "$ENGINE" image exists "$IMAGE" 2>/dev/null; then build_image; return; fi
  local img_epoch src_epoch=0 f t
  img_epoch="$("$ENGINE" image inspect "$IMAGE" --format '{{.Created.Unix}}' 2>/dev/null || true)"
  [ -z "$img_epoch" ] && img_epoch=0
  for f in "$BENCH_DIR/Containerfile" "$BENCH_DIR/package.json" "$BENCH_DIR/pnpm-workspace.yaml" "$BENCH_DIR/.npmrc"; do
    [ -f "$f" ] || continue
    t="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
    [ "$t" -gt "$src_epoch" ] && src_epoch="$t"
  done
  if [ "$src_epoch" -gt "$img_epoch" ]; then
    echo "==> bench image is stale (Containerfile or manifest newer than image) - rebuilding"
    build_image
  fi
}

# Bring every host-side input into sync with source. Called by every runtime
# command so users never have to remember to run prep after pulling.
ensure_prereqs() {
  ensure_linux_binary
  ensure_plugin_dist
  ensure_marker_dist
  ensure_bench_image_fresh
}

# Manual prep command — same checks, but always announces what it's doing.
cmd_prep() {
  ensure_host_binary
  ensure_linux_binary
  ensure_plugin_dist
  ensure_marker_dist
}

prepare_cacerts() {
  rm -rf "$CACERTS_DIR"; mkdir -p "$CACERTS_DIR"
  if [ -n "$CA_SRC" ]; then
    if [ -d "$CA_SRC" ]; then cp "$CA_SRC"/*.crt "$CACERTS_DIR"/ 2>/dev/null || true
    elif [ -f "$CA_SRC" ]; then cp "$CA_SRC" "$CACERTS_DIR/extra-ca.crt"
    else die "BENCH_CA_CERT='$CA_SRC' is neither a file nor a directory"; fi
    echo "==> trusting extra CA certs from $CA_SRC"
  fi
  touch "$CACERTS_DIR/.gitkeep"
}

build_image() {
  prepare_cacerts
  echo "==> building $IMAGE from benchmarks/Containerfile"
  local net=(); [ -n "$BUILD_NETWORK" ] && net=(--network="$BUILD_NETWORK")
  ( cd "$BENCH_DIR" && "$ENGINE" build ${net[@]+"${net[@]}"} -t "$IMAGE" -f Containerfile . )
}

ensure_image() {
  "$ENGINE" image exists "$IMAGE" 2>/dev/null || build_image
}

# Echo the bind-mount args: benchmark src, the Go binary, and the first-party
# packages (into node_modules — they are repo source, not third-party deps).
mount_args() {
  [ -x "$LINUX_BIN" ] || die "missing $LINUX_BIN - run 'scripts/benchmarks.sh prep' first."
  [ -f "$MARKER_PKG/dist/index.js" ] || die "missing marker dist - run 'scripts/benchmarks.sh prep' first."
  [ -f "$PLUGIN_PKG/dist/index.js" ] || die "missing plugin dist - run 'scripts/benchmarks.sh prep' first."
  printf -- '-v\n%s:/app/src%s\n' "$BENCH_DIR/src" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/bin/ts-go-run-types:ro%s\n' "$LINUX_BIN" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/node_modules/@mionjs/ts-go-run-types:ro%s\n' "$MARKER_PKG" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/node_modules/vite-plugin-runtypes:ro%s\n' "$PLUGIN_PKG" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/typecost.mjs:ro%s\n' "$BENCH_DIR/typecost.mjs" "$MOUNT_OPTS"
}

net_args() { [ -n "$RUN_NETWORK" ] && printf -- '--network=%s\n' "$RUN_NETWORK"; }
typia_args() { [ -n "${BENCH_TYPIA:-}" ] && printf -- '-e\nBENCH_TYPIA=1\n'; }

run_in_container() {
  ensure_prereqs
  read_lines MARGS < <(mount_args)
  read_lines NARGS < <(net_args)
  read_lines TARGS < <(typia_args)
  local tty=(-i); [ -t 1 ] && tty+=(-t)   # interactive TTY only when attached (not in CI)
  exec "$ENGINE" run --rm ${tty[@]+"${tty[@]}"} --init \
    --name "${CONTAINER_BASE}-run" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${TARGS[@]+"${TARGS[@]}"} \
    -w /app "$IMAGE" "$@"
}

cmd_bench() {
  echo "==> building + running the benchmark in the container"
  run_in_container sh -c 'pnpm run build && node dist/run.mjs'
}

cmd_build() {
  echo "==> vite build only (-> container /app/dist)"
  run_in_container pnpm run build
}

cmd_typecost() {
  echo "==> measuring TS type-instantiation cost in the container"
  run_in_container node typecost.mjs
}

cmd_smoke() {
  echo "==> smoke: vite build in container (no full bench run)"
  run_in_container sh -c 'pnpm run build && test -d dist'
}

cmd_shell() { run_in_container bash; }

cmd_clean() {
  echo "==> removing image $IMAGE"
  "$ENGINE" rmi -f "$IMAGE" 2>/dev/null || true
}

main() {
  case "${1:-}" in
    prep)        cmd_prep ;;
    build-image) require_engine; build_image ;;
    bench|'')    require_engine; cmd_bench ;;
    build)       require_engine; cmd_build ;;
    smoke)       require_engine; cmd_smoke ;;
    typecost)    require_engine; cmd_typecost ;;
    shell)       require_engine; cmd_shell ;;
    clean)       require_engine; cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: prep | build-image | bench | build | smoke | typecost | shell | clean" ;;
  esac
}

main "$@"
