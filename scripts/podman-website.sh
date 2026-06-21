#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# podman-website.sh - own the lifecycle of the SINGLE shared podman image
# (container-website/Containerfile). That one image bakes BOTH dependency trees in
# separate dirs with separate node_modules:
#   /app    the Nuxt/Docus website deps   (run by scripts/website.sh)
#   /bench  the benchmark deps            (run by scripts/benchmarks.sh)
# so CI can pull one image and build the whole site (benchmark data included).
#
# This script is the single image OWNER: build, ensure (pull-or-build), login,
# push, pull, clean, lock. scripts/website.sh (run the site) and scripts/benchmarks.sh
# (run the benchmarks) both delegate image ops here. ASCII-only (macOS bash 3.2).
#
# Usage:
#   scripts/podman-website.sh build-image   # build (or rebuild) the image, host-native
#   scripts/podman-website.sh ensure        # make image ready: reuse local if it matches the published digest, else pull-or-build
#   scripts/podman-website.sh login         # log in to GHCR (uses GHCR_PAT / GHCR_PAT_FILE)
#   scripts/podman-website.sh push          # build + push the multi-arch image to GHCR
#   scripts/podman-website.sh pull          # pull the published image and tag it locally
#   scripts/podman-website.sh lock          # regenerate _deps/pnpm-lock.yaml in-container
#   scripts/podman-website.sh clean         # remove the image + named volumes
#
# Env overrides:
#   WEBSITE_ENGINE   container engine (default: podman)
#   WEBSITE_IMAGE    image tag        (default: tsrt-website:dev)
#   WEBSITE_BASE_IMAGE   Node 26 base image (default: node:26-bookworm); point at a
#                        mirror / locally-built base for air-gapped or offline builds.
#   WEBSITE_PNPM_VERSION override the pinned pnpm baked into the image.
#   (default)  ensure PULLS the latest published GHCR image first
#   WEBSITE_USE_LOCAL=1   skip the pull; build/use a local image (maintainer/offline)
#   WEBSITE_REMOTE_IMAGE  remote ref (default: ghcr.io/$GHCR_OWNER/tsrt-website:latest)
#   GHCR_OWNER / GHCR_USER / GHCR_PAT / GHCR_PAT_FILE  (see scripts/lib-ghcr.sh)
#   WEBSITE_MOUNT_OPTS    extra bind-mount opts, e.g. ":z" on SELinux hosts
#   WEBSITE_CA_CERT       file OR dir of extra CA certs to trust inside the image
#                         (corporate / MITM egress proxy). Auto-detects the host's
#                         /usr/local/share/ca-certificates when it holds certs.
#   WEBSITE_BUILD_NETWORK podman build network (e.g. "host" behind a proxy)
#   WEBSITE_RUN_NETWORK   podman run network for `lock` (e.g. "host" behind a proxy)
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/lib-container.sh"
# GHCR publish/pull helpers (login, push, pull) + the registry/owner defaults.
source "$SCRIPT_DIR/lib-ghcr.sh"

CA_SRC="${WEBSITE_CA_CERT:-}"
BUILD_NETWORK="${WEBSITE_BUILD_NETWORK:-}"
CACERTS_DIR="$WEBSITE_DIR/.cacerts"
DEPS_DIR="$WEBSITE_DIR/_deps"
# The merged image also bakes the benchmark deps (under /bench). Their manifests
# live in container-benchmarks/_deps (the source of truth); we stage a copy into the
# website build context (.bench-deps/, git-ignored) so the Containerfile can COPY them.
BENCH_DEPS_SRC="$ROOT_DIR/container-benchmarks/_deps"
BENCH_DEPS_STAGE="$WEBSITE_DIR/.bench-deps"
REMOTE_IMAGE="${WEBSITE_REMOTE_IMAGE:-$GHCR_REGISTRY/$GHCR_OWNER/tsrt-website:latest}"
MANIFEST_NAME="tsrt-website-manifest"

