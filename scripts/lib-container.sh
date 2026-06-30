# lib-container.sh - shared config + helpers for the containerized apps, sourced
# (never executed) by scripts/podman-website.sh (image lifecycle), scripts/website.sh
# (run the docs site) and indirectly by scripts/benchmarks.sh's delegation.
#
# Defines the container engine, the SINGLE shared image name (website deps at /app,
# benchmark deps at /bench), the container/volume names, and the small helpers both
# entrypoints need (die, read_lines, engine readiness). Image lifecycle lives in
# podman-website.sh; the run commands live in website.sh; benchmarks.sh delegates
# image ops to podman-website.sh. ASCII-only by policy (macOS bash 3.2 mis-parses
# UTF-8 in variable expansions). Sourcing this has no side effects beyond defining
# vars + functions.

# Repo paths. The sourcing entrypoint normally presets ROOT_DIR; fall back to this
# lib's own location (scripts/..) when it didn't, so sourcing is robust either way.
if [ -z "${ROOT_DIR:-}" ]; then
  ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
WEBSITE_DIR="$ROOT_DIR/container/website"

# Load repo-root .env (git-ignored) so local config - GHCR_PAT, *_USE_LOCAL, etc. -
# lives in one file (see .env.example). Guarded so sourcing both libs loads once;
# 'set -a' exports each assignment. No .env (e.g. in CI) is a silent no-op, so it
# never affects environment-provided vars there. Only uncommented lines apply.
if [ -z "${RT_ENV_LOADED:-}" ]; then
  RT_ENV_LOADED=1
  if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    . "$ROOT_DIR/.env"
    set +a
  fi
fi

ENGINE="${WEBSITE_ENGINE:-podman}"
# The single shared image. Built/published by podman-website.sh; run by website.sh
# (at /app) and benchmarks.sh (at /bench).
IMAGE="${WEBSITE_IMAGE:-tsrt-website:dev}"
CONTAINER_BASE="${WEBSITE_CONTAINER:-tsrt-website}"
MOUNT_OPTS="${WEBSITE_MOUNT_OPTS:-}"

# Named volumes hold Nuxt's generated caches (run side) so restarts stay fast and
# the host tree is never written to; podman-website.sh:clean drops them with the image.
VOL_NUXT="${CONTAINER_BASE}-nuxt"
VOL_DATA="${CONTAINER_BASE}-data"
VOL_CACHE="${CONTAINER_BASE}-cache"

# Error + exit, prefixed with the invoking script's name (website.sh / podman-website.sh).
die() { echo "${0##*/}: $*" >&2; exit 1; }

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
  ensure_engine_running
}

# Make sure the container engine is actually reachable, not just installed. On
# macOS, podman runs inside a Linux VM ("podman machine") that does NOT auto-start
# at login: a stopped machine is still the "default" connection but its socket is
# dead, and every command fails with "connection refused". When that happens, init
# a machine if none exists and start it. Linux podman runs natively (no machine
# layer), and non-podman engines (e.g. docker) are left alone.
ensure_engine_running() {
  [ "$ENGINE" = "podman" ] || return 0
  [ "$(uname -s)" = "Darwin" ] || return 0
  "$ENGINE" info >/dev/null 2>&1 && return 0
  if ! "$ENGINE" machine list --format '{{.Name}}' 2>/dev/null | grep -q .; then
    echo "==> no podman machine found - initializing (one-time, ~1 min)"
    "$ENGINE" machine init || die "podman machine init failed"
  fi
  if ! "$ENGINE" machine list --format '{{.Running}}' 2>/dev/null | grep -qi true; then
    echo "==> starting podman machine"
    "$ENGINE" machine start || die "podman machine start failed"
  fi
  "$ENGINE" info >/dev/null 2>&1 \
    || die "podman is installed but the engine isn't reachable (try: $ENGINE machine start)"
}
