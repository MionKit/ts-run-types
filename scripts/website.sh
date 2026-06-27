#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# website.sh - RUN the isolated (podman) docs-website environment.
#
# The image lifecycle (build / push / pull / ensure / clean / lock) lives in
# scripts/podman-website.sh; this script only RUNS the site in that shared image.
# Every run command first delegates `ensure` to podman-website.sh so the image is
# ready (pulled or built), then runs the website at /app with the host source
# bind-mounted. The Nuxt/Docus site pulls in hundreds of npm transitives; to keep
# that attack surface OFF the host, node_modules lives only inside the image and
# the site is only ever run there. The website's source (app/ content/ public/
# server/ scripts/) is bind-mounted so edits hot-reload; config + node_modules come
# from the image. You cannot run the site on the host. ASCII-only (macOS bash 3.2).
#
# Usage:
#   scripts/website.sh dev           # run the dev server with hot reload
#   scripts/website.sh dev --isAgent # detached agent dev server on RT_WEBSITE_AGENT_PORT
#                                    #   (3100); self-stops after RT_WEBSITE_AGENT_IDLE_SECONDS idle
#   scripts/website.sh build         # production build -> container/website/.output
#   scripts/website.sh generate      # static prerender -> container/website/.output/public
#   scripts/website.sh smoke         # quick verify: bg dev server + curl :3000 + stop
#   scripts/website.sh verify-docs   # verify code-import + twoslash render (curl/grep)
#   scripts/website.sh prep          # verify the repo context (packages/) is built
#   scripts/website.sh shell         # debug shell inside the container
#
# Image lifecycle is in scripts/podman-website.sh (build-image | ensure | login |
# push | pull | lock | clean).
#
# Env overrides:
#   RT_WEBSITE_ENGINE   container engine (default: podman)
#   RT_WEBSITE_IMAGE    image tag        (default: tsrt-website:dev)
#   RT_WEBSITE_PORT     host port        (default: 3000)
#   RT_WEBSITE_AGENT_PORT          agent host port      (default: 3100)
#   RT_WEBSITE_AGENT_IDLE_SECONDS  agent idle shutdown  (default: 300)
#   (default)  run commands ensure (pull-or-build) the shared image first
#   RT_WEBSITE_USE_LOCAL=1   ensure uses a local image (maintainer/offline); forwarded to podman-website.sh
#   RT_WEBSITE_REPO_CONTEXT  host checkout that contains packages/ (source + built
#                        .d.ts), mounted read-only for code-import/twoslash.
#                        Default: sibling ../mion if present, else this repo.
#   RT_WEBSITE_DOCDATA      host dir of generated benchmark/test result JSON the docs
#                        read, mounted read-only at /app/.docdata (default: .docdata).
#   RT_WEBSITE_POLL     filesystem polling for watchers (macOS / VM bind mounts).
#                    Default: 1 on macOS, 0 on Linux. Set RT_WEBSITE_POLL=0 to force off.
#   RT_WEBSITE_SKIP_PLAYGROUND=1  skip auto-building the /playground bundle on run. By
#                    default dev/build/generate/smoke build + stage it (when missing or
#                    stale) so /playground works; needs Go + bootstrapped submodule.
#   RT_WEBSITE_MOUNT_OPTS   extra bind-mount opts, e.g. ":z" on SELinux hosts
#   RT_WEBSITE_RUN_NETWORK  podman run network (e.g. "host" behind a proxy)
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib-container.sh"

# The image owner this script delegates `ensure` to (single source of truth).
PODMAN_WEBSITE_SH="$SCRIPT_DIR/podman-website.sh"

PORT="${RT_WEBSITE_PORT:-3000}"
# Agent mode (`dev --isAgent`): reserved port so an agent-driven server never
# collides with a human's :3000, plus the idle window after which it self-stops.
AGENT_PORT="${RT_WEBSITE_AGENT_PORT:-3100}"
AGENT_IDLE_SECONDS="${RT_WEBSITE_AGENT_IDLE_SECONDS:-300}"
# Watcher polling: bind mounts on macOS deliver no native fs events, so default it
# on there (the container runs in a Linux VM). Linux bind mounts pass events through
# natively -- keep it off. Override with RT_WEBSITE_POLL=0/1 either way.
if [ -z "${RT_WEBSITE_POLL:-}" ]; then
  [ "$(uname -s)" = "Darwin" ] && RT_WEBSITE_POLL=1 || RT_WEBSITE_POLL=0
fi
RUN_NETWORK="${RT_WEBSITE_RUN_NETWORK:-}"

# Source directories bind-mounted into /app (host is the source of truth).
MOUNT_DIRS=(app content public server scripts not-rendered tests)
# Config files bind-mounted into /app (first-party, NOT baked into the image).
MOUNT_FILES=(nuxt.config.ts tsconfig.json eslint.config.mjs)

