#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# benchmarks.sh - drive the validation benchmarks inside the shared (podman) image.
#
# The image is BUILT + PUBLISHED by scripts/podman-website.sh: ONE merged image holds the
# website deps (at /app) and the benchmark deps (at /bench), in separate dirs with
# separate node_modules. This script runs the benchmark half under WORKDIR /bench
# and delegates image build/login/push/pull to podman-website.sh, so the image has a
# single owner (CI can pull one image and build the whole site).
#
# Each competitor (ts-runtypes / zod / typebox / ajv / typia) is its OWN isolated
# build: its deps live in its own /bench/competitors/<name>/node_modules baked into
# the image (so e.g. typia's heavy/fragile tree never touches the others). At run
# time the shared suite + harness + per-competitor source are bind-mounted, each
# competitor builds with vite into its own dist/, and runs as its own process
# writing results/<name>.json. aggregate.mjs joins those into one table. The
# ts-runtypes competitor additionally gets the host Go binary + the first-party
# packages (ts-runtypes, runtypes-devtools) bind-mounted into ITS node_modules
# so the plugin can rewrite createValidate<T>() at build time.
#
# Usage:
#   scripts/benchmarks.sh prep              # build the Go binary + JS packages (host)
#   scripts/benchmarks.sh build-image       # build the shared image (delegates to podman-website.sh)
#   scripts/benchmarks.sh bench             # build + run EVERY competitor + aggregate
#   scripts/benchmarks.sh bench-one <name>  # build + run ONE competitor + aggregate
#   scripts/benchmarks.sh serialization     # ts-runtypes round-trip bench (+ formats), in-container
#   scripts/benchmarks.sh website-bench     # ALL website bench data in one shot (Node 26)
#   scripts/benchmarks.sh typecost          # per-competitor type-instantiation cost
#   scripts/benchmarks.sh capture-env       # write results/env.json (os / cpu / lib versions)
#   scripts/benchmarks.sh build [<name>]    # vite build only (all, or one competitor)
#   scripts/benchmarks.sh smoke             # quick verify: build every competitor's dist
#   scripts/benchmarks.sh shell             # debug shell inside the container
#   scripts/benchmarks.sh login             # log in to GHCR (delegates to podman-website.sh)
#   scripts/benchmarks.sh push              # build + push the shared multi-arch image to GHCR
#   scripts/benchmarks.sh pull              # pull the shared published image and tag it locally
#   scripts/benchmarks.sh clean             # remove the typia .ttsc volume
#
# Env: BENCH_ENGINE(podman) BENCH_IMAGE(tsrt-website:dev) BENCH_NO_TYPIA=1(skip typia)
#   (default)  run commands PULL the latest published shared image first.
#   BENCH_USE_LOCAL=1   skip the pull; build/use a local image (maintainer/offline).
#   BENCH_REMOTE_IMAGE  remote ref (default: ghcr.io/$GHCR_OWNER/tsrt-website:latest).
#   GHCR_OWNER / GHCR_USER / GHCR_PAT / GHCR_PAT_FILE  (see scripts/lib-ghcr.sh).
#   BENCH_CA_CERT  file/dir of extra CA certs (corporate/MITM proxy), forwarded to the build.
#   BENCH_BASE_IMAGE / BENCH_PNPM_VERSION  forwarded to the podman-website.sh build.
#   BENCH_NO_TIMING=1 / BENCH_TIME_MS=N  correctness-only / per-cell window.
#   BENCH_BUILD_NETWORK / BENCH_RUN_NETWORK / BENCH_MOUNT_OPTS
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BENCH_DIR="$ROOT_DIR/container-benchmarks"
MANAGER_SH="$SCRIPT_DIR/podman-website.sh"

ENGINE="${BENCH_ENGINE:-podman}"
# The benchmark half of the shared website+benchmark image (built by podman-website.sh).
IMAGE="${BENCH_IMAGE:-tsrt-website:dev}"
CONTAINER_BASE="${BENCH_CONTAINER:-tsrt-bench}"
MOUNT_OPTS="${BENCH_MOUNT_OPTS:-}"
RUN_NETWORK="${BENCH_RUN_NETWORK:-}"
RESULTS_DIR="$BENCH_DIR/results"

