#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# benchmarks.sh — drive the isolated (podman) validation benchmarks.
#
# Each competitor (ts-go-run-types / zod / typebox / ajv / typia) is its OWN
# isolated build: its deps install into its own node_modules inside the image
# (so e.g. typia's heavy/fragile tree never touches the others), it imports the
# shared suite + harness, builds with vite into its own dist/, and runs as its
# own process writing results/<name>.json. aggregate.mjs then joins those into
# one comparison table. The ts-go-run-types competitor additionally gets the host
# Go binary + the first-party packages (@mionjs/ts-go-run-types,
# vite-plugin-runtypes) bind-mounted into ITS node_modules so the plugin can
# rewrite createValidate<T>() at build time.
#
# Usage:
#   scripts/benchmarks.sh prep              # build the Go binary + JS packages (host)
#   scripts/benchmarks.sh build-image       # build the podman image (per-competitor installs)
#   scripts/benchmarks.sh bench             # build + run EVERY competitor + aggregate
#   scripts/benchmarks.sh bench-one <name>  # build + run ONE competitor + aggregate
#   scripts/benchmarks.sh typecost          # per-competitor type-instantiation cost
#   scripts/benchmarks.sh build [<name>]    # vite build only (all, or one competitor)
#   scripts/benchmarks.sh smoke             # quick verify: build every competitor's dist
#   scripts/benchmarks.sh shell             # debug shell inside the container
#   scripts/benchmarks.sh clean             # remove the image
#
# Env: BENCH_ENGINE(podman) BENCH_IMAGE(tsrt-bench:dev) BENCH_TYPIA=1(add typia)
#   BENCH_CA_CERT  file/dir of extra CA certs (corporate/MITM proxy); when unset,
#                  auto-detects /usr/local/share/ca-certificates (proxied envs).
#   BENCH_NO_TIMING=1 / BENCH_TIME_MS=N  correctness-only / per-cell window.
#   BENCH_BUILD_NETWORK / BENCH_RUN_NETWORK / BENCH_MOUNT_OPTS
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
RESULTS_DIR="$BENCH_DIR/results"
STAMP="$BENCH_DIR/.image-stamp"

MARKER_PKG="$ROOT_DIR/packages/ts-go-run-types"
PLUGIN_PKG="$ROOT_DIR/packages/vite-plugin-runtypes"

# Competitors run in this order; typia (heavy/fragile deps) only with BENCH_TYPIA.
competitor_list() {
  printf '%s\n' ts-go-run-types zod typebox ajv
  [ -n "${BENCH_TYPIA:-}" ] && printf '%s\n' typia
  return 0
}

linux_goarch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)             echo "amd64" ;;
  esac
}
LINUX_BIN="$ROOT_DIR/bin/ts-go-run-types-linux-$(linux_goarch)"

die() { echo "benchmarks.sh: $*" >&2; exit 1; }

read_lines() {
  local _n="$1" _l
  eval "$_n=()"
  while IFS= read -r _l; do eval "$_n+=(\"\$_l\")"; done
}

require_engine() {
  command -v "$ENGINE" >/dev/null 2>&1 \
    || die "container engine '$ENGINE' not found. Install podman (https://podman.io)."
}

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

# Stale-build checks (Go host bin, Go linux cross-bin, marker dist, plugin dist)
# are delegated to scripts/check-stale-builds.sh — same script `pnpm test` uses,
# so any build hardening lands in one place. It does build-id comparison for
# the Go binaries and structural (.d.ts.map / .d.ts pairing + sentinel) checks
# for the TS dists, then wipes tsbuildinfo and rebuilds clean when stale.
ensure_artifacts() {
  ( cd "$ROOT_DIR" && bash scripts/check-stale-builds.sh "$@" )
}

