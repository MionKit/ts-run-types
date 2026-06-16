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
#   scripts/benchmarks.sh capture-env       # write results/env.json (os / cpu / lib versions)
#   scripts/benchmarks.sh build [<name>]    # vite build only (all, or one competitor)
#   scripts/benchmarks.sh smoke             # quick verify: build every competitor's dist
#   scripts/benchmarks.sh shell             # debug shell inside the container
#   scripts/benchmarks.sh login             # log in to GHCR (uses GHCR_PAT / GHCR_PAT_FILE)
#   scripts/benchmarks.sh push              # build + push multi-arch image to GHCR
#   scripts/benchmarks.sh pull              # pull the published image and tag it locally
#   scripts/benchmarks.sh clean             # remove the image + typia .ttsc volume
#
# Env: BENCH_ENGINE(podman) BENCH_IMAGE(tsrt-bench:dev) BENCH_NO_TYPIA=1(skip typia)
#   (default)  run commands PULL the latest published GHCR image first.
#   BENCH_USE_LOCAL=1   skip the pull; build/use a local image (maintainer/offline).
#   BENCH_REMOTE_IMAGE  remote ref (default: ghcr.io/$GHCR_OWNER/tsrt-bench:latest).
#   GHCR_OWNER / GHCR_USER / GHCR_PAT / GHCR_PAT_FILE  (see scripts/lib-ghcr.sh).
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
DEPS_DIR="$BENCH_DIR/_deps"

# Canonical results dir the docs website reads from (mounted read-only there).
# Benchmark JSON is published into <docdata>/benchmarks after each run.
DOCDATA_DIR="${BENCH_DOCDATA:-$ROOT_DIR/.docdata}"

# Named volume persisting typia's one-time native-plugin compile (.ttsc) across
# --rm runs (node_modules itself is baked into the image; only .ttsc must survive).
VOL_TTSC="${BENCH_CONTAINER:-tsrt-bench}-typia-ttsc"

MARKER_PKG="$ROOT_DIR/packages/ts-go-run-types"
PLUGIN_PKG="$ROOT_DIR/packages/vite-plugin-runtypes"

# GHCR publish/pull helpers (login, push, pull) + the remote image ref. Run
# commands pull this prebuilt image by default; BENCH_USE_LOCAL=1 builds/uses a
# local image instead.
source "$SCRIPT_DIR/lib-ghcr.sh"
REMOTE_IMAGE="${BENCH_REMOTE_IMAGE:-$GHCR_REGISTRY/$GHCR_OWNER/tsrt-bench:latest}"
MANIFEST_NAME="tsrt-bench-manifest"