# Repo context: the checkout that contains packages/ (the first-party source +
# built .d.ts), mounted READ-ONLY so code-import + twoslash can resolve code and
# types. This repo carries packages/examples itself, so prefer it whenever those
# examples are present. Only fall back to a sibling ../mion checkout for a legacy
# split layout. Override with RT_WEBSITE_REPO_CONTEXT.
default_repo_context() {
  if [ -d "$ROOT_DIR/packages/examples" ]; then echo "$ROOT_DIR"
  elif [ -d "$ROOT_DIR/../mion/packages" ]; then ( cd "$ROOT_DIR/../mion" && pwd )
  else echo "$ROOT_DIR"; fi
}
REPO_CONTEXT="${RT_WEBSITE_REPO_CONTEXT:-$(default_repo_context)}"

# Generated benchmark/test result JSON the docs are built from, mounted read-only.
DOCDATA_DIR="${RT_WEBSITE_DOCDATA:-$ROOT_DIR/.docdata}"

# Make the shared image ready before a run by delegating to its owner. Honors
# RT_WEBSITE_USE_LOCAL / RT_WEBSITE_IMAGE / RT_WEBSITE_REMOTE_IMAGE via the inherited env.
ensure_image() { bash "$PODMAN_WEBSITE_SH" ensure; }

# Staged playground bundle (Monaco web component + resolver WASM) the /playground
# page fetches from /playground-app/. Built on the HOST (it needs the Go toolchain +
# bootstrapped submodule) and bind-mounted in via public/.
PLAYGROUND_MANIFEST="$WEBSITE_DIR/public/playground-app/manifest.json"

