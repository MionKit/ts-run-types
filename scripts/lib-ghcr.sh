# lib-ghcr.sh - shared GitHub Container Registry (GHCR) helpers, sourced by
# scripts/website.sh and scripts/benchmarks.sh. Publishes the deps-only images so
# they can be PULLED ready-to-run instead of rebuilt from scratch on every host.
#
# ASCII-only by deliberate policy (macOS bash 3.2 mis-parses UTF-8 in variable
# expansions). Relies on $ENGINE from the caller (podman by default). Sourcing
# this file has no side effects beyond defining vars + functions.
#
# Auth: a GitHub PAT with `write:packages` (push) / `read:packages` (private
# pull). Provide it via GHCR_PAT (inline) or GHCR_PAT_FILE (path to a file). It
# is piped through `--password-stdin` only, never echoed and never written into a
# layer, the build context, or git.
#
# Knobs (all overridable from the environment):
#   GHCR_REGISTRY  registry host        (default: ghcr.io)
#   GHCR_OWNER     namespace/owner      (default: mionkit)
#   GHCR_USER      login username       (default: M-jerez)
#   GHCR_PAT       token, inline
#   GHCR_PAT_FILE  token, file path
# ------------------------------------------------------------------------------

GHCR_REGISTRY="${GHCR_REGISTRY:-ghcr.io}"
GHCR_OWNER="${GHCR_OWNER:-mionkit}"
GHCR_USER="${GHCR_USER:-M-jerez}"
GHCR_PAT_FILE="${GHCR_PAT_FILE:-}"

# Echo the resolved PAT to stdout (no trailing newline). Non-zero if none found.
ghcr_resolve_pat() {
  if [ -n "${GHCR_PAT:-}" ]; then printf '%s' "$GHCR_PAT"; return 0; fi
  if [ -n "$GHCR_PAT_FILE" ] && [ -f "$GHCR_PAT_FILE" ]; then
    tr -d '\r\n' < "$GHCR_PAT_FILE"; return 0
  fi
  return 1
}

# Log in to the registry using the resolved PAT via --password-stdin.
ghcr_login() {
  local pat
  if ! pat="$(ghcr_resolve_pat)"; then
    echo "ghcr: no PAT found. Set GHCR_PAT=<token> or GHCR_PAT_FILE=/path/to/pat.txt" >&2
    return 1
  fi
  echo "==> logging in to $GHCR_REGISTRY as $GHCR_USER"
  printf '%s' "$pat" | "$ENGINE" login "$GHCR_REGISTRY" -u "$GHCR_USER" --password-stdin
}

# ghcr_push_multiarch <manifest-name> <context-dir> <remote-ref> [build-network]
# Build a linux/amd64 + linux/arm64 manifest list and push it to <remote-ref>.
# On an arm64 host the amd64 arm builds under QEMU emulation (slower).
ghcr_push_multiarch() {
  local manifest="$1" ctx="$2" ref="$3" net="${4:-}"
  local netarg=(); [ -n "$net" ] && netarg=(--network="$net")
  echo "==> building multi-arch (linux/amd64,linux/arm64) manifest: $manifest"
  "$ENGINE" manifest rm "$manifest" 2>/dev/null || true
  "$ENGINE" manifest create "$manifest"
  ( cd "$ctx" && "$ENGINE" build ${netarg[@]+"${netarg[@]}"} \
      --platform linux/amd64,linux/arm64 --manifest "$manifest" -f Containerfile . )
  echo "==> pushing manifest -> docker://$ref"
  "$ENGINE" manifest push --all "$manifest" "docker://$ref"
  echo "==> pushed $ref"
}

# ghcr_pull_retag <remote-ref> <local-image>
# Pull the published image and tag it as the script's local working image so the
# rest of the driver script is unchanged.
ghcr_pull_retag() {
  local ref="$1" local_img="$2"
  echo "==> pulling $ref"
  "$ENGINE" pull "$ref"
  "$ENGINE" tag "$ref" "$local_img"
  echo "==> tagged $ref as $local_img"
}

# ghcr_try_pull_retag <remote-ref> <local-image>  -> 0 on success, 1 on failure
# Refresh the local working image from the published one before a run. `podman
# pull` is a cheap no-op when the local copy already matches the remote digest,
# and only downloads changed layers otherwise -- so this is the "ensure the
# latest image is pulled before running" check. Returns non-zero (without
# failing) when the registry is unreachable / the image isn't published / the
# caller isn't logged in, so callers can fall back to a local image or build.
ghcr_try_pull_retag() {
  local ref="$1" local_img="$2"
  echo "==> ensuring latest published image is pulled: $ref"
  if "$ENGINE" pull "$ref"; then
    "$ENGINE" tag "$ref" "$local_img"
    return 0
  fi
  echo "==> could not pull $ref (offline / not published / not logged in)" >&2
  return 1
}
