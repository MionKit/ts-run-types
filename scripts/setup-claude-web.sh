#!/usr/bin/env bash
# --- BUMP THIS DATE to force a fresh setup run (YYYY-MM-DD) -------------------
SETUP_DATE="2026-07-07"
# ----------------------------------------------------------------------------
set -uo pipefail

NODE_MAJOR_MIN=26
PODMAN_MIN=4.0
GO_MIN=1.26
GO_INSTALL_VERSION=1.26.0 # only used if Go is somehow absent from the image

CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check)   CHECK_ONLY=1 ;;
    -h|--help) grep '^#' "${BASH_SOURCE[0]:-$0}" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $arg (try --help)" >&2; exit 1 ;;
  esac
done

FAILED=0
SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m  %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m   %s\n' "$*"; }
err()  { printf '  \033[31mERR\033[0m %s\n' "$*" >&2; }
# true if $1 >= $2 (dotted versions)
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }
# node major version currently resolvable on PATH (0 if node absent)
node_major() { command -v node >/dev/null 2>&1 && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# --- repo root ---------------------------------------------------------------
# As the web environment's SETUP SCRIPT this runs BEFORE Claude Code launches:
# $CLAUDE_PROJECT_DIR is usually UNSET (it is a hook-time var), the CWD is often
# not the repo, and the script lives in a temp path (so BASH_SOURCE/.. is wrong).
# So we probe the env var + CWD + this script's dir, then the known web clone
# path, then fall back to a bounded filesystem search for the repo's go.mod
# (identified by its unique module path). A fresh clone is fine - we only need
# committed files, not the (uninitialized) submodules.
_looks_like_repo() {
  [ -f "$1/package.json" ] && [ -f "$1/ts-go-runtypes/go.mod" ] && [ -d "$1/ts-go-runtypes/cmd/ts-runtypes" ] \
    && grep -q '^module github.com/mionkit/ts-runtypes' "$1/ts-go-runtypes/go.mod" 2>/dev/null
}
_resolve_repo_dir() {
  local cand d selfdir root gomod
  selfdir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
  # 1) explicit candidates, incl. the web clone convention /home/<user>/ts-run-types
  for cand in "${CLAUDE_PROJECT_DIR:-}" "$PWD" "$selfdir/.." "$selfdir" \
              /home/user/ts-run-types /root/ts-run-types /workspace/ts-run-types; do
    [ -n "$cand" ] || continue
    cand="$(cd "$cand" 2>/dev/null && pwd)" || continue
    _looks_like_repo "$cand" && { printf '%s' "$cand"; return 0; }
  done
  # 2) walk up from CWD and this script's dir
  for d in "$PWD" "$selfdir"; do
    while [ -n "$d" ] && [ "$d" != "/" ]; do
      _looks_like_repo "$d" && { printf '%s' "$d"; return 0; }
      d="$(dirname "$d")"
    done
  done
  # 3) bounded search for our go.mod under the usual clone roots (fast:
  #    -maxdepth keeps it shallow; the module-path check rejects other go.mods)
  for root in /home /root /workspace /app /srv; do
    [ -d "$root" ] || continue
    while IFS= read -r gomod; do
      d="$(dirname "$(dirname "$gomod")")"
      _looks_like_repo "$d" && { printf '%s' "$d"; return 0; }
    done < <(find "$root" -maxdepth 5 -path '*/ts-go-runtypes/go.mod' -type f 2>/dev/null)
  done
  return 1
}
REPO_DIR="$(_resolve_repo_dir || true)"
if [ -z "$REPO_DIR" ]; then
  err "could not locate the ts-runtypes repo root."
  err "  CLAUDE_PROJECT_DIR='${CLAUDE_PROJECT_DIR:-<unset>}'  PWD='$PWD'"
  err "  searched those + this script's dir + go.mod (module github.com/mionkit/ts-runtypes) under /home /root /workspace /app /srv."
  err "  If the repo is not cloned yet when the setup script runs, move the repo build to the SessionStart hook (which has \$CLAUDE_PROJECT_DIR), or set CLAUDE_PROJECT_DIR to the checkout."
  exit 1
fi

# pnpm version the repo pins via package.json "packageManager" (fallback if unparsable)
PNPM_PIN="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\)".*/\1/p' "$REPO_DIR/package.json" 2>/dev/null | head -1)"
[ -n "$PNPM_PIN" ] || PNPM_PIN="11.8.0"

# -----------------------------------------------------------------------------
# 1. Node 26: install (nvm first, nodejs.org tarball fallback), then make it win
#    on PATH for the harness's NON-login shells via $HOME/.local/bin symlinks.
# -----------------------------------------------------------------------------
provision_node26() {
  bold "Node $NODE_MAJOR_MIN (repo requires >= $NODE_MAJOR_MIN; CI pins $NODE_MAJOR_MIN)"

  local n26root=""
  if [ "$(node_major)" -ge "$NODE_MAJOR_MIN" ] && [ -x "/opt/node26/bin/node" ]; then
    ok "Node $(node --version) already active"
  elif [ "$CHECK_ONLY" = 1 ]; then
    warn "Node $NODE_MAJOR_MIN not active (found major $(node_major)) - re-run without --check to install"
    return 0
  else
    # (a) prefer the image's nvm
    local nvm_dir="${NVM_DIR:-}" cand
    for cand in "$nvm_dir" /opt/nvm "$HOME/.nvm"; do
      [ -n "$cand" ] && [ -s "$cand/nvm.sh" ] && { nvm_dir="$cand"; break; }
    done
    if [ -n "$nvm_dir" ] && [ -s "$nvm_dir/nvm.sh" ]; then
      bold "Installing Node $NODE_MAJOR_MIN via nvm ($nvm_dir)"
      # shellcheck disable=SC1091
      export NVM_DIR="$nvm_dir"; . "$nvm_dir/nvm.sh"
      if nvm install "$NODE_MAJOR_MIN" >/dev/null 2>&1; then
        n26root="$(dirname "$(dirname "$(nvm which "$NODE_MAJOR_MIN" 2>/dev/null)")")"
      fi
    fi
    # (b) fallback: nodejs.org tarball
    if [ -z "$n26root" ] || [ ! -x "$n26root/bin/node" ]; then
      warn "nvm unavailable or failed - falling back to a nodejs.org tarball"
      local nodearch; case "$(uname -m)" in
        x86_64) nodearch=x64 ;; aarch64|arm64) nodearch=arm64 ;;
        *) err "unsupported arch $(uname -m) for Node auto-install"; FAILED=1; return 1 ;;
      esac
      local ver; ver="$(curl -fsSL "https://nodejs.org/dist/index.json" 2>/dev/null \
        | sed -n 's/.*"version":"v\('"$NODE_MAJOR_MIN"'\.[0-9.]*\)".*/\1/p' | head -1)"
      [ -n "$ver" ] || { err "could not resolve a Node $NODE_MAJOR_MIN release from nodejs.org"; FAILED=1; return 1; }
      local tarball="node-v${ver}-linux-${nodearch}.tar.xz"
      curl -fsSL "https://nodejs.org/dist/v${ver}/${tarball}" -o "/tmp/${tarball}" \
        || { err "Node tarball download failed"; FAILED=1; return 1; }
      rm -rf /opt/node26-dist && mkdir -p /opt/node26-dist
      tar -C /opt/node26-dist --strip-components=1 -xf "/tmp/${tarball}" \
        || { err "Node tarball extract failed"; FAILED=1; return 1; }
      n26root="/opt/node26-dist"
    fi
  fi

  # Stable /opt/node26 symlink + PATH wiring even on the "already active" path,
  # so a re-run repairs a half-set-up container.
  if [ -n "$n26root" ]; then
    ln -sfn "$n26root" /opt/node26 || { err "could not create /opt/node26 symlink"; FAILED=1; return 1; }
  fi
  [ -x "/opt/node26/bin/node" ] || { [ "$CHECK_ONLY" = 1 ] && return 0; err "/opt/node26/bin/node missing after install"; FAILED=1; return 1; }

  # pnpm via corepack, pinned to the repo's packageManager. Run from the repo
  # root so corepack reads the ROOT package.json (a submodule pins npm).
  /opt/node26/bin/corepack enable >/dev/null 2>&1 || true
  ( cd "$REPO_DIR" && /opt/node26/bin/corepack prepare "pnpm@$PNPM_PIN" --activate >/dev/null 2>&1 ) \
    || warn "corepack could not pre-activate pnpm@$PNPM_PIN (will resolve on first use)"

  # The harness runs NON-login shells that inherit PATH from the image and do
  # NOT source /etc/profile.d, so a profile.d file alone would not take effect.
  # $HOME/.local/bin is first on that inherited PATH (ahead of /opt/node<xx>),
  # so symlinking the node26 binaries there makes `node`/`pnpm` resolve to 26.
  local localbin="$HOME/.local/bin" exe; mkdir -p "$localbin"
  for exe in /opt/node26/bin/*; do ln -sfn "$exe" "$localbin/$(basename "$exe")"; done
  case ":$PATH:" in *":$localbin:"*) : ;; *) warn "$localbin is not on PATH - add it ahead of /opt/node<xx>/bin" ;; esac

  # Belt-and-suspenders for LOGIN shells (e.g. an interactive terminal).
  if [ -w /etc/profile.d ] || [ "$(id -u)" = 0 ]; then
    cat > /etc/profile.d/zz-node26.sh <<EOF
# ts-runtypes claude-web setup: prefer Node $NODE_MAJOR_MIN (repo requires >= $NODE_MAJOR_MIN; CI pins $NODE_MAJOR_MIN)
export NVM_DIR="${NVM_DIR:-/opt/nvm}"
export PATH="\$HOME/.local/bin:/opt/node26/bin:\$PATH"
EOF
    chmod 0644 /etc/profile.d/zz-node26.sh 2>/dev/null || true
  fi

  hash -r 2>/dev/null || true
  if [ "$(node_major)" -ge "$NODE_MAJOR_MIN" ]; then
    ok "Node $(node --version) active; pnpm $(cd "$REPO_DIR" && pnpm --version 2>/dev/null)"
  else
    err "Node still resolves to major $(node_major) after wiring - check \$HOME/.local/bin PATH precedence"
    FAILED=1
  fi
}

# -----------------------------------------------------------------------------
# 2. podman via apt, then confirm the engine is reachable (rootless on the web).
# -----------------------------------------------------------------------------
ensure_podman() {
  bold "podman (container runtime for the docs website + benchmarks)"
  if command -v podman >/dev/null 2>&1; then
    local cur; cur="$(podman --version 2>/dev/null | awk '{print $3}')"
    version_ge "${cur:-0}" "$PODMAN_MIN" && ok "podman ${cur:-?} (>= $PODMAN_MIN)" || warn "podman ${cur:-?} present (repo targets >= $PODMAN_MIN)"
  elif [ "$CHECK_ONLY" = 1 ]; then
    warn "podman missing - re-run without --check to install"
    return 0
  else
    bold "Installing podman via apt"
    # `apt-get update` refreshes every configured repo; a stale unrelated PPA can
    # fail it, but the official repo we install from refreshed fine, so warn+continue.
    $SUDO apt-get update -qq || warn "apt-get update reported errors from unrelated repos - continuing"
    if $SUDO apt-get install -y -qq podman && command -v podman >/dev/null 2>&1; then
      ok "podman installed ($(podman --version 2>/dev/null | awk '{print $3}'))"
    else
      err "podman install failed"; FAILED=1; return 1
    fi
  fi
  [ "$CHECK_ONLY" = 1 ] && return 0
  if podman info >/dev/null 2>&1; then ok "podman engine reachable"
  else warn "podman engine not reachable yet (rootless init may need a moment; containers will still build on demand)"; fi
}

# -----------------------------------------------------------------------------
# 3. Go: present in the web image; tarball fallback keeps this standalone.
# -----------------------------------------------------------------------------
ensure_go() {
  bold "Go (compiles the resolver binary)"
  if command -v go >/dev/null 2>&1; then
    local cur; cur="$(go version 2>/dev/null | awk '{print $3}' | sed 's/^go//')"
    version_ge "${cur:-0}" "$GO_MIN" && ok "go ${cur:-?} (>= $GO_MIN)" || warn "go ${cur:-?} present (repo targets >= $GO_MIN)"
    return 0
  fi
  [ "$CHECK_ONLY" = 1 ] && { warn "go missing - re-run without --check to install"; return 0; }
  bold "Installing Go $GO_INSTALL_VERSION (tarball -> /usr/local/go)"
  local goarch; case "$(uname -m)" in
    x86_64) goarch=amd64 ;; aarch64|arm64) goarch=arm64 ;;
    *) err "unsupported arch $(uname -m) for Go auto-install"; FAILED=1; return 1 ;;
  esac
  local tgz="go${GO_INSTALL_VERSION}.linux-${goarch}.tar.gz"
  if curl -fsSL "https://go.dev/dl/${tgz}" -o "/tmp/${tgz}" \
     && $SUDO rm -rf /usr/local/go && $SUDO tar -C /usr/local -xzf "/tmp/${tgz}"; then
    export PATH="/usr/local/go/bin:$PATH"
    ok "go installed ($(go version 2>/dev/null | awk '{print $3}'))"
  else
    err "go install failed"; FAILED=1
  fi
}

# -----------------------------------------------------------------------------
# 3b. garble: a Go tool that obfuscates the published binaries + wasm. Best-effort;
#     the resolver/dev build never needs it, but the release build + the default
#     garbled wasm do. Keep the pin in sync with scripts/lib/garble.mjs.
# -----------------------------------------------------------------------------
GARBLE_VERSION="v0.16.0"
ensure_garble() {
  bold "garble (obfuscates published binaries + wasm)"
  command -v go >/dev/null 2>&1 || { warn "go missing - skipping garble"; return 0; }
  local gobin; gobin="$(go env GOPATH 2>/dev/null)/bin"
  case ":$PATH:" in *":$gobin:"*) ;; *) export PATH="$gobin:$PATH" ;; esac
  if command -v garble >/dev/null 2>&1; then ok "garble present"; return 0; fi
  [ "$CHECK_ONLY" = 1 ] && { warn "garble missing - re-run without --check to install"; return 0; }
  bold "Installing garble $GARBLE_VERSION (go install)"
  go install "mvdan.cc/garble@$GARBLE_VERSION" && ok "garble installed" \
    || warn "garble install failed (release builds need it; wasm falls back to plain)"
}

# -----------------------------------------------------------------------------
# 4. Submodules (light): init tsgolint + typescript-go but SKIP the 620MB nested
#    _submodules/TypeScript (microsoft/TypeScript). That corpus feeds only
#    typescript-go's OWN conformance test runner (internal/testrunner), never our
#    `go build ./cmd/ts-runtypes` - the checker's lib .d.ts files are committed in
#    typescript-go/internal/bundled/libs and baked in via go:embed. Verified: the
#    binary builds and the full `go test ./internal/...` suite passes without it.
# -----------------------------------------------------------------------------
provision_submodules_light() {
  bold "Submodules (tsgolint + typescript-go; skipping the 620MB TypeScript corpus)"
  local tsgolint="$REPO_DIR/ts-go-runtypes/third_party/tsgolint"
  local tsgo="$tsgolint/typescript-go"
  if [ -f "$tsgolint/go.mod" ] && { [ -d "$tsgo/.git" ] || [ -f "$tsgo/.git" ]; }; then
    ok "submodules present"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "submodules not initialized - re-run without --check"
    return 0
  fi
  # Non-recursive, two steps: tsgolint, then typescript-go INSIDE it. No
  # --recursive, so the nested _submodules/TypeScript is never fetched.
  _light_submodule_init() {
    ( cd "$REPO_DIR" && git submodule update --init ts-go-runtypes/third_party/tsgolint ) &&
    ( cd "$tsgolint" && git submodule update --init typescript-go )
  }
  if _light_submodule_init; then
    ok "submodules ready (deep TypeScript corpus skipped)"
    return 0
  fi
  # Some managed environments (Claude Code on the web) inject a git rewrite that
  # routes github.com through a per-repo credential proxy, which 403s on the
  # PUBLIC tsgolint submodule. Retry with that injected global gitconfig disabled
  # so the clone goes over direct HTTPS (CA bundle + proxy still come from env).
  warn "submodule init failed - retrying with the injected git-proxy rewrite bypassed"
  if ( export GIT_CONFIG_GLOBAL=/dev/null; _light_submodule_init ); then
    ok "submodules ready (direct-HTTPS bypass, deep TypeScript corpus skipped)"
    return 0
  fi
  err "submodule init failed (direct and proxy-bypass attempts)"
  FAILED=1
  return 1
}

# -----------------------------------------------------------------------------
# 5. Apply the tsgolint patches to the typescript-go working tree. Idempotent:
#    a patch that already applies in reverse is treated as applied and skipped.
# -----------------------------------------------------------------------------
apply_tsgolint_patches() {
  bold "tsgolint patches"
  local tsgo_dir="$REPO_DIR/ts-go-runtypes/third_party/tsgolint/typescript-go"
  local patches_dir="$REPO_DIR/ts-go-runtypes/third_party/tsgolint/patches"
  [ -d "$tsgo_dir" ] || { warn "typescript-go missing - skipping patches"; return 0; }
  [ -d "$patches_dir" ] || { warn "patches/ missing - skipping"; return 0; }
  local patches=("$patches_dir"/*.patch)
  [ -e "${patches[0]}" ] || { ok "no tsgolint patches to apply"; return 0; }

  local needs_apply=() already=0 broken=0 patch
  for patch in "${patches[@]}"; do
    if   ( cd "$tsgo_dir" && git apply --reverse --check "$patch" >/dev/null 2>&1 ); then already=$((already+1))
    elif ( cd "$tsgo_dir" && git apply --check "$patch" >/dev/null 2>&1 ); then needs_apply+=("$patch")
    elif ( cd "$tsgo_dir" && git apply --3way --check "$patch" >/dev/null 2>&1 ); then needs_apply+=("$patch")
    else err "patch $(basename "$patch") neither applies cleanly nor in reverse"; broken=$((broken+1)); fi
  done
  if [ "$broken" -gt 0 ]; then err "$broken tsgolint patch(es) cannot be applied or reversed; resolve manually"; FAILED=1; return 1; fi
  if [ "${#needs_apply[@]}" -eq 0 ]; then ok "tsgolint patches already applied ($already)"; return 0; fi
  if [ "$CHECK_ONLY" = 1 ]; then warn "${#needs_apply[@]} tsgolint patch(es) need applying - re-run without --check"; return 0; fi

  bold "Applying ${#needs_apply[@]} tsgolint patch(es)"
  for patch in "${needs_apply[@]}"; do
    ( cd "$tsgo_dir" && git apply --3way "$patch" ) || { err "git apply failed on $(basename "$patch")"; FAILED=1; return 1; }
  done
  ok "tsgolint patches applied"
}

# -----------------------------------------------------------------------------
# 6. Install workspace deps if node_modules is missing.
# -----------------------------------------------------------------------------
install_workspace_deps() {
  bold "Workspace deps (pnpm install --frozen-lockfile)"
  command -v pnpm >/dev/null 2>&1 || { err "pnpm missing (the Node 26 step should have provided it)"; FAILED=1; return 1; }
  if [ -d "$REPO_DIR/node_modules" ] && [ -f "$REPO_DIR/node_modules/.modules.yaml" ]; then ok "node_modules present (skipping install)"; return 0; fi
  [ "$CHECK_ONLY" = 1 ] && { warn "workspace deps not installed - re-run without --check"; return 0; }
  ( cd "$REPO_DIR" && pnpm install --frozen-lockfile ) && ok "workspace deps installed" || { err "pnpm install failed"; FAILED=1; }
}

# -----------------------------------------------------------------------------
# 7. Wire husky's git commit hooks (commit-msg -> commitlint, pre-commit ->
#    lint-staged). Separate from install: `ignoreScripts` (the pnpm supply-chain
#    policy) blocks husky's `prepare` from auto-running, and core.hooksPath is
#    per-clone LOCAL git state a clone never carries - so without this, commits
#    made in the web env skip the checks. Idempotent + non-fatal (CI still gates).
# -----------------------------------------------------------------------------
wire_husky() {
  bold "husky git hooks (commit-msg -> commitlint, pre-commit -> lint-staged)"
  command -v pnpm >/dev/null 2>&1 || { warn "pnpm missing - cannot wire husky hooks"; return 0; }
  if [ "$(git -C "$REPO_DIR" config --get core.hooksPath 2>/dev/null || true)" = ".husky/_" ]; then
    ok "husky hooks already wired"; return 0
  fi
  [ "$CHECK_ONLY" = 1 ] && { warn "husky hooks not wired - re-run without --check"; return 0; }
  ( cd "$REPO_DIR" && pnpm exec husky ) && ok "husky hooks wired" \
    || warn "husky wiring failed - commits won't be checked locally (CI still gates)"
}

# -----------------------------------------------------------------------------
# 8. Build the Go resolver binary at bin/ts-runtypes (skips when up-to-date).
# -----------------------------------------------------------------------------
build_go_binary() {
  bold "Go resolver binary -> bin/ts-runtypes"
  command -v go >/dev/null 2>&1 || { err "go missing - cannot build the binary"; FAILED=1; return 1; }
  local bin="$REPO_DIR/bin/ts-runtypes"
  if [ -x "$bin" ] && [ -z "$(find "$REPO_DIR/ts-go-runtypes/cmd" "$REPO_DIR/ts-go-runtypes/internal" -type f -newer "$bin" -print -quit 2>/dev/null)" ]; then
    ok "binary up-to-date"; return 0
  fi
  [ "$CHECK_ONLY" = 1 ] && { warn "binary missing or stale - re-run without --check"; return 0; }
  ( cd "$REPO_DIR/ts-go-runtypes" && go build -o "$REPO_DIR/bin/ts-runtypes" ./cmd/ts-runtypes ) && ok "binary built" || { err "go build failed"; FAILED=1; }
}

# -----------------------------------------------------------------------------
# 9. Build ts-runtypes-devtools dist (consumers + the marker typecheck read it).
# -----------------------------------------------------------------------------
build_devtools() {
  bold "ts-runtypes-devtools dist"
  command -v pnpm >/dev/null 2>&1 || { err "pnpm missing"; FAILED=1; return 1; }
  local dist="$REPO_DIR/packages/ts-runtypes-devtools/dist/index.js"
  if [ -f "$dist" ] && [ -z "$(find "$REPO_DIR/packages/ts-runtypes-devtools/src" -type f -newer "$dist" -print -quit 2>/dev/null)" ]; then
    ok "devtools dist up-to-date"; return 0
  fi
  [ "$CHECK_ONLY" = 1 ] && { warn "devtools dist missing or stale - re-run without --check"; return 0; }
  ( cd "$REPO_DIR" && pnpm --filter ts-runtypes-devtools run build ) && ok "devtools dist built" || { err "devtools build failed"; FAILED=1; }
}

# -----------------------------------------------------------------------------
# 10. Keep the placeholder .env from shadowing real environment secrets.
#    A dev .env (created by the interactive skill, or a stray checkout) has empty
#    secret rows (GHCR_PAT= etc.). lib-env.sh sources .env with `set -a`, so an
#    empty assignment OVERWRITES the value the web env injects - breaking GHCR
#    login. On the web the environment is the source of truth, so strip empty
#    placeholder lines whenever the process env already provides them.
# -----------------------------------------------------------------------------
neutralize_placeholder_env() {
  local envfile="$REPO_DIR/.env"
  [ -f "$envfile" ] || return 0
  [ "$CHECK_ONLY" = 1 ] && return 0
  local var stripped=0
  for var in GHCR_PAT NPM_TOKEN CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_PAGES_PROJECT; do
    if [ -n "${!var:-}" ] && grep -qE "^${var}=$" "$envfile"; then
      sed -i -E "/^${var}=$/d" "$envfile"
      stripped=$((stripped + 1))
    fi
  done
  bold "Local .env (dev only)"
  [ "$stripped" -gt 0 ] && ok "stripped $stripped empty placeholder secret line(s) from .env (env values win)" || ok ".env does not shadow environment secrets"
}

# -----------------------------------------------------------------------------
# 11. GHCR login so a later `pnpm rtx website dev` / `pnpm run bench` can PULL the
#     private tsrt-website image instead of rebuilding it. Login is auth only - it
#     pulls nothing, so it stays within the setup time budget.
# -----------------------------------------------------------------------------
ghcr_login() {
  local reg="${GHCR_REGISTRY:-ghcr.io}" owner="${GHCR_OWNER:-mionkit}" user="${GHCR_USER:-}"
  bold "GHCR login (private image $reg/$owner/tsrt-website)"
  if [ "$CHECK_ONLY" = 1 ]; then
    [ -n "${GHCR_PAT:-}" ] && ok "GHCR_PAT present - login would run" || warn "GHCR_PAT not set - image would build locally on demand"
    return 0
  fi
  [ -n "${GHCR_PAT:-}" ] || { warn "GHCR_PAT not set - skipping login (image would build locally on demand)"; return 0; }
  command -v podman >/dev/null 2>&1 || { warn "podman missing - skipping GHCR login"; return 0; }
  if printf '%s' "$GHCR_PAT" | podman login "$reg" -u "${user:-x-access-token}" --password-stdin >/dev/null 2>&1; then
    ok "logged in to $reg as ${user:-x-access-token}"
  else
    warn "GHCR login failed (check GHCR_PAT / egress policy) - image would build locally on demand"
  fi
  # NOTE: PULLING the image also needs the egress policy to allow the GHCR blob
  # host pkg-containers.githubusercontent.com; auth + manifest via $reg alone are
  # not sufficient. That is a network-policy matter, outside this script.
}

main() {
  bold "RunTypes - Claude Code on the web setup (rev $SETUP_DATE)$([ "$CHECK_ONLY" = 1 ] && echo '  [check-only]')"
  echo "  repo: $REPO_DIR"
  if [ "$(uname -s)" != Linux ]; then
    err "This installer targets the Linux web container. For local/macOS hosts use the ts-runtypes-setup skill."
    exit 3
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    err "apt-get not found - this installer assumes the Debian/Ubuntu web image."
    exit 3
  fi
  [ "$(id -u)" = 0 ] || warn "not running as root - install steps use sudo where available"

  provision_node26
  ensure_podman
  ensure_go
  ensure_garble
  provision_submodules_light
  apply_tsgolint_patches
  install_workspace_deps
  wire_husky
  build_go_binary
  build_devtools
  neutralize_placeholder_env
  ghcr_login

  bold "Ready. Verify / work from the repo root (this setup ran no tests):"
  echo "  pnpm rtx --help         # the internal dev/website/bench/publish CLI"
  echo "  pnpm test              # full JS suite (spawns the Go binary)"
  echo "  pnpm rtx website dev   # docs site -> http://localhost:3000"
  echo "  pnpm run bench         # full validation benchmark"

  if [ "$FAILED" = 0 ]; then bold "Setup OK."; else bold "Setup incomplete - see ERR above."; exit 1; fi
}

main "$@"

# =============================================================================
# setup-claude-web.sh - one-shot, SELF-CONTAINED bootstrap for RunTypes on
# Claude Code on the web (the managed, ephemeral Linux container).
#
# +-------------------------------------------------------------------------+
# | THIS FILE MUST STAY SELF-CONTAINED.                                      |
# |                                                                         |
# | It is copy-pasted verbatim into the Claude Code web environment's       |
# | "setup script" field, so at run time it is NOT `scripts/…` in a checkout|
# | - it is a lone script in a temp path. It therefore MUST NOT source or   |
# | call any other repo file (the ts-runtypes-setup skill's setup.sh,       |
# | scripts/container/image.mjs, scripts/lib/*.mjs, pm/*.sh, …) and MUST NOT |
# | derive the repo root from BASH_SOURCE. Every step is inlined on purpose.|
# | If you factor something out into another file, this script breaks the   |
# | moment it runs from the UI. Keep it standalone; DUPLICATE logic rather  |
# | than share it.                                                          |
# |                                                                         |
# | The interactive, cross-platform, user-assist setup lives separately in  |
# | .claude/skills/ts-runtypes-setup/ - that one is for humans on their own |
# | machines (macOS + Linux, brew/apt/dnf/…). THIS one is the autonomous    |
# | web installer. They are intentionally NOT shared and evolve separately. |
# +-------------------------------------------------------------------------+
#
# What it does, in one go, no prompts, Linux/apt only:
#   1. Node 26  - repo requires >= 26 & CI pins 26, but the web image ships
#      an older Node. Install via the image's nvm (nodejs.org tarball fallback) and
#      make it win on the harness's NON-login PATH (which does not source
#      /etc/profile.d) by symlinking node26 bins into $HOME/.local/bin. pnpm
#      comes from corepack, pinned to the repo's packageManager.
#   2. podman   - via apt; confirm the engine is reachable.
#   3. Go 1.26  - present in the web image; nodejs-style tarball fallback.
#   4. submodules tsgolint + typescript-go, SKIPPING the 620MB nested
#      microsoft/TypeScript corpus (only typescript-go's own conformance test
#      runner needs it, never our `go build`; its checker libs are committed +
#      go:embed'd in typescript-go/internal/bundled/libs). Skipping it keeps the
#      clone + ~2m15s Go build + rest under the ~5 min setup budget.
#   5. tsgolint patches (idempotent).
#   6. pnpm install --frozen-lockfile.
#   7. husky git hooks (commit-msg -> commitlint, pre-commit -> lint-staged);
#      ignoreScripts blocks husky's `prepare`, so wire core.hooksPath explicitly.
#   8. Go resolver binary -> bin/ts-runtypes.
#   9. ts-runtypes-devtools dist.
#  10. .env de-clobber - the dev .env's empty secret rows would shadow the
#      GHCR_PAT the web env injects (lib-env.sh sources .env with `set -a`).
#  11. GHCR login - the tsrt-website image is PRIVATE. NOTE: actually PULLING it
#      also needs the egress policy to allow the GHCR blob host
#      pkg-containers.githubusercontent.com; ghcr.io auth + manifest alone are
#      not enough. That is a network-policy matter, not this script's - here we
#      just establish the credential.
#
# It runs NO tests or smokes: the web setup step is time-boxed (~5 min), so it
# only installs + builds + logs in. `pnpm test` is the user's job afterwards; a
# green run means "ready to work", not "tests passed".
#
# BUMP SETUP_DATE below to force the web env to re-run this from a clean
# container (re-clone, rebuild, re-login) after an upstream change.
#
# Usage:  bash setup-claude-web.sh [--check]
# Exit:   0 ok | 1 a required step failed | 3 unsupported platform
# =============================================================================