# Competitors run in this order. typia is included by default: each competitor
# installs in isolation (its own package.json + node_modules, so typia's
# heavy/fragile deps can't break the others), and a failed typia build/run
# degrades gracefully (build_and_run_one logs + continues, leaving its column
# blank for that run). Set BENCH_NO_TYPIA=1 to skip it on a host where its
# native plugin won't build.
competitor_list() {
  printf '%s\n' ts-go-run-types zod typebox ajv
  [ -z "${BENCH_NO_TYPIA:-}" ] && printf '%s\n' typia
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

# Rebuild the image only when a DEPENDENCY input changes. The image is deps-only;
# all benchmark source is bind-mounted at run time (see mount_args), so source
# edits never invalidate it. Triggers: the Containerfile or anything under _deps/
# (per-competitor + typecost package.json, pnpm-workspace.yaml, .npmrc).
ensure_bench_image_fresh() {
  require_engine
  if [ -n "${BENCH_USE_LOCAL:-}" ]; then ensure_bench_image_local; return; fi
  # DEFAULT: pull the latest published image first; fall back to a local image,
  # then to a local build, when the registry is unreachable.
  if ghcr_try_pull_retag "$REMOTE_IMAGE" "$IMAGE"; then return; fi
  if "$ENGINE" image exists "$IMAGE" 2>/dev/null; then
    echo "==> using existing local image $IMAGE" >&2; return
  fi
  echo "==> no published or local image available - building locally" >&2
  build_image
}

# Local-image path (BENCH_USE_LOCAL=1): build when missing, rebuild when a
# dependency input changed (Containerfile or anything under _deps/).
ensure_bench_image_local() {
  if ! "$ENGINE" image exists "$IMAGE" 2>/dev/null; then build_image; return; fi
  if [ ! -f "$STAMP" ] || needs_rebuild "$STAMP" "$DEPS_DIR"; then
    echo "==> bench image stale (_deps manifest newer than image) - rebuilding"; build_image; return
  fi
  if [ -f "$BENCH_DIR/Containerfile" ] && [ "$BENCH_DIR/Containerfile" -nt "$STAMP" ]; then
    echo "==> bench image stale (Containerfile newer) - rebuilding"; build_image; return
  fi
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

cmd_login() { require_engine; ghcr_login; }

cmd_push() {
  require_engine
  prepare_cacerts
  ghcr_push_multiarch "$MANIFEST_NAME" "$BENCH_DIR" "$REMOTE_IMAGE" "$BUILD_NETWORK"
}

cmd_pull() { require_engine; ghcr_pull_retag "$REMOTE_IMAGE" "$IMAGE"; }

# Bind-mounts. The image is deps-only, so ALL first-party benchmark source is
# mounted from the host here: the shared suite, each competitor's source FILES
# (mounted individually so the baked package.json + node_modules underneath stay
# intact and dist/ can be written into the image's writable layer), the typecost
# runner source, aggregate.mjs and tsconfig.base.json. Plus the TS-GO-only Go
# binary + first-party packages, typia's persisted .ttsc cache volume, and the
# writable results/ dir (so the per-competitor JSON survives the container).
mount_args() {
  [ -x "$LINUX_BIN" ] || die "missing $LINUX_BIN - run 'scripts/benchmarks.sh prep' first."
  [ -f "$MARKER_PKG/dist/index.js" ] || die "missing marker dist - run 'scripts/benchmarks.sh prep' first."
  [ -f "$PLUGIN_PKG/dist/index.js" ] || die "missing plugin dist - run 'scripts/benchmarks.sh prep' first."
  mkdir -p "$RESULTS_DIR"

  # Per-competitor source files (skip package.json/node_modules so they stay baked).
  local cdir competitor f base
  for cdir in "$BENCH_DIR"/competitors/*/; do
    [ -d "$cdir" ] || continue
    competitor="$(basename "$cdir")"
    for f in "$cdir"*; do
      [ -e "$f" ] || continue
      base="$(basename "$f")"
      case "$base" in node_modules|package.json|dist) continue ;; esac
      printf -- '-v\n%s:/app/competitors/%s/%s:ro%s\n' "$f" "$competitor" "$base" "$MOUNT_OPTS"
    done
  done

  # Shared suite (no deps) + the typecost runner source + the harness-level files.
  printf -- '-v\n%s:/app/shared:ro%s\n' "$BENCH_DIR/shared" "$MOUNT_OPTS"
  for f in "$BENCH_DIR"/typecost/*; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    case "$base" in node_modules|package.json|dist) continue ;; esac
    printf -- '-v\n%s:/app/typecost/%s:ro%s\n' "$f" "$base" "$MOUNT_OPTS"
  done
  printf -- '-v\n%s:/app/aggregate.mjs:ro%s\n' "$BENCH_DIR/aggregate.mjs" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/capture-env.mjs:ro%s\n' "$BENCH_DIR/capture-env.mjs" "$MOUNT_OPTS"
  printf -- '-v\n%s:/app/tsconfig.base.json:ro%s\n' "$BENCH_DIR/tsconfig.base.json" "$MOUNT_OPTS"

  # TS-GO competitor: host Go binary + first-party packages (writable RT cache aside).
  local tsgo=/app/competitors/ts-go-run-types
  printf -- '-v\n%s:%s/bin/ts-go-run-types:ro%s\n' "$LINUX_BIN" "$tsgo" "$MOUNT_OPTS"
  printf -- '-v\n%s:%s/node_modules/@mionjs/ts-go-run-types:ro%s\n' "$MARKER_PKG" "$tsgo" "$MOUNT_OPTS"
  printf -- '-v\n%s:%s/node_modules/vite-plugin-runtypes:ro%s\n' "$PLUGIN_PKG" "$tsgo" "$MOUNT_OPTS"

  # typia's one-time native-plugin compile persists in a named volume (subpath of
  # the baked node_modules); first BENCH_TYPIA run fills it, later runs reuse it.
  printf -- '-v\n%s:/app/competitors/typia/node_modules/.ttsc%s\n' "$VOL_TTSC" "$MOUNT_OPTS"

  printf -- '-v\n%s:/app/results%s\n' "$RESULTS_DIR" "$MOUNT_OPTS"
}

net_args() { [ -n "$RUN_NETWORK" ] && printf -- '--network=%s\n' "$RUN_NETWORK"; return 0; }

# Host CPU model - the container (a Linux VM on macOS) can't see it, so we read it
# host-side and pass it in for capture-env.mjs. sysctl on macOS, /proc/cpuinfo on Linux.
host_cpu() {
  local cpu=""
  if cpu="$(sysctl -n machdep.cpu.brand_string 2>/dev/null)" && [ -n "$cpu" ]; then
    printf '%s' "$cpu"
  elif [ -r /proc/cpuinfo ]; then
    cpu="$(grep -m1 -i 'model name' /proc/cpuinfo)" && printf '%s' "${cpu#*: }"
  fi
}

env_args() {
  printf -- '-e\nBENCH_RESULTS_DIR=/app/results\n'
  local hostCpu; hostCpu="$(host_cpu)"
  [ -n "$hostCpu" ] && printf -- '-e\nBENCH_HOST_CPU=%s\n' "$hostCpu"
  [ -n "${BENCH_NO_TIMING:-}" ] && printf -- '-e\nBENCH_NO_TIMING=%s\n' "$BENCH_NO_TIMING"
  [ -n "${BENCH_TIME_MS:-}" ]   && printf -- '-e\nBENCH_TIME_MS=%s\n' "$BENCH_TIME_MS"
  # Inspection knobs: BENCH_CASE=<substr> restricts BOTH the runtime bench and
  # typecost to matching cases (prints to console, leaves results JSON untouched);
  # BENCH_DUMP=<exact.key> prints the typecost probe sources for one case.
  [ -n "${BENCH_CASE:-}" ] && printf -- '-e\nBENCH_CASE=%s\n' "$BENCH_CASE"
  [ -n "${BENCH_DUMP:-}" ] && printf -- '-e\nBENCH_DUMP=%s\n' "$BENCH_DUMP"
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

# Copy the per-competitor result JSON into the canonical .docdata/benchmarks dir
# the docs website reads from. Keeps benchmarks/results/ as the working dir.
publish_docdata() {
  local dest="$DOCDATA_DIR/benchmarks"
  mkdir -p "$dest"
  cp "$RESULTS_DIR"/*.json "$dest"/ 2>/dev/null || true
  echo "==> published results -> $dest"
}

cmd_bench() {
  ensure_prereqs
  # BENCH_CASE inspection run: each competitor prints its matched case(s) and
  # leaves the canonical results JSON untouched, so skip the wipe/aggregate/publish.
  [ -z "${BENCH_CASE:-}" ] && { mkdir -p "$RESULTS_DIR"; find "$RESULTS_DIR" -maxdepth 1 -name '*.json' ! -name 'env.json' -delete 2>/dev/null || true; }
  local competitor
  for competitor in $(competitor_list); do build_and_run_one "$competitor"; done
  [ -n "${BENCH_CASE:-}" ] && { echo "==> BENCH_CASE='$BENCH_CASE': per-case console output above; results JSON, aggregate and docdata left untouched."; return 0; }
  echo "──────── aggregate ────────"
  run_in_container node aggregate.mjs
  publish_docdata
}

cmd_bench_one() {
  [ -n "${1:-}" ] || die "usage: bench-one <competitor> (ts-go-run-types|zod|typebox|ajv|typia)"
  ensure_prereqs
  [ -z "${BENCH_CASE:-}" ] && { mkdir -p "$RESULTS_DIR"; rm -f "$RESULTS_DIR/$1.json" 2>/dev/null || true; }
  build_and_run_one "$1"
  [ -n "${BENCH_CASE:-}" ] && { echo "==> BENCH_CASE='$BENCH_CASE': per-case console output above; results JSON, aggregate and docdata left untouched."; return 0; }
  echo "──────── aggregate ────────"
  run_in_container node aggregate.mjs
  publish_docdata
}

# One-shot: runtime benchmarks for every competitor + typecost, then publish all
# result JSON (runtime + typecost) to .docdata so the docs website renders them.
cmd_fullbench() {
  ensure_prereqs
  mkdir -p "$RESULTS_DIR"; find "$RESULTS_DIR" -maxdepth 1 -name '*.json' ! -name 'env.json' -delete 2>/dev/null || true
  local competitor
  for competitor in $(competitor_list); do build_and_run_one "$competitor"; done
  echo "==> aggregate"
  run_in_container node aggregate.mjs
  echo "==> typecost"
  run_in_container node typecost/typecost.mjs
  echo "==> capture run environment (os / cpu / library versions)"
  run_in_container node capture-env.mjs
  publish_docdata
  echo "==> fullbench: done. Published runtime + typecost results to $DOCDATA_DIR/benchmarks"
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
  echo "==> removing image $IMAGE and the typia .ttsc volume"
  "$ENGINE" rmi -f "$IMAGE" 2>/dev/null || true
  "$ENGINE" volume rm -f "$VOL_TTSC" 2>/dev/null || true
  rm -f "$STAMP"
}

main() {
  case "${1:-}" in
    prep)        cmd_prep ;;
    build-image) require_engine; build_image ;;
    bench|'')    require_engine; cmd_bench ;;
    bench-one)   require_engine; cmd_bench_one "${2:-}" ;;
    fullbench)   require_engine; cmd_fullbench ;;
    build)       require_engine; cmd_build "${2:-}" ;;
    smoke)       require_engine; cmd_smoke ;;
    typecost)    require_engine; cmd_typecost ;;
    capture-env) require_engine; ensure_prereqs; run_in_container node capture-env.mjs ;;
    shell)       require_engine; cmd_shell ;;
    login)       cmd_login ;;
    push)        cmd_push ;;
    pull)        cmd_pull ;;
    clean)       require_engine; cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: prep | build-image | bench | bench-one <name> | fullbench | build [<name>] | smoke | typecost | shell | login | push | pull | clean" ;;
  esac
}

main "$@"
