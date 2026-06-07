#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# website.sh — drive the isolated (podman) docs-website environment.
#
# The Nuxt/Docus docs site pulls in hundreds of npm transitives. To keep that
# attack surface OFF the host, its node_modules lives only inside a podman
# image (built from website/Containerfile) and the site is only ever run there.
# The website's *source* (app/ content/ public/ server/ scripts/) is
# bind-mounted from the host so edits hot-reload; its *config + node_modules*
# come from the image. You cannot run the site on the host — that's the point.
#
# Usage:
#   scripts/website.sh build-image   # build (or rebuild) the podman image
#   scripts/website.sh dev           # run the dev server with hot reload
#   scripts/website.sh build         # production build -> website/.output
#   scripts/website.sh generate      # static prerender -> website/.output/public
#   scripts/website.sh shell         # debug shell inside the container
#   scripts/website.sh clean         # remove the image + named volumes
#
# Env overrides:
#   WEBSITE_ENGINE   container engine (default: podman)
#   WEBSITE_IMAGE    image tag        (default: tsrt-website:dev)
#   WEBSITE_PORT     host port        (default: 3000)
#   WEBSITE_POLL=1   use filesystem polling for watchers (macOS / VM mounts)
#   WEBSITE_MOUNT_OPTS   extra bind-mount opts, e.g. ":z" on SELinux hosts
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEBSITE_DIR="$ROOT_DIR/website"

ENGINE="${WEBSITE_ENGINE:-podman}"
IMAGE="${WEBSITE_IMAGE:-tsrt-website:dev}"
CONTAINER_BASE="${WEBSITE_CONTAINER:-tsrt-website}"
PORT="${WEBSITE_PORT:-3000}"
MOUNT_OPTS="${WEBSITE_MOUNT_OPTS:-}"

# Source directories bind-mounted into /app (host is the source of truth).
MOUNT_DIRS=(app content public server scripts not-rendered tests)

# Named volumes hold Nuxt's generated caches so restarts stay fast and the
# host source tree is never written to.
VOL_NUXT="${CONTAINER_BASE}-nuxt"
VOL_DATA="${CONTAINER_BASE}-data"
VOL_CACHE="${CONTAINER_BASE}-cache"

die() { echo "website.sh: $*" >&2; exit 1; }

require_engine() {
  command -v "$ENGINE" >/dev/null 2>&1 \
    || die "container engine '$ENGINE' not found. Install podman (https://podman.io)."
}

build_image() {
  echo "==> building $IMAGE from website/Containerfile"
  ( cd "$WEBSITE_DIR" && "$ENGINE" build -t "$IMAGE" -f Containerfile . )
}

ensure_image() {
  "$ENGINE" image exists "$IMAGE" 2>/dev/null || build_image
}

# Echo the bind-mount + named-volume args for `run`.
mount_args() {
  local dir
  for dir in "${MOUNT_DIRS[@]}"; do
    [ -d "$WEBSITE_DIR/$dir" ] && printf -- '-v\n%s:/app/%s%s\n' "$WEBSITE_DIR/$dir" "$dir" "$MOUNT_OPTS"
  done
  printf -- '-v\n%s:/app/.nuxt\n'  "$VOL_NUXT"
  printf -- '-v\n%s:/app/.data\n'  "$VOL_DATA"
  printf -- '-v\n%s:/app/node_modules/.cache\n' "$VOL_CACHE"
}

# Echo watcher env args when polling is requested (needed on macOS / VM mounts).
poll_args() {
  if [ "${WEBSITE_POLL:-0}" = "1" ]; then
    printf -- '-e\nCHOKIDAR_USEPOLLING=true\n-e\nWATCHPACK_POLLING=true\n-e\nNUXT_VITE_SERVER_WATCH_USEPOLLING=true\n'
  fi
}

cmd_dev() {
  ensure_image
  echo "==> dev server at http://localhost:$PORT  (Ctrl-C to stop)"
  mapfile -t MARGS < <(mount_args)
  mapfile -t PARGS < <(poll_args)
  exec "$ENGINE" run --rm -it --init \
    --name "${CONTAINER_BASE}-dev" \
    -p "$PORT:3000" \
    "${MARGS[@]}" "${PARGS[@]}" \
    -e NODE_ENV=development \
    -w /app "$IMAGE" \
    pnpm exec nuxt dev --extends docus --host 0.0.0.0 --port 3000
}

cmd_build() {
  ensure_image
  echo "==> production build -> website/.output"
  mapfile -t MARGS < <(mount_args)
  exec "$ENGINE" run --rm --init \
    --name "${CONTAINER_BASE}-build" \
    "${MARGS[@]}" \
    -v "$WEBSITE_DIR/.output:/app/.output${MOUNT_OPTS}" \
    -e NODE_ENV=production \
    -w /app "$IMAGE" \
    pnpm exec nuxt build --extends docus
}

cmd_generate() {
  ensure_image
  echo "==> static prerender -> website/.output/public"
  mapfile -t MARGS < <(mount_args)
  exec "$ENGINE" run --rm --init \
    --name "${CONTAINER_BASE}-generate" \
    "${MARGS[@]}" \
    -v "$WEBSITE_DIR/.output:/app/.output${MOUNT_OPTS}" \
    -e NODE_ENV=production \
    -w /app "$IMAGE" \
    pnpm exec nuxt generate --extends docus
}

cmd_shell() {
  ensure_image
  mapfile -t MARGS < <(mount_args)
  exec "$ENGINE" run --rm -it --init \
    --name "${CONTAINER_BASE}-shell" \
    -p "$PORT:3000" \
    "${MARGS[@]}" \
    -w /app "$IMAGE" bash
}

cmd_clean() {
  echo "==> removing image $IMAGE and named volumes"
  "$ENGINE" rmi -f "$IMAGE" 2>/dev/null || true
  "$ENGINE" volume rm -f "$VOL_NUXT" "$VOL_DATA" "$VOL_CACHE" 2>/dev/null || true
}

main() {
  require_engine
  mkdir -p "$WEBSITE_DIR/.output"
  case "${1:-}" in
    build-image) build_image ;;
    dev)         cmd_dev ;;
    build)       cmd_build ;;
    generate)    cmd_generate ;;
    shell)       cmd_shell ;;
    clean)       cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: build-image | dev | build | generate | shell | clean" ;;
  esac
}

main "$@"