# Stale when any playground input (web-component src, its build scripts, the WASM
# resolver Go sources, or the marker source the bundle inlines) is newer than the
# staged manifest. Coarse but never a false negative for the common edits.
playground_stale() {
  local p newer paths=()
  for p in \
    "$ROOT_DIR/packages/runtypes-playground/src" \
    "$ROOT_DIR/packages/runtypes-playground/scripts" \
    "$ROOT_DIR/cmd/ts-runtypes-wasm" \
    "$ROOT_DIR/internal" \
    "$ROOT_DIR/packages/ts-runtypes/src"; do
    [ -e "$p" ] && paths+=("$p")
  done
  [ ${#paths[@]} -eq 0 ] && return 1
  newer="$(find "${paths[@]}" -type f -newer "$PLAYGROUND_MANIFEST" -print 2>/dev/null | head -n1 || true)"
  [ -n "$newer" ]
}

# Build + stage the playground bundle when it's missing or stale, so the /playground
# page works without a manual build-playground.sh step. The build needs the Go
# toolchain + bootstrapped submodule on the HOST; when those are absent or the build
# fails we WARN and continue (the rest of the site runs; the /playground page shows
# its own "bundle not staged" hint). Skip entirely with RT_WEBSITE_SKIP_PLAYGROUND=1.
ensure_playground() {
  [ "${RT_WEBSITE_SKIP_PLAYGROUND:-0}" = "1" ] && { echo "==> RT_WEBSITE_SKIP_PLAYGROUND=1 - skipping playground bundle"; return 0; }
  if [ -f "$PLAYGROUND_MANIFEST" ] && ! playground_stale; then
    echo "==> playground bundle up to date (public/playground-app/)"
    return 0
  fi
  if ! command -v go >/dev/null 2>&1; then
    echo "==> WARN: Go toolchain not found - skipping playground build (the /playground page will 404). Install Go + bootstrap submodules (SETUP.md), or set RT_WEBSITE_SKIP_PLAYGROUND=1 to silence." >&2
    return 0
  fi
  [ -f "$PLAYGROUND_MANIFEST" ] && echo "==> playground sources changed - rebuilding bundle" || echo "==> playground bundle missing - building it"
  if ! bash "$WEBSITE_DIR/scripts/build-playground.sh"; then
    echo "==> WARN: playground build failed - the site will run but /playground will 404 (see output above; needs Go + bootstrapped submodule, SETUP.md)." >&2
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
  # exposed, never the repo root, so code-import/twoslash can read first-party code
  # + types but nothing else. RT_REPO_ROOT=/repo-context (see env_args).
  if [ -d "$REPO_CONTEXT/packages" ]; then
    printf -- '-v\n%s:/repo-context/packages:ro%s\n' "$REPO_CONTEXT/packages" "$MOUNT_OPTS"
  fi
  if [ -d "$REPO_CONTEXT/node_modules/drizzle-orm" ]; then
    printf -- '-v\n%s:/repo-context/node_modules/drizzle-orm:ro%s\n' "$REPO_CONTEXT/node_modules/drizzle-orm" "$MOUNT_OPTS"
  fi

  # Generated benchmark/test results the docs read (RT_DOCDATA=/app/.docdata).
  mkdir -p "$DOCDATA_DIR"
  printf -- '-v\n%s:/app/.docdata:ro%s\n' "$DOCDATA_DIR" "$MOUNT_OPTS"

  printf -- '-v\n%s:/app/.nuxt\n'  "$VOL_NUXT"
  printf -- '-v\n%s:/app/.data\n'  "$VOL_DATA"
  printf -- '-v\n%s:/app/node_modules/.cache\n' "$VOL_CACHE"
}

# Echo the --network arg for `run` when RT_WEBSITE_RUN_NETWORK is set.
net_args() {
  [ -n "$RUN_NETWORK" ] && printf -- '--network=%s\n' "$RUN_NETWORK"
  return 0
}

# Echo the env args pointing the resolvers at the mounted repo context + results.
env_args() {
  printf -- '-e\nRT_REPO_ROOT=/repo-context\n'
  printf -- '-e\nRT_DOCDATA=/app/.docdata\n'
}

# Echo watcher env args when polling is requested (needed on macOS / VM mounts).
# CHOKIDAR_USEPOLLING is read by nuxt.config.ts (vite server.watch + the example
# watcher) to switch the watchers to polling -- the only reliable mode over a bind
# mount that delivers no native fs events.
poll_args() {
  if [ "${RT_WEBSITE_POLL:-0}" = "1" ]; then
    printf -- '-e\nCHOKIDAR_USEPOLLING=true\n'
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

  # --rm cleans up on a clean exit, but an ungraceful kill (machine stop, SIGKILL)
  # leaves the named container behind and the next run collides. Remove any stale
  # one first. Scope is the USER container only (${CONTAINER_BASE}-dev); the agent
  # path owns ${CONTAINER_BASE}-agent, so user and agent dev servers never evict
  # each other.
  "$ENGINE" rm -f "${CONTAINER_BASE}-dev" >/dev/null 2>&1 || true

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
# server/middleware/agent-heartbeat.ts) goes stale. With --rm, the container removes
# itself when nuxt exits, so an agent-spawned site never lingers. Relies on the
# MARGS/PARGS/NARGS/EARGS arrays already built by cmd_dev.
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
  echo "==> production build -> container/website/.output"
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
  echo "==> static prerender -> container/website/.output/public"
  read_lines MARGS < <(mount_args)
  read_lines NARGS < <(net_args)
  read_lines EARGS < <(env_args)
  # nitro's generate rmdir's /app/.output while finalizing; bind-mounting .output
  # directly makes it a mount point, so that rmdir fails with EBUSY. Generate into
  # the container's own /app/.output (freely removable), then mirror the result
  # onto the host bind mount (/app/.output-host).
  exec "$ENGINE" run --rm --init \
    --name "${CONTAINER_BASE}-generate" \
    ${NARGS[@]+"${NARGS[@]}"} ${MARGS[@]+"${MARGS[@]}"} ${EARGS[@]+"${EARGS[@]}"} \
    -v "$WEBSITE_DIR/.output:/app/.output-host${MOUNT_OPTS}" \
    -e NODE_ENV=production \
    -e NODE_OPTIONS="--max-old-space-size=6144" \
    -w /app "$IMAGE" \
    sh -c 'pnpm exec nuxt generate --extends docus \
      && node scripts/embed-panel-highlights.mjs /app/.output/public \
      && find /app/.output-host -mindepth 1 -delete \
      && cp -a /app/.output/. /app/.output-host/'
}

cmd_smoke() {
  ensure_image
  local cname="${CONTAINER_BASE}-smoke"
  local timeout_s="${RT_WEBSITE_SMOKE_TIMEOUT:-90}"
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

# Verify the repo context (the checkout that holds packages/) is present and built.
# Does NOT build a sibling repo; it spot-checks a couple of packages' .dist/esm
# .d.ts and prints guidance if missing (twoslash hovers need them). Warn-only.
cmd_prep() {
  echo "==> repo context: $REPO_CONTEXT"
  local pkgdir="$REPO_CONTEXT/packages" missing=0 p
  [ -d "$pkgdir" ] || die "no packages/ under repo context '$REPO_CONTEXT' - set RT_WEBSITE_REPO_CONTEXT to the repo checkout"
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
# (curl/grep): twoslash render, file read (code-import's resolver), and the
# packages/ security boundary. No browser needed (twoslash is SSR).
cmd_verify_docs() {
  ensure_image
  local cname="${CONTAINER_BASE}-verify"
  local timeout_s="${RT_WEBSITE_SMOKE_TIMEOUT:-120}"
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

main() {
  require_engine
  mkdir -p "$WEBSITE_DIR/.output"
  # Ensure the playground bundle is staged for every command that serves the site.
  case "${1:-}" in
    dev|build|generate|smoke|verify-docs) ensure_playground ;;
  esac
  case "${1:-}" in
    dev)         cmd_dev "${@:2}" ;;
    build)       cmd_build ;;
    generate)    cmd_generate ;;
    smoke)       cmd_smoke ;;
    verify-docs) cmd_verify_docs ;;
    prep)        cmd_prep ;;
    shell)       cmd_shell ;;
    *) die "unknown command '${1:-}'. Try: dev | build | generate | smoke | verify-docs | prep | shell  (image lifecycle: scripts/podman-website.sh build-image|ensure|login|push|pull|lock|clean)" ;;
  esac
}

main "$@"
