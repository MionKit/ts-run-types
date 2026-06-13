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
#   scripts/website.sh smoke         # quick verify: bg dev server + curl :3000 + stop
#   scripts/website.sh shell         # debug shell inside the container
#   scripts/website.sh clean         # remove the image + named volumes
#
# Env overrides:
#   WEBSITE_ENGINE   container engine (default: podman)
#   WEBSITE_IMAGE    image tag        (default: tsrt-website:dev)
#   WEBSITE_PORT     host port        (default: 3000)
#   WEBSITE_POLL=1   use filesystem polling for watchers (macOS / VM mounts)
#   WEBSITE_MOUNT_OPTS   extra bind-mount opts, e.g. ":z" on SELinux hosts
#   WEBSITE_CA_CERT      file OR dir of extra CA certs to trust inside the
#                        container — for hosts behind a corporate / MITM egress
#                        proxy (the install/runtime otherwise fails TLS verify)
#   WEBSITE_BUILD_NETWORK  podman build network (e.g. "host" behind a proxy)
#   WEBSITE_RUN_NETWORK    podman run   network (e.g. "host" behind a proxy)
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
CA_SRC="${WEBSITE_CA_CERT:-}"
BUILD_NETWORK="${WEBSITE_BUILD_NETWORK:-}"
RUN_NETWORK="${WEBSITE_RUN_NETWORK:-}"
CACERTS_DIR="$WEBSITE_DIR/.cacerts"

# Source directories bind-mounted into /app (host is the source of truth).
MOUNT_DIRS=(app content public server scripts not-rendered tests)

# Named volumes hold Nuxt's generated caches so restarts stay fast and the
# host source tree is never written to.
VOL_NUXT="${CONTAINER_BASE}-nuxt"
VOL_DATA="${CONTAINER_BASE}-data"
VOL_CACHE="${CONTAINER_BASE}-cache"

die() { echo "website.sh: $*" >&2; exit 1; }

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