# Populate container-website/.cacerts/ from $WEBSITE_CA_CERT (file or dir). Always
# leaves the dir present (possibly empty) so the Containerfile COPY never fails.
prepare_cacerts() {
  rm -rf "$CACERTS_DIR"; mkdir -p "$CACERTS_DIR"
  # Behind a corporate / MITM egress proxy the image must trust the proxy CA to
  # install deps over TLS. When no explicit WEBSITE_CA_CERT was given, fall back to
  # the host's standard custom-CA dir IF it holds certs (proxied envs); a harmless
  # no-op on a normal host or macOS. The host already trusts these; we propagate
  # them into the image so its install succeeds.
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

# Stage container-benchmarks/_deps into the website build context as .bench-deps/ so
# the merged Containerfile can COPY the benchmark manifests (installed under /bench).
# container-benchmarks/_deps stays the source of truth; this is a throwaway build-
# context copy (git-ignored), refreshed on every build/push. Mirrors prepare_cacerts.
prepare_bench_deps() {
  [ -d "$BENCH_DEPS_SRC" ] || die "missing $BENCH_DEPS_SRC (benchmark deps) - cannot build the merged website+benchmark image"
  rm -rf "$BENCH_DEPS_STAGE"; mkdir -p "$BENCH_DEPS_STAGE"
  # cp the tree contents (portable across GNU/BSD cp: copy the dir's children).
  cp -R "$BENCH_DEPS_SRC"/. "$BENCH_DEPS_STAGE"/
}

# Populate BUILD_ARG_FLAGS from optional env overrides. WEBSITE_BASE_IMAGE swaps the
# Containerfile's default Node 26 base; WEBSITE_PNPM_VERSION overrides the pinned
# pnpm. Honored by both build_image and the multi-arch push.
BUILD_ARG_FLAGS=()
build_arg_flags() {
  BUILD_ARG_FLAGS=()
  [ -n "${WEBSITE_BASE_IMAGE:-}" ] && BUILD_ARG_FLAGS+=(--build-arg "BASE_IMAGE=$WEBSITE_BASE_IMAGE")
  [ -n "${WEBSITE_PNPM_VERSION:-}" ] && BUILD_ARG_FLAGS+=(--build-arg "PNPM_VERSION=$WEBSITE_PNPM_VERSION")
  return 0
}

# Host CPU as an OCI platform arch. A local build is pinned to it so it is ALWAYS
# native, even right after a multi-arch push left a foreign-arch base tag
# (node:26-bookworm) in local storage (which would otherwise make a plain
# host-default build pick the wrong arch and run emulated). The multi-arch push
# sets its own --platform, so it is unaffected.
host_arch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo amd64 ;;
    arm64|aarch64) echo arm64 ;;
    *)             echo amd64 ;;
  esac
}

build_image() {
  require_engine
  prepare_cacerts
  prepare_bench_deps
  build_arg_flags
  echo "==> building $IMAGE from container-website/Containerfile (merged website + benchmark deps)"
  local net=(); [ -n "$BUILD_NETWORK" ] && net=(--network="$BUILD_NETWORK")
  ( cd "$WEBSITE_DIR" && "$ENGINE" build --platform "linux/$(host_arch)" ${net[@]+"${net[@]}"} ${BUILD_ARG_FLAGS[@]+"${BUILD_ARG_FLAGS[@]}"} -t "$IMAGE" -f Containerfile . )
}