# Canonical results dir the docs website reads from (mounted read-only there).
# Benchmark JSON is published into <docdata>/benchmarks after each run.
DOCDATA_DIR="${BENCH_DOCDATA:-$ROOT_DIR/.docdata}"

# Named volume persisting typia's one-time native-plugin compile (.ttsc) across
# --rm runs (node_modules itself is baked into the image; only .ttsc must survive).
VOL_TTSC="${BENCH_CONTAINER:-tsrt-bench}-typia-ttsc"

MARKER_PKG="$ROOT_DIR/packages/ts-runtypes"
PLUGIN_PKG="$ROOT_DIR/packages/runtypes-devtools"

# GHCR remote ref of the shared image (the same one podman-website.sh publishes). Run
# commands pull it by default; BENCH_USE_LOCAL=1 builds/uses a local image instead.
source "$SCRIPT_DIR/lib-ghcr.sh"
REMOTE_IMAGE="${BENCH_REMOTE_IMAGE:-$GHCR_REGISTRY/$GHCR_OWNER/tsrt-website:latest}"

# Competitors run in this order. typia is included by default: each competitor
# installs in isolation (its own package.json + node_modules), and a failed typia
# build/run degrades gracefully (build_and_run_one logs + continues, leaving its
# column blank). Set BENCH_NO_TYPIA=1 to skip it where its native plugin won't build.
competitor_list() {
  printf '%s\n' ts-runtypes zod typebox ajv
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
LINUX_BIN="$ROOT_DIR/bin/ts-runtypes-linux-$(linux_goarch)"
LINUX_EXTRACT_BIN="$ROOT_DIR/bin/extract-fn-bodies-linux-$(linux_goarch)"

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

# Stale-build checks (Go host bin, Go linux cross-bin, marker dist, plugin dist)
# are delegated to scripts/check-stale-builds.sh - the same script `pnpm test` uses.
ensure_artifacts() {
  ( cd "$ROOT_DIR" && bash scripts/check-stale-builds.sh "$@" )
}

# Run a podman-website.sh image command (build-image / login / push / pull / ensure) with
# the bench env mapped onto podman-website.sh's knobs, so the shared image has one owner.
run_manager() {
  (
    export WEBSITE_IMAGE="$IMAGE" WEBSITE_REMOTE_IMAGE="$REMOTE_IMAGE"
    if [ -n "${BENCH_ENGINE:-}" ];        then export WEBSITE_ENGINE="$BENCH_ENGINE"; fi
    if [ -n "${BENCH_BASE_IMAGE:-}" ];    then export WEBSITE_BASE_IMAGE="$BENCH_BASE_IMAGE"; fi
    if [ -n "${BENCH_PNPM_VERSION:-}" ];  then export WEBSITE_PNPM_VERSION="$BENCH_PNPM_VERSION"; fi
    if [ -n "${BENCH_CA_CERT:-}" ];       then export WEBSITE_CA_CERT="$BENCH_CA_CERT"; fi
    if [ -n "${BENCH_BUILD_NETWORK:-}" ]; then export WEBSITE_BUILD_NETWORK="$BENCH_BUILD_NETWORK"; fi
    if [ -n "${BENCH_USE_LOCAL:-}" ];     then export WEBSITE_USE_LOCAL=1; fi
    bash "$MANAGER_SH" "$@"
  )
}

# Image lifecycle is owned by podman-website.sh (one merged image). Delegate to it.
build_image()         { run_manager build-image; }
cmd_login()           { run_manager login; }
cmd_push()            { run_manager push; }
cmd_pull()            { run_manager pull; }
# Make the shared image ready (pull-or-build, honoring BENCH_USE_LOCAL) without running.
ensure_shared_image() { run_manager ensure; }

ensure_prereqs() {
  ensure_artifacts all linux-go linux-extract
  ensure_shared_image
}

cmd_prep() {
  ensure_artifacts all linux-go linux-extract
}

# Bind-mounts. The image is deps-only, so ALL first-party benchmark source is
# mounted from the host here, under /bench (the benchmark root in the shared image):
# the shared suite, each competitor's source FILES (mounted individually so the
# baked package.json + node_modules underneath stay intact and dist/ can be written
# into the image's writable layer), the typecost runner source, aggregate.mjs and
# tsconfig.base.json. Plus the TS-GO-only Go binary + first-party packages, typia's
# persisted .ttsc cache volume, and the writable results/ dir.
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
      printf -- '-v\n%s:/bench/competitors/%s/%s:ro%s\n' "$f" "$competitor" "$base" "$MOUNT_OPTS"
    done
  done

  # Shared suite (no deps) + the typecost runner source + the harness-level files.
  printf -- '-v\n%s:/bench/shared:ro%s\n' "$BENCH_DIR/shared" "$MOUNT_OPTS"
  for f in "$BENCH_DIR"/typecost/*; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"
    case "$base" in node_modules|package.json|dist) continue ;; esac
    printf -- '-v\n%s:/bench/typecost/%s:ro%s\n' "$f" "$base" "$MOUNT_OPTS"
  done
  printf -- '-v\n%s:/bench/aggregate.mjs:ro%s\n' "$BENCH_DIR/aggregate.mjs" "$MOUNT_OPTS"
  printf -- '-v\n%s:/bench/capture-env.mjs:ro%s\n' "$BENCH_DIR/capture-env.mjs" "$MOUNT_OPTS"
  printf -- '-v\n%s:/bench/tsconfig.base.json:ro%s\n' "$BENCH_DIR/tsconfig.base.json" "$MOUNT_OPTS"

  # TS-GO competitor: host Go binary + first-party packages (writable RT cache aside).
  local tsgo=/bench/competitors/ts-runtypes
  printf -- '-v\n%s:%s/bin/ts-runtypes:ro%s\n' "$LINUX_BIN" "$tsgo" "$MOUNT_OPTS"
  printf -- '-v\n%s:%s/node_modules/ts-runtypes:ro%s\n' "$MARKER_PKG" "$tsgo" "$MOUNT_OPTS"
  printf -- '-v\n%s:%s/node_modules/runtypes-devtools:ro%s\n' "$PLUGIN_PKG" "$tsgo" "$MOUNT_OPTS"

  # typia's one-time native-plugin compile persists in a named volume (subpath of
  # the baked node_modules); first typia run fills it, later runs reuse it.
  printf -- '-v\n%s:/bench/competitors/typia/node_modules/.ttsc%s\n' "$VOL_TTSC" "$MOUNT_OPTS"

  printf -- '-v\n%s:/bench/results%s\n' "$RESULTS_DIR" "$MOUNT_OPTS"
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
  printf -- '-e\nBENCH_RESULTS_DIR=/bench/results\n'
  local hostCpu; hostCpu="$(host_cpu)"
  [ -n "$hostCpu" ] && printf -- '-e\nBENCH_HOST_CPU=%s\n' "$hostCpu"
  [ -n "${BENCH_NO_TIMING:-}" ] && printf -- '-e\nBENCH_NO_TIMING=%s\n' "$BENCH_NO_TIMING"
  [ -n "${BENCH_TIME_MS:-}" ]   && printf -- '-e\nBENCH_TIME_MS=%s\n' "$BENCH_TIME_MS"
  # Inspection knobs: BENCH_CASE=<substr> restricts BOTH the runtime bench and
  # typecost to matching cases; BENCH_DUMP=<exact.key> prints typecost probe sources.
  [ -n "${BENCH_CASE:-}" ] && printf -- '-e\nBENCH_CASE=%s\n' "$BENCH_CASE"
  [ -n "${BENCH_DUMP:-}" ] && printf -- '-e\nBENCH_DUMP=%s\n' "$BENCH_DUMP"
  return 0
}

# Run a command in a fresh --rm container (NOT exec - callers run several).
run_in_container() {
  read_lines MARGS < <(mount_args)
  read_lines NARGS < <(net_args)
  read_lines EARGS < <(env_args)
  # Attach stdin/tty ONLY when actually interactive; otherwise feed /dev/null so
  # `podman run` never swallows the caller's stdin (e.g. a loop's competitor list).
  if [ -t 0 ]; then
    "$ENGINE" run --rm -it --init \
      ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
      -w /bench "$IMAGE" "$@"
  else
    "$ENGINE" run --rm --init \
      ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
      -w /bench "$IMAGE" "$@" </dev/null
  fi
}

# Build + run one competitor in its own container (isolation); failure is reported
# but never aborts the loop (so one broken competitor can't sink the rest).
build_and_run_one() {
  local competitor="$1"
  echo "-------- competitor: $competitor --------"
  run_in_container sh -c "cd competitors/$competitor && pnpm run build && node dist/run.mjs" \
    || echo "==> competitor '$competitor' FAILED (build or run) - see output above"
}

# Copy the per-competitor result JSON into the canonical .docdata/benchmarks dir
# the docs website reads from. Keeps container-benchmarks/results/ as the working dir.
publish_docdata() {
  local dest="$DOCDATA_DIR/benchmarks"
  mkdir -p "$dest"
  cp "$RESULTS_DIR"/*.json "$dest"/ 2>/dev/null || true
  echo "==> published results -> $dest"
}

cmd_bench() {
  ensure_prereqs
  # BENCH_CASE inspection run: leave the canonical results JSON untouched.
  [ -z "${BENCH_CASE:-}" ] && { mkdir -p "$RESULTS_DIR"; find "$RESULTS_DIR" -maxdepth 1 -name '*.json' ! -name 'env.json' -delete 2>/dev/null || true; }
  local competitor
  for competitor in $(competitor_list); do build_and_run_one "$competitor"; done
  [ -n "${BENCH_CASE:-}" ] && { echo "==> BENCH_CASE='$BENCH_CASE': per-case console output above; results JSON, aggregate and docdata left untouched."; return 0; }
  echo "-------- aggregate --------"
  run_in_container node aggregate.mjs
  publish_docdata
}

cmd_bench_one() {
  [ -n "${1:-}" ] || die "usage: bench-one <competitor> (ts-runtypes|zod|typebox|ajv|typia)"
  ensure_prereqs
  [ -z "${BENCH_CASE:-}" ] && { mkdir -p "$RESULTS_DIR"; rm -f "$RESULTS_DIR/$1.json" 2>/dev/null || true; }
  build_and_run_one "$1"
  [ -n "${BENCH_CASE:-}" ] && { echo "==> BENCH_CASE='$BENCH_CASE': per-case console output above; results JSON, aggregate and docdata left untouched."; return 0; }
  echo "-------- aggregate --------"
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

# serialization bench (ts-runtypes-only round-trips). Runs gen-serialization-bench.mjs
# INSIDE the Node 26 container so the timed encoders/decoders execute on native
# Temporal. Reuses the ts-runtypes competitor context (the baked vite, the
# bind-mounted marker package, the plugin, the Go resolver binary) plus the Linux
# source extractor (so no Go toolchain is needed in-container). Writes both the
# serialization and serialization-formats datasets into container-website/public/bench-data
# (override with BENCH_SERIALIZATION_OUT).
cmd_serialization() {
  ensure_prereqs
  [ -x "$LINUX_EXTRACT_BIN" ] || die "missing $LINUX_EXTRACT_BIN - run 'scripts/benchmarks.sh prep' first."
  [ -f "$MARKER_PKG/dist/index.js" ] || die "missing marker dist - run 'scripts/benchmarks.sh prep' first."
  [ -f "$PLUGIN_PKG/dist/index.js" ] || die "missing plugin dist - run 'scripts/benchmarks.sh prep' first."
  local out="${BENCH_SERIALIZATION_OUT:-$ROOT_DIR/container-website/public/bench-data}"
  mkdir -p "$out"
  local tsgo=/bench/competitors/ts-runtypes
  read_lines NARGS < <(net_args)
  echo "==> serialization bench (in-container, Node 26 / native Temporal) -> $out"
  "$ENGINE" run --rm --init \
    ${NARGS[@]+"${NARGS[@]}"} \
    -v "$LINUX_BIN:$tsgo/bin/ts-runtypes:ro$MOUNT_OPTS" \
    -v "$LINUX_EXTRACT_BIN:$tsgo/bin/extract-fn-bodies:ro$MOUNT_OPTS" \
    -v "$MARKER_PKG:$tsgo/node_modules/ts-runtypes:ro$MOUNT_OPTS" \
    -v "$PLUGIN_PKG:$tsgo/node_modules/runtypes-devtools:ro$MOUNT_OPTS" \
    -v "$SCRIPT_DIR/gen-serialization-bench.mjs:$tsgo/gen-serialization-bench.mjs:ro$MOUNT_OPTS" \
    -v "$out:/bench/bench-out$MOUNT_OPTS" \
    -e RT_BENCH_REPO_ROOT="$tsgo" \
    -e RT_BENCH_VITE_ROOT="$tsgo" \
    -e RT_BENCH_PACKAGE_ROOT="$tsgo/node_modules/ts-runtypes" \
    -e RT_BENCH_BIN="$tsgo/bin/ts-runtypes" \
    -e RT_BENCH_PLUGIN_ENTRY=runtypes-devtools \
    -e RT_EXTRACT_BIN="$tsgo/bin/extract-fn-bodies" \
    -e RT_BENCH_OUT_DIR=/bench/bench-out \
    -e RT_BENCH_SSR_NOEXTERNAL=ts-runtypes,runtypes-devtools \
    -e RT_BENCH_CACHE_DIR=false \
    -w "$tsgo" "$IMAGE" \
    sh -c 'node gen-serialization-bench.mjs --suite serialization && node gen-serialization-bench.mjs --suite format-serialization' </dev/null
}

# One command for ALL benchmark data the docs website renders, every measurement
# taken inside the Node 26 container (native Temporal, consistent runtime):
#   1. runtime validation bench (every competitor) + aggregate + typecost + capture-env
#   2. serialization + serialization-formats round-trips
#   3. gen-bench-docs (host transform: container-benchmarks/results -> container-website/public/bench-data)
cmd_website_bench() {
  cmd_fullbench
  cmd_serialization
  echo "==> gen-bench-docs (host transform -> container-website/public/bench-data)"
  ( cd "$ROOT_DIR" && node scripts/gen-bench-docs.mjs )
  echo "==> website-bench: done. container-website/public/bench-data/ regenerated (Node 26 / native Temporal)."
}

cmd_build() {
  ensure_prereqs
  if [ -n "${1:-}" ]; then
    run_in_container sh -c "cd competitors/$1 && pnpm run build && test -d dist"
  else
    local competitor
    for competitor in $(competitor_list); do
      echo "-------- build: $competitor --------"
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
  echo "==> removing the typia .ttsc volume (the shared image is managed by 'scripts/podman-website.sh clean')"
  "$ENGINE" volume rm -f "$VOL_TTSC" 2>/dev/null || true
}

main() {
  case "${1:-}" in
    prep)        cmd_prep ;;
    build-image) build_image ;;
    bench|'')    require_engine; cmd_bench ;;
    bench-one)   require_engine; cmd_bench_one "${2:-}" ;;
    fullbench)   require_engine; cmd_fullbench ;;
    serialization) require_engine; cmd_serialization ;;
    website-bench) require_engine; cmd_website_bench ;;
    build)       require_engine; cmd_build "${2:-}" ;;
    smoke)       require_engine; cmd_smoke ;;
    typecost)    require_engine; cmd_typecost ;;
    capture-env) require_engine; ensure_prereqs; run_in_container node capture-env.mjs ;;
    shell)       require_engine; cmd_shell ;;
    login)       cmd_login ;;
    push)        cmd_push ;;
    pull)        cmd_pull ;;
    clean)       require_engine; cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: prep | build-image | bench | bench-one <name> | fullbench | serialization | website-bench | build [<name>] | smoke | typecost | shell | login | push | pull | clean" ;;
  esac
}

main "$@"
