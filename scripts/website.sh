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
#   scripts/website.sh dev --isAgent # detached agent dev server on WEBSITE_AGENT_PORT
#                                    #   (3100); self-stops after WEBSITE_AGENT_IDLE_SECONDS idle
#   scripts/website.sh build         # production build -> website/.output
#   scripts/website.sh generate      # static prerender -> website/.output/public
#   scripts/website.sh smoke         # quick verify: bg dev server + curl :3000 + stop
#   scripts/website.sh verify-docs   # verify code-import + twoslash render (curl/grep)
#   scripts/website.sh prep          # verify the repo context (packages/) is built
#   scripts/website.sh shell         # debug shell inside the container
#   scripts/website.sh lock          # regenerate _deps/pnpm-lock.yaml in-container
#   scripts/website.sh login         # log in to GHCR (uses GHCR_PAT / GHCR_PAT_FILE)
#   scripts/website.sh push          # build + push multi-arch image to GHCR
#   scripts/website.sh pull          # pull the published image and tag it locally
#   scripts/website.sh clean         # remove the image + named volumes
#
# Env overrides:
#   WEBSITE_ENGINE   container engine (default: podman)
#   WEBSITE_IMAGE    image tag        (default: tsrt-website:dev)
#   WEBSITE_PORT     host port        (default: 3000)
#   WEBSITE_AGENT_PORT          agent host port      (default: 3100)
#   WEBSITE_AGENT_IDLE_SECONDS  agent idle shutdown  (default: 300)
#   (default)  run commands PULL the latest published GHCR image first
#   WEBSITE_USE_LOCAL=1   skip the pull; build/use a local image (maintainer/offline)
#   WEBSITE_REMOTE_IMAGE  remote ref   (default: ghcr.io/$GHCR_OWNER/tsrt-website:latest)
#   GHCR_OWNER / GHCR_USER / GHCR_PAT / GHCR_PAT_FILE  (see scripts/lib-ghcr.sh)
#   WEBSITE_REPO_CONTEXT  host checkout that contains packages/ (mion's source +
#                        built .d.ts), mounted read-only for code-import/twoslash.
#                        Default: sibling ../mion if present, else this repo.
#   WEBSITE_DOCDATA      host dir of generated benchmark/test result JSON the docs
#                        read, mounted read-only at /app/.docdata (default: .docdata).
#   WEBSITE_POLL=1   use filesystem polling for watchers (macOS / VM mounts)
#   WEBSITE_MOUNT_OPTS   extra bind-mount opts, e.g. ":z" on SELinux hosts
#   WEBSITE_CA_CERT      file OR dir of extra CA certs to trust inside the
#                        container — for hosts behind a corporate / MITM egress
#                        proxy (the install/runtime otherwise fails TLS verify).
#                        When unset, auto-detects the host's
#                        /usr/local/share/ca-certificates if it holds certs
#                        (proxied envs); no-op otherwise.
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
# Agent mode (`dev --isAgent`): reserved port so an agent-driven server never
# collides with a human's :3000, plus the idle window after which it self-stops.
AGENT_PORT="${WEBSITE_AGENT_PORT:-3100}"
AGENT_IDLE_SECONDS="${WEBSITE_AGENT_IDLE_SECONDS:-300}"
MOUNT_OPTS="${WEBSITE_MOUNT_OPTS:-}"
CA_SRC="${WEBSITE_CA_CERT:-}"
BUILD_NETWORK="${WEBSITE_BUILD_NETWORK:-}"
RUN_NETWORK="${WEBSITE_RUN_NETWORK:-}"
CACERTS_DIR="$WEBSITE_DIR/.cacerts"
DEPS_DIR="$WEBSITE_DIR/_deps"

# Repo context: the checkout that contains packages/ (mion's first-party source +
# built .d.ts), mounted READ-ONLY so code-import + twoslash can resolve code and
# types. Defaults to the sibling ../mion checkout when present (today), else this
# repo (the merged-monorepo future). Override with WEBSITE_REPO_CONTEXT.
default_repo_context() {
  if [ -d "$ROOT_DIR/../mion/packages" ]; then ( cd "$ROOT_DIR/../mion" && pwd ); else echo "$ROOT_DIR"; fi
}
REPO_CONTEXT="${WEBSITE_REPO_CONTEXT:-$(default_repo_context)}"