# Extract the host-arch image-manifest digest from an OCI index / manifest list on
# stdin (the JSON `podman manifest inspect` prints). Empty when the host arch can't
# be determined or is absent from the index. Pure text parsing, no network.
host_arch_digest_from_index() {
  local arch
  arch="$("$ENGINE" info --format '{{.Host.Arch}}' 2>/dev/null)" || arch=""
  [ -n "$arch" ] || return 0
  awk -v arch="$arch" '
    $1 == "\"digest\":"       { d = $2; gsub(/[",]/, "", d) }
    $1 == "\"architecture\":" { a = $2; gsub(/[",]/, "", a); if (a == arch) { print d; exit } }
  '
}

# Make the working image ready. DEFAULT: use the published GHCR image, but SKIP the
# pull when the local image is ALREADY that image - compare the local image's digest
# to the remote tag's digest for this arch, read as a manifest/index only (KBs, NO
# layer download). Pull only when the local image is missing or not the published
# latest; fall back to an existing local image when the registry is unreachable, then
# to a local build. WEBSITE_USE_LOCAL=1 skips the registry entirely and uses a
# locally-built image (maintainer / offline loop) with the manifest-staleness rebuild.
ensure_image() {
  require_engine
  if [ -n "${WEBSITE_USE_LOCAL:-}" ]; then ensure_image_local; return; fi
  if "$ENGINE" image exists "$IMAGE" 2>/dev/null; then
    local index local_digest remote_digest
    index="$("$ENGINE" manifest inspect "$REMOTE_IMAGE" 2>/dev/null || true)"
    if [ -z "$index" ]; then
      echo "==> registry unreachable - using existing local image $IMAGE (no pull)" >&2
      return
    fi
    local_digest="$("$ENGINE" image inspect "$IMAGE" --format '{{.Digest}}' 2>/dev/null || true)"
    remote_digest="$(printf '%s\n' "$index" | host_arch_digest_from_index)"
    if [ -n "$local_digest" ] && [ "$local_digest" = "$remote_digest" ]; then
      echo "==> local image $IMAGE already matches published $REMOTE_IMAGE ($remote_digest) - skipping pull" >&2
      return
    fi
    echo "==> local image is not the published latest - pulling $REMOTE_IMAGE" >&2
  fi
  if ghcr_try_pull_retag "$REMOTE_IMAGE" "$IMAGE"; then return; fi
  if "$ENGINE" image exists "$IMAGE" 2>/dev/null; then
    echo "==> using existing local image $IMAGE" >&2; return
  fi
  echo "==> no published or local image available - building locally" >&2
  build_image
}

# Local-image path: build when missing, and rebuild when any baked manifest (or the
# Containerfile) is newer than the cached image. The bind-mounted source/config
# never need a rebuild since they're mounted live.
ensure_image_local() {
  if ! "$ENGINE" image exists "$IMAGE" 2>/dev/null; then build_image; return; fi
  local img_epoch src_epoch=0 f t
  img_epoch="$("$ENGINE" image inspect "$IMAGE" --format '{{.Created.Unix}}' 2>/dev/null || true)"
  [ -z "$img_epoch" ] && img_epoch=0
  # Website manifests + the Containerfile, AND the benchmark manifests (baked into
  # the same merged image, so a bench dep bump must rebuild it too).
  for f in "$WEBSITE_DIR/Containerfile" "$DEPS_DIR/package.json" "$DEPS_DIR/pnpm-lock.yaml" "$DEPS_DIR/pnpm-workspace.yaml" "$DEPS_DIR/.npmrc"; do
    [ -f "$f" ] || continue
    # GNU stat (Linux) uses -c %Y; BSD stat (macOS) uses -f %m. Try GNU first;
    # on Linux `stat -f` SUCCEEDS but prints filesystem info, not the mtime.
    t="$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo 0)"
    [ "$t" -gt "$src_epoch" ] && src_epoch="$t"
  done
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    t="$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo 0)"
    [ "$t" -gt "$src_epoch" ] && src_epoch="$t"
  done < <(find "$BENCH_DEPS_SRC" -type f 2>/dev/null)
  if [ "$src_epoch" -gt "$img_epoch" ]; then
    echo "==> image is stale (Containerfile or a manifest newer than image) - rebuilding"
    build_image
  fi
}

cmd_login() { require_engine; ghcr_login; }

cmd_push() {
  require_engine
  prepare_cacerts
  prepare_bench_deps
  build_arg_flags
  ghcr_push_multiarch "$MANIFEST_NAME" "$WEBSITE_DIR" "$REMOTE_IMAGE" "$BUILD_NETWORK"
}

cmd_pull() { require_engine; ghcr_pull_retag "$REMOTE_IMAGE" "$IMAGE"; }

# Regenerate _deps/pnpm-lock.yaml inside the container, so the host stays free of
# any package-manager files. The supported "bump a website dep" step: edit
# _deps/package.json, then run this.
cmd_lock() {
  ensure_image
  echo "==> regenerating _deps/pnpm-lock.yaml inside the container"
  local net=(); [ -n "${WEBSITE_RUN_NETWORK:-}" ] && net=(--network="$WEBSITE_RUN_NETWORK")
  "$ENGINE" run --rm --init ${net[@]+"${net[@]}"} \
    -v "$DEPS_DIR:/lock${MOUNT_OPTS}" -w /lock "$IMAGE" \
    pnpm install --lockfile-only --no-frozen-lockfile
}

cmd_clean() {
  require_engine
  echo "==> removing image $IMAGE and named volumes"
  "$ENGINE" rmi -f "$IMAGE" 2>/dev/null || true
  "$ENGINE" volume rm -f "$VOL_NUXT" "$VOL_DATA" "$VOL_CACHE" 2>/dev/null || true
}

main() {
  case "${1:-}" in
    build-image) build_image ;;
    ensure)      ensure_image ;;
    login)       cmd_login ;;
    push)        cmd_push ;;
    pull)        cmd_pull ;;
    lock)        cmd_lock ;;
    clean)       cmd_clean ;;
    *) die "unknown command '${1:-}'. Try: build-image | ensure | login | push | pull | lock | clean" ;;
  esac
}

main "$@"