# Rebuild the image when the Containerfile or any baked source (shared/,
# competitors/, typecost/, aggregate.mjs, configs) is newer than the last build.
ensure_bench_image_fresh() {
  require_engine
  if ! "$ENGINE" image exists "$IMAGE" 2>/dev/null; then build_image; return; fi
  if [ ! -f "$STAMP" ] || needs_rebuild "$STAMP" "$BENCH_DIR/shared" "$BENCH_DIR/competitors" "$BENCH_DIR/typecost"; then
    echo "==> bench image stale (source newer than image) - rebuilding"; build_image; return
  fi
  local f
  for f in "$BENCH_DIR/Containerfile" "$BENCH_DIR/aggregate.mjs" "$BENCH_DIR/pnpm-workspace.yaml" "$BENCH_DIR/.npmrc" "$BENCH_DIR/tsconfig.base.json"; do
    if [ -f "$f" ] && [ "$f" -nt "$STAMP" ]; then
      echo "==> bench image stale ($(basename "$f") newer) - rebuilding"; build_image; return
    fi
  done
}

ensure_prereqs() {
  ensure_artifacts all linux-go
  ensure_bench_image_fresh
}

cmd_prep() {
  ensure_artifacts all linux-go
}

prepare_cacerts() {
  rm -rf "$CACERTS_DIR"; mkdir -p "$CACERTS_DIR"
  # Behind a corporate / MITM egress proxy the image must trust the proxy CA to
  # install deps over TLS. When no explicit BENCH_CA_CERT was given, fall back to
  # the host's standard custom-CA dir IF it holds certs (proxied envs); harmless
  # no-op otherwise. The host already trusts these; we propagate them into the image.
  local host_ca_dir=/usr/local/share/ca-certificates
  if [ -z "$CA_SRC" ] && [ -d "$host_ca_dir" ] && ls "$host_ca_dir"/*.crt >/dev/null 2>&1; then
    CA_SRC="$host_ca_dir"
    echo "==> auto-detected host CA certs in $host_ca_dir (corporate/MITM proxy); trusting them in the image"
  fi
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
  echo "==> building $IMAGE from benchmarks/Containerfile (per-competitor installs)"
  local net=(); [ -n "$BUILD_NETWORK" ] && net=(--network="$BUILD_NETWORK")
  ( cd "$BENCH_DIR" && "$ENGINE" build ${net[@]+"${net[@]}"} -t "$IMAGE" -f Containerfile . )
  touch "$STAMP"
}

ensure_image() {
  "$ENGINE" image exists "$IMAGE" 2>/dev/null || build_image
}

# Bind-mounts: the host Go binary + first-party packages into the TS-GO competitor
# only, and the writable results/ dir (so the per-competitor JSON survives the
# container). Everything else is baked into the image.
mount_args() {
  [ -x "$LINUX_BIN" ] || die "missing $LINUX_BIN - run 'scripts/benchmarks.sh prep' first."
  [ -f "$MARKER_PKG/dist/index.js" ] || die "missing marker dist - run 'scripts/benchmarks.sh prep' first."
  [ -f "$PLUGIN_PKG/dist/index.js" ] || die "missing plugin dist - run 'scripts/benchmarks.sh prep' first."
  mkdir -p "$RESULTS_DIR"
  local tsgo=/app/competitors/ts-go-run-types
  printf -- '-v\n%s:%s/bin/ts-go-run-types:ro%s\n' "$LINUX_BIN" "$tsgo" "$MOUNT_OPTS"
  printf -- '-v\n%s:%s/node_modules/@mionjs/ts-go-run-types:ro%s\n' "$MARKER_PKG" "$tsgo" "$MOUNT_OPTS"
  printf -- '-v\n%s:%s/node_modules/vite-plugin-runtypes:ro%s\n' "$PLUGIN_PKG" "$tsgo" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/results%s\n' "$RESULTS_DIR" "$MOUNT_OPTS"
}

net_args() { [ -n "$RUN_NETWORK" ] && printf -- '--network=%s\n' "$RUN_NETWORK"; return 0; }

env_args() {
  printf -- '-e\nBENCH_RESULTS_DIR=/app/results\n'
  [ -n "${BENCH_NO_TIMING:-}" ] && printf -- '-e\nBENCH_NO_TIMING=%s\n' "$BENCH_NO_TIMING"
  [ -n "${BENCH_TIME_MS:-}" ]   && printf -- '-e\nBENCH_TIME_MS=%s\n' "$BENCH_TIME_MS"
  return 0
}

# Run a command in a fresh --rm container (NOT exec — callers run several).
run_in_container() {
  read_lines MARGS < <(mount_args)
  read_lines NARGS < <(net_args)
  read_lines EARGS < <(env_args)
  # Attach stdin/tty ONLY when actually interactive; otherwise feed /dev/null so
  # `podman run` never swallows the caller's stdin (e.g. a loop's competitor list).
  if [ -t 0 ]; then
    "$ENGINE" run --rm -it --init \
      ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
      -w /app "$IMAGE" "$@"
  else
    "$ENGINE" run --rm --init \
      ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
      -w /app "$IMAGE" "$@" </dev/null
  fi
}

# Build + run one competitor in its own container (isolation); failure is reported
# but never aborts the loop (so one broken competitor can't sink the rest).
build_and_run_one() {
  local competitor="$1"
  echo "──────── competitor: $competitor ────────"
  run_in_container sh -c "cd competitors/$competitor && pnpm run build && node dist/run.mjs" \
    || echo "==> competitor '$competitor' FAILED (build or run) — see output above"
}

cmd_bench() {
  ensure_prereqs
  mkdir -p "$RESULTS_DIR"; rm -f "$RESULTS_DIR"/*.json 2>/dev/null || true
  local competitor
  for competitor in $(competitor_list); do build_and_run_one "$competitor"; done
  echo "──────── aggregate ────────"
  run_in_container node aggregate.mjs
}

cmd_bench_one() {
  [ -n "${1:-}" ] || die "usage: bench-one <competitor> (ts-go-run-types|zod|typebox|ajv|typia)"
  ensure_prereqs
  mkdir -p "$RESULTS_DIR"; rm -f "$RESULTS_DIR/$1.json" 2>/dev/null || true
  build_and_run_one "$1"
  echo "──────── aggregate ────────"
  run_in_container node aggregate.mjs
}

cmd_build() {
  ensure_prereqs
  if [ -n "${1:-}" ]; then
    run_in_container sh -c "cd competitors/$1 && pnpm run build && test -d dist"
  else
    local competitor
    for competitor in $(competitor_list); do
      echo "──────── build: $competitor ────────"
      run_in_container sh -c "cd competitors/$competitor && pnpm run build && test -d dist" \
        || echo "==> build '$competitor' FAILED"
    done
  fi
}

cmd_typecost() {
  ensure_prereqs
  echo "==> measuring per-competitor TS type-instantiation cost in the container"
  run_in_container node typecost/typecost.mjs
}

cmd_smoke() {
  ensure_prereqs
  echo "==> smoke: build every competitor's dist (no run)"
  cmd_build
}

cmd_shell() { ensure_prereqs; run_in_container bash; }

cmd_clean() {
  echo "==> removing image $IMAGE"
  "$ENGINE" rmi -f "$IMAGE" 2>/dev/null || true
  rm -f "$STAMP"
}

main() {
  case "${1:-}" in
    prep)        cmd_prep ;;
    build-image) require_engine; build_image ;;
    bench|'')    require_engine; cmd_bench ;;
    bench-one)   require_engine; cmd_bench_one "${2:-}" ;;
    build)       require_engine; cmd_build "${2:-}" ;;
    smoke)       require_engine; cmd_smoke ;;
    typecost)    require_engine; cmd_typecost ;;
    shell)       require_engine; cmd_shell ;;
    clean)       require_engine; cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: prep | build-image | bench | bench-one <name> | build [<name>] | smoke | typecost | shell | clean" ;;
  esac
}

main "$@"
