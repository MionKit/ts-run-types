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

die() { echo "benchmarks.sh: $*" >&2; exit 1; }

require_engine() {
  command -v "$ENGINE" >/dev/null 2>&1 \
    || die "container engine '$ENGINE' not found. Install podman (https://podman.io)."
}

# Build the Go binary + JS packages on the host (one-time / after changes).
cmd_prep() {
  command -v go >/dev/null 2>&1 || die "go toolchain not found (needed to build the resolver binary)."
  echo "==> building Go binary"
  ( cd "$ROOT_DIR" && go build -o bin/ts-go-run-types ./cmd/ts-go-run-types )
  echo "==> building @mionjs/ts-go-run-types + vite-plugin-runtypes"
  ( cd "$ROOT_DIR" && pnpm --filter vite-plugin-runtypes run build && pnpm --filter @mionjs/ts-go-run-types run build ) \
    || echo "  (package build reported errors; dist is still emitted — continuing)"
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
  ( cd "$BENCH_DIR" && "$ENGINE" build "${net[@]}" -t "$IMAGE" -f Containerfile . )
}

ensure_image() {
  "$ENGINE" image exists "$IMAGE" 2>/dev/null || build_image
}

# Echo the bind-mount args: benchmark src, the Go binary, and the first-party
# packages (into node_modules — they are repo source, not third-party deps).
mount_args() {
  [ -x "$BIN" ] || die "missing $BIN — run 'scripts/benchmarks.sh prep' first."
  [ -f "$MARKER_PKG/dist/index.js" ] || die "missing marker dist — run 'scripts/benchmarks.sh prep' first."
  [ -f "$PLUGIN_PKG/dist/index.js" ] || die "missing plugin dist — run 'scripts/benchmarks.sh prep' first."
  printf -- '-v\n%s:/app/src%s\n' "$BENCH_DIR/src" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/bin/ts-go-run-types:ro%s\n' "$BIN" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/node_modules/@mionjs/ts-go-run-types:ro%s\n' "$MARKER_PKG" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/node_modules/vite-plugin-runtypes:ro%s\n' "$PLUGIN_PKG" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/typecost.mjs:ro%s\n' "$BENCH_DIR/typecost.mjs" "$MOUNT_OPTS"
}

net_args() { [ -n "$RUN_NETWORK" ] && printf -- '--network=%s\n' "$RUN_NETWORK"; }
typia_args() { [ -n "${BENCH_TYPIA:-}" ] && printf -- '-e\nBENCH_TYPIA=1\n'; }

run_in_container() {
  ensure_image
  mapfile -t MARGS < <(mount_args)
  mapfile -t NARGS < <(net_args)
  mapfile -t TARGS < <(typia_args)
  local tty=(-i); [ -t 1 ] && tty+=(-t)   # interactive TTY only when attached (not in CI)
  exec "$ENGINE" run --rm "${tty[@]}" --init \
    --name "${CONTAINER_BASE}-run" \
    "${NARGS[@]}" "${MARGS[@]}" "${TARGS[@]}" \
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
    typecost)    require_engine; cmd_typecost ;;
    shell)       require_engine; cmd_shell ;;
    clean)       require_engine; cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: prep | build-image | bench | build | typecost | shell | clean" ;;
  esac
}

main "$@"