# Populate website/.cacerts/ from $WEBSITE_CA_CERT (file or dir). Always leaves
# the dir present (possibly empty) so the Containerfile COPY never fails.
prepare_cacerts() {
  rm -rf "$CACERTS_DIR"; mkdir -p "$CACERTS_DIR"
  if [ -n "$CA_SRC" ]; then
    if [ -d "$CA_SRC" ]; then
      cp "$CA_SRC"/*.crt "$CACERTS_DIR"/ 2>/dev/null || true
    elif [ -f "$CA_SRC" ]; then
      cp "$CA_SRC" "$CACERTS_DIR/extra-ca.crt"
    else
      die "WEBSITE_CA_CERT='$CA_SRC' is neither a file nor a directory"
    fi
    echo "==> trusting extra CA certs from $CA_SRC"
  fi
  touch "$CACERTS_DIR/.gitkeep"
}

build_image() {
  prepare_cacerts
  echo "==> building $IMAGE from website/Containerfile"
  local net=(); [ -n "$BUILD_NETWORK" ] && net=(--network="$BUILD_NETWORK")
  ( cd "$WEBSITE_DIR" && "$ENGINE" build ${net[@]+"${net[@]}"} -t "$IMAGE" -f Containerfile . )
}

ensure_image() {
  if ! "$ENGINE" image exists "$IMAGE" 2>/dev/null; then build_image; return; fi
  # Rebuild when any in-image manifest is newer than the cached image. The
  # bind-mounted source dirs (app/ content/ ...) never need a rebuild since
  # they're mounted live; we only watch what gets baked in.
  local img_epoch src_epoch=0 f t
  img_epoch="$("$ENGINE" image inspect "$IMAGE" --format '{{.Created.Unix}}' 2>/dev/null || true)"
  [ -z "$img_epoch" ] && img_epoch=0
  for f in "$WEBSITE_DIR/Containerfile" "$WEBSITE_DIR/package.json" "$WEBSITE_DIR/pnpm-lock.yaml" "$WEBSITE_DIR/pnpm-workspace.yaml" "$WEBSITE_DIR/.npmrc"; do
    [ -f "$f" ] || continue
    t="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0)"
    [ "$t" -gt "$src_epoch" ] && src_epoch="$t"
  done
  if [ "$src_epoch" -gt "$img_epoch" ]; then
    echo "==> website image is stale (Containerfile or manifest newer than image) - rebuilding"
    build_image
  fi
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

# Echo the --network arg for `run` when WEBSITE_RUN_NETWORK is set.
net_args() {
  [ -n "$RUN_NETWORK" ] && printf -- '--network=%s\n' "$RUN_NETWORK"
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
  read_lines MARGS < <(mount_args)
  read_lines PARGS < <(poll_args)
  read_lines NARGS < <(net_args)
  exec "$ENGINE" run --rm -it --init \
    --name "${CONTAINER_BASE}-dev" \
    -p "$PORT:3000" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${PARGS[@]+"${PARGS[@]}"} \
    -e NODE_ENV=development \
    -w /app "$IMAGE" \
    pnpm exec nuxt dev --extends docus --host 0.0.0.0 --port 3000
}

cmd_build() {
  ensure_image
  echo "==> production build -> website/.output"
  read_lines MARGS < <(mount_args)
  read_lines NARGS < <(net_args)
  exec "$ENGINE" run --rm --init \
    --name "${CONTAINER_BASE}-build" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} \
    -v "$WEBSITE_DIR/.output:/app/.output${MOUNT_OPTS}" \
    -e NODE_ENV=production \
    -w /app "$IMAGE" \
    pnpm exec nuxt build --extends docus
}

cmd_generate() {
  ensure_image
  echo "==> static prerender -> website/.output/public"
  read_lines MARGS < <(mount_args)
  read_lines NARGS < <(net_args)
  exec "$ENGINE" run --rm --init \
    --name "${CONTAINER_BASE}-generate" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} \
    -v "$WEBSITE_DIR/.output:/app/.output${MOUNT_OPTS}" \
    -e NODE_ENV=production \
    -w /app "$IMAGE" \
    pnpm exec nuxt generate --extends docus
}

cmd_smoke() {
  ensure_image
  local cname="${CONTAINER_BASE}-smoke"
  local timeout_s="${WEBSITE_SMOKE_TIMEOUT:-90}"
  local url="http://localhost:$PORT"
  echo "==> smoke: starting dev server in background ($cname)"
  "$ENGINE" rm -f "$cname" >/dev/null 2>&1 || true
  read_lines MARGS < <(mount_args)
  read_lines PARGS < <(poll_args)
  read_lines NARGS < <(net_args)
  "$ENGINE" run -d --init \
    --name "$cname" \
    -p "$PORT:3000" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${PARGS[@]+"${PARGS[@]}"} \
    -e NODE_ENV=development \
    -w /app "$IMAGE" \
    pnpm exec nuxt dev --extends docus --host 0.0.0.0 --port 3000 >/dev/null \
    || die "podman run failed"

  trap '"$ENGINE" rm -f "'"$cname"'" >/dev/null 2>&1 || true' EXIT INT TERM

  echo "==> smoke: polling $url for HTTP 200 (timeout ${timeout_s}s)"
  local deadline=$(( $(date +%s) + timeout_s ))
  local ok=0
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS "$url" -o /tmp/website-smoke.html 2>/dev/null; then
      if grep -q '<title>' /tmp/website-smoke.html; then
        ok=1
        break
      fi
    fi
    sleep 2
  done

  if [ "$ok" = 1 ]; then
    local title
    title="$(grep -oE '<title>[^<]*</title>' /tmp/website-smoke.html | head -n1)"
    echo "==> smoke: PASS  $title"
    "$ENGINE" stop --time 1 "$cname" >/dev/null 2>&1 || true
    "$ENGINE" rm -f "$cname" >/dev/null 2>&1 || true
    trap - EXIT INT TERM
    exit 0
  fi

  echo "==> smoke: FAIL (no 200 from $url within ${timeout_s}s)" >&2
  echo "==> last 40 lines of container logs:" >&2
  "$ENGINE" logs --tail 40 "$cname" >&2 || true
  "$ENGINE" stop --time 1 "$cname" >/dev/null 2>&1 || true
  "$ENGINE" rm -f "$cname" >/dev/null 2>&1 || true
  trap - EXIT INT TERM
  exit 1
}

cmd_shell() {
  ensure_image
  read_lines MARGS < <(mount_args)
  read_lines NARGS < <(net_args)
  exec "$ENGINE" run --rm -it --init \
    --name "${CONTAINER_BASE}-shell" \
    -p "$PORT:3000" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} \
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
    smoke)       cmd_smoke ;;
    shell)       cmd_shell ;;
    clean)       cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: build-image | dev | build | generate | smoke | shell | clean" ;;
  esac
}

main "$@"