# Generated benchmark/test result JSON the docs are built from, mounted read-only.
DOCDATA_DIR="${WEBSITE_DOCDATA:-$ROOT_DIR/.docdata}"

# Source directories bind-mounted into /app (host is the source of truth).
MOUNT_DIRS=(app content public server scripts not-rendered tests)

# Config files bind-mounted into /app (first-party, NOT baked into the image).
MOUNT_FILES=(nuxt.config.ts tsconfig.json eslint.config.mjs)

# GHCR publish/pull helpers (login, push, pull) + the remote image ref. Run
# commands pull this prebuilt image by default; WEBSITE_USE_LOCAL=1 builds/uses a
# local image instead.
source "$SCRIPT_DIR/lib-ghcr.sh"
REMOTE_IMAGE="${WEBSITE_REMOTE_IMAGE:-$GHCR_REGISTRY/$GHCR_OWNER/tsrt-website:latest}"
MANIFEST_NAME="tsrt-website-manifest"

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
  # Behind a corporate / MITM egress proxy the container image must trust the
  # proxy CA to install deps over TLS. When no explicit WEBSITE_CA_CERT was
  # given, fall back to the host's standard custom-CA dir IF it actually holds
  # certs — true in proxied environments (e.g. an Anthropic Egress Gateway), a
  # harmless no-op on a normal host or macOS (dir absent/empty). The host already
  # trusts these; we just propagate them into the image so its install succeeds.
  local host_ca_dir=/usr/local/share/ca-certificates
  if [ -z "$CA_SRC" ] && [ -d "$host_ca_dir" ] && ls "$host_ca_dir"/*.crt >/dev/null 2>&1; then
    CA_SRC="$host_ca_dir"
    echo "==> auto-detected host CA certs in $host_ca_dir (corporate/MITM proxy); trusting them in the image"
  fi
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

# Make the working image ready before a run. DEFAULT: pull the latest published
# image from GHCR (so a run always uses the current published deps), falling back
# to an existing local image, then to a local build, when the registry is
# unreachable. WEBSITE_USE_LOCAL=1 skips the pull and uses a locally-built image
# (maintainer / offline loop) with the manifest-staleness rebuild.
ensure_image() {
  if [ -n "${WEBSITE_USE_LOCAL:-}" ]; then ensure_image_local; return; fi
  if ghcr_try_pull_retag "$REMOTE_IMAGE" "$IMAGE"; then return; fi
  if "$ENGINE" image exists "$IMAGE" 2>/dev/null; then
    echo "==> using existing local image $IMAGE" >&2; return
  fi
  echo "==> no published or local image available - building locally" >&2
  build_image
}

# Local-image path: build when missing, and rebuild when any baked manifest (or
# the Containerfile) is newer than the cached image. The bind-mounted source/
# config never need a rebuild since they're mounted live.
ensure_image_local() {
  if ! "$ENGINE" image exists "$IMAGE" 2>/dev/null; then build_image; return; fi
  local img_epoch src_epoch=0 f t
  img_epoch="$("$ENGINE" image inspect "$IMAGE" --format '{{.Created.Unix}}' 2>/dev/null || true)"
  [ -z "$img_epoch" ] && img_epoch=0
  for f in "$WEBSITE_DIR/Containerfile" "$DEPS_DIR/package.json" "$DEPS_DIR/pnpm-lock.yaml" "$DEPS_DIR/pnpm-workspace.yaml" "$DEPS_DIR/.npmrc"; do
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
  local dir cfg
  for dir in "${MOUNT_DIRS[@]}"; do
    [ -d "$WEBSITE_DIR/$dir" ] && printf -- '-v\n%s:/app/%s%s\n' "$WEBSITE_DIR/$dir" "$dir" "$MOUNT_OPTS"
  done
  # First-party config files (not baked into the deps-only image).
  for cfg in "${MOUNT_FILES[@]}"; do
    [ -f "$WEBSITE_DIR/$cfg" ] && printf -- '-v\n%s:/app/%s:ro%s\n' "$WEBSITE_DIR/$cfg" "$cfg" "$MOUNT_OPTS"
  done

  # Repo context, READ-ONLY: only packages/ (+ the drizzle-orm d.ts allowlist) is
  # exposed — never the repo root — so code-import/twoslash can read first-party
  # code + types but nothing else. MION_REPO_ROOT=/repo-context (see env_args).
  if [ -d "$REPO_CONTEXT/packages" ]; then
    printf -- '-v\n%s:/repo-context/packages:ro%s\n' "$REPO_CONTEXT/packages" "$MOUNT_OPTS"
  fi
  if [ -d "$REPO_CONTEXT/node_modules/drizzle-orm" ]; then
    printf -- '-v\n%s:/repo-context/node_modules/drizzle-orm:ro%s\n' "$REPO_CONTEXT/node_modules/drizzle-orm" "$MOUNT_OPTS"
  fi

  # Generated benchmark/test results the docs read (MION_DOCDATA=/app/.docdata).
  mkdir -p "$DOCDATA_DIR"
  printf -- '-v\n%s:/app/.docdata:ro%s\n' "$DOCDATA_DIR" "$MOUNT_OPTS"

  printf -- '-v\n%s:/app/.nuxt\n'  "$VOL_NUXT"
  printf -- '-v\n%s:/app/.data\n'  "$VOL_DATA"
  printf -- '-v\n%s:/app/node_modules/.cache\n' "$VOL_CACHE"
}

# Echo the --network arg for `run` when WEBSITE_RUN_NETWORK is set.
net_args() {
  [ -n "$RUN_NETWORK" ] && printf -- '--network=%s\n' "$RUN_NETWORK"
}

# Echo the env args pointing the resolvers at the mounted repo context + results.
env_args() {
  printf -- '-e\nMION_REPO_ROOT=/repo-context\n'
  printf -- '-e\nMION_DOCDATA=/app/.docdata\n'
}

# Echo watcher env args when polling is requested (needed on macOS / VM mounts).
poll_args() {
  if [ "${WEBSITE_POLL:-0}" = "1" ]; then
    printf -- '-e\nCHOKIDAR_USEPOLLING=true\n-e\nWATCHPACK_POLLING=true\n-e\nNUXT_VITE_SERVER_WATCH_USEPOLLING=true\n'
  fi
}

cmd_dev() {
  local is_agent=0 arg
  for arg in "$@"; do
    case "$arg" in
      --isAgent|--is-agent) is_agent=1 ;;
      *) die "dev: unknown option '$arg' (only --isAgent is supported)" ;;
    esac
  done

  ensure_image
  read_lines MARGS < <(mount_args)
  read_lines PARGS < <(poll_args)
  read_lines NARGS < <(net_args)
  read_lines EARGS < <(env_args)

  [ "$is_agent" = 1 ] && { cmd_dev_agent; return; }

  echo "==> dev server at http://localhost:$PORT  (Ctrl-C to stop)"
  exec "$ENGINE" run --rm -it --init \
    --name "${CONTAINER_BASE}-dev" \
    -p "$PORT:3000" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${PARGS[@]+"${PARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
    -e NODE_ENV=development \
    -w /app "$IMAGE" \
    pnpm exec nuxt dev --extends docus --host 0.0.0.0 --port 3000
}

# Agent dev server: detached, on the reserved agent port, with an in-container
# watchdog that stops nuxt once the heartbeat file (bumped per request by
# server/middleware/agent-heartbeat.ts) goes stale. With --rm, the container
# removes itself when nuxt exits, so an agent-spawned site never lingers.
# Relies on the MARGS/PARGS/NARGS/EARGS arrays already built by cmd_dev.
cmd_dev_agent() {
  local cname="${CONTAINER_BASE}-agent"
  echo "==> agent dev server at http://localhost:$AGENT_PORT  (detached; self-stops after ${AGENT_IDLE_SECONDS}s idle)"
  "$ENGINE" rm -f "$cname" >/dev/null 2>&1 || true
  "$ENGINE" run -d --rm --init \
    --name "$cname" \
    -p "$AGENT_PORT:3000" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${PARGS[@]+"${PARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
    -e NODE_ENV=development \
    -e RT_AGENT=1 \
    -e RT_AGENT_HEARTBEAT=/tmp/agent-heartbeat \
    -e RT_AGENT_IDLE_SECONDS="$AGENT_IDLE_SECONDS" \
    -w /app "$IMAGE" \
    sh -c '
      hb="$RT_AGENT_HEARTBEAT"; idle="${RT_AGENT_IDLE_SECONDS:-300}"
      touch "$hb"
      pnpm exec nuxt dev --extends docus --host 0.0.0.0 --port 3000 &
      nuxt_pid=$!
      while kill -0 "$nuxt_pid" 2>/dev/null; do
        sleep 30
        last=$(stat -c %Y "$hb" 2>/dev/null || echo 0)
        now=$(date +%s)
        if [ $((now - last)) -ge "$idle" ]; then
          echo "agent: idle ${idle}s with no requests, stopping nuxt"
          kill "$nuxt_pid" 2>/dev/null || true
          break
        fi
      done
      wait "$nuxt_pid" 2>/dev/null || true
    ' >/dev/null
  echo "==> started detached as '$cname'. Logs: $ENGINE logs -f $cname   Stop early: $ENGINE stop $cname"
}

cmd_build() {
  ensure_image
  echo "==> production build -> website/.output"
  read_lines MARGS < <(mount_args)
  read_lines NARGS < <(net_args)
  read_lines EARGS < <(env_args)
  exec "$ENGINE" run --rm --init \
    --name "${CONTAINER_BASE}-build" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
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
  read_lines EARGS < <(env_args)
  exec "$ENGINE" run --rm --init \
    --name "${CONTAINER_BASE}-generate" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
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
  read_lines EARGS < <(env_args)
  "$ENGINE" run -d --init \
    --name "$cname" \
    -p "$PORT:3000" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${PARGS[@]+"${PARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
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
  read_lines EARGS < <(env_args)
  exec "$ENGINE" run --rm -it --init \
    --name "${CONTAINER_BASE}-shell" \
    -p "$PORT:3000" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
    -w /app "$IMAGE" bash
}

cmd_clean() {
  echo "==> removing image $IMAGE and named volumes"
  "$ENGINE" rmi -f "$IMAGE" 2>/dev/null || true
  "$ENGINE" volume rm -f "$VOL_NUXT" "$VOL_DATA" "$VOL_CACHE" 2>/dev/null || true
}

# Regenerate _deps/pnpm-lock.yaml inside the container, so the host stays free of
# any package-manager files (you can't `pnpm install` at the website root). This
# is the supported "bump a dep" step: edit _deps/package.json, then run this.
cmd_lock() {
  ensure_image
  echo "==> regenerating _deps/pnpm-lock.yaml inside the container"
  read_lines NARGS < <(net_args)
  "$ENGINE" run --rm --init \
    ${NARGS[@]+"${NARGS[@]}"} \
    -v "$DEPS_DIR:/lock${MOUNT_OPTS}" -w /lock "$IMAGE" \
    pnpm install --lockfile-only --no-frozen-lockfile
}

# Verify the repo context (the checkout that holds packages/) is present and built.
# Does NOT build a sibling repo — it spot-checks a couple of packages' .dist/esm
# .d.ts and prints guidance if missing (twoslash hovers need them). Warn-only.
cmd_prep() {
  echo "==> repo context: $REPO_CONTEXT"
  local pkgdir="$REPO_CONTEXT/packages" missing=0 p
  [ -d "$pkgdir" ] || die "no packages/ under repo context '$REPO_CONTEXT' - set WEBSITE_REPO_CONTEXT to the mion checkout"
  for p in core run-types; do
    if ls "$pkgdir/$p/.dist/esm/"*.d.ts >/dev/null 2>&1; then
      echo "  ok: packages/$p built"
    else
      echo "  MISSING: packages/$p/.dist/esm/*.d.ts" >&2; missing=1
    fi
  done
  if [ "$missing" = 1 ]; then
    echo "==> repo context not fully built - twoslash type hovers will be incomplete." >&2
    echo "    build it first, e.g.:  pnpm -C \"$REPO_CONTEXT\" run build" >&2
    return 1
  fi
  echo "==> repo context OK"
}

# End-to-end check that code-import + twoslash resolve against the mounted repo
# context: boots a detached dev server, then exercises the endpoints from the host
# (curl/grep) — twoslash render, file read (code-import's resolver), and the
# packages/ security boundary. No browser needed (twoslash is SSR).
cmd_verify_docs() {
  ensure_image
  local cname="${CONTAINER_BASE}-verify"
  local timeout_s="${WEBSITE_SMOKE_TIMEOUT:-120}"
  local base="http://localhost:$PORT"
  # Pick a real example file from the mounted context for the endpoint checks.
  local ex relpath
  ex="$(find "$REPO_CONTEXT/packages/examples/src" -name '*.ts' 2>/dev/null | head -1)"
  [ -n "$ex" ] || die "no examples found under $REPO_CONTEXT/packages/examples/src - run 'website.sh prep'"
  relpath="${ex#"$REPO_CONTEXT"/}"
  echo "==> verify-docs: example = $relpath"

  "$ENGINE" rm -f "$cname" >/dev/null 2>&1 || true
  read_lines MARGS < <(mount_args)
  read_lines PARGS < <(poll_args)
  read_lines NARGS < <(net_args)
  read_lines EARGS < <(env_args)
  "$ENGINE" run -d --init --name "$cname" -p "$PORT:3000" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${PARGS[@]+"${PARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
    -e NODE_ENV=development -w /app "$IMAGE" \
    pnpm exec nuxt dev --extends docus --host 0.0.0.0 --port 3000 >/dev/null \
    || die "podman run failed"
  trap '"$ENGINE" rm -f "'"$cname"'" >/dev/null 2>&1 || true' EXIT INT TERM

  echo "==> verify-docs: waiting for $base (timeout ${timeout_s}s)"
  local deadline=$(( $(date +%s) + timeout_s ))
  until curl -fsS "$base" -o /dev/null 2>/dev/null; do
    [ "$(date +%s)" -lt "$deadline" ] || { "$ENGINE" logs --tail 40 "$cname" >&2; die "dev server never came up"; }
    sleep 2
  done

  local fails=0
  # 1. twoslash endpoint renders hovers from the mounted packages' .d.ts.
  if curl -fsS -X POST "$base/api/twoslash" -H 'content-type: application/json' \
       -d "{\"path\":\"$relpath\",\"hoverMode\":\"all\"}" 2>/dev/null | grep -q 'twoslash'; then
    echo "  PASS  twoslash: rendered hovers for $relpath"
  else
    echo "  FAIL  twoslash: no hover markup for $relpath" >&2; fails=1
  fi
  # 2. file read (the resolver code-import uses) returns code from the context.
  if curl -fsS -X POST "$base/api/read-file" -H 'content-type: application/json' \
       -d "{\"path\":\"$relpath\"}" 2>/dev/null | grep -q '"code"'; then
    echo "  PASS  code read: $relpath"
  else
    echo "  FAIL  code read: $relpath" >&2; fails=1
  fi
  # 3. security boundary: a path escaping packages/ is rejected (403).
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$base/api/read-file" \
       -H 'content-type: application/json' -d '{"path":"packages/examples/../../package.json"}' 2>/dev/null)"
  if [ "$code" = 403 ]; then
    echo "  PASS  security: out-of-packages path rejected (403)"
  else
    echo "  FAIL  security: expected 403, got $code" >&2; fails=1
  fi
  # 4. homepage server-renders twoslash markup (full SSR path).
  if curl -fsS "$base" 2>/dev/null | grep -q 'twoslash'; then
    echo "  PASS  homepage: twoslash markup present in SSR HTML"
  else
    echo "  WARN  homepage: no twoslash markup (homepage may not use ::twoslash-code)" >&2
  fi

  "$ENGINE" rm -f "$cname" >/dev/null 2>&1 || true
  trap - EXIT INT TERM
  [ "$fails" = 0 ] && { echo "==> verify-docs: PASS"; exit 0; }
  echo "==> verify-docs: FAIL" >&2; exit 1
}

cmd_login() { require_engine; ghcr_login; }

cmd_push() {
  require_engine
  prepare_cacerts
  ghcr_push_multiarch "$MANIFEST_NAME" "$WEBSITE_DIR" "$REMOTE_IMAGE" "$BUILD_NETWORK"
}

cmd_pull() { require_engine; ghcr_pull_retag "$REMOTE_IMAGE" "$IMAGE"; }

main() {
  require_engine
  mkdir -p "$WEBSITE_DIR/.output"
  case "${1:-}" in
    build-image) build_image ;;
    dev)         cmd_dev "${@:2}" ;;
    build)       cmd_build ;;
    generate)    cmd_generate ;;
    smoke)       cmd_smoke ;;
    verify-docs) cmd_verify_docs ;;
    prep)        cmd_prep ;;
    shell)       cmd_shell ;;
    lock)        cmd_lock ;;
    login)       cmd_login ;;
    push)        cmd_push ;;
    pull)        cmd_pull ;;
    clean)       cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: build-image | dev | build | generate | smoke | verify-docs | prep | shell | lock | login | push | pull | clean" ;;
  esac
}

main "$@"
