#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# setup-claude-web.sh - zero-intervention bootstrap for RunTypes on Claude Code
# on the web (the managed, ephemeral Linux container that backs a web session).
#
# Claude Code on the web reclaims its container between sessions, so the repo is
# cloned fresh every time and NOTHING built is persisted. This script lands that
# fresh container in a runnable state end-to-end, without prompts, so `pnpm test`
# / `pnpm run website:dev` / `pnpm run bench` all work.
#
# It is a thin CLAUDE-WEB wrapper around the OS-agnostic host bootstrap in
# .claude/skills/ts-runtypes-setup/setup.sh (the single source of truth for
# podman install, submodules, tsgolint patches, `pnpm install`, the Go resolver
# binary, and the runtypes-devtools dist). On top of that shared core it adds the
# things the web container needs and the skill alone does not do:
#
#   1. Node 24. The web image ships Node 20/21/22, but package.json requires
#      >= 24 and CI pins 24. We install Node 24 (via the image's nvm, or a
#      nodejs.org tarball fallback) and make it win on PATH for the harness's
#      NON-login shells - which do not source /etc/profile.d - by symlinking the
#      node24 binaries into the earliest writable PATH dir ($HOME/.local/bin).
#      pnpm is provided through corepack, pinned to the repo's packageManager.
#
#   1b. Light submodules. We init tsgolint + typescript-go but skip the 620MB
#      nested microsoft/TypeScript corpus (only typescript-go's test runner uses
#      it, never our build), pre-empting the skill's `--recursive` clone. Without
#      this the clone alone pushes the ~2m15s Go build + rest past the ~5 min
#      setup budget; with it the whole run lands around ~4 min.
#
#   2. GHCR login. The docs-website / benchmarks image
#      (ghcr.io/$GHCR_OWNER/tsrt-website) is PRIVATE, so `podman pull` 403s and
#      silently falls back to a slow local build unless we log in first. We run
#      `scripts/podman-website.sh login`, which uses GHCR_PAT (already provided
#      to the web environment). NOTE: actually PULLING the image also needs the
#      egress policy to allow the GHCR blob host pkg-containers.githubusercontent.com
#      (ghcr.io auth + manifest alone are not enough) - a network-policy matter,
#      not this script's; here we just establish the credential.
#
#   3. Placeholder .env de-clobber, so the empty secret rows the skill writes into
#      .env do not shadow the real GHCR_PAT the web environment injects.
#
# It deliberately runs NO tests or smokes. This script is meant to be the web
# environment's setup step, which is time-boxed (~5 min), so it only installs +
# builds + logs in - it never runs `pnpm test`, `ts-runtypes:smoke`, or the
# website/bench container smokes. Verifying the repo is the user's job afterwards
# (`pnpm test`); a green setup means "ready to work", not "tests passed".
#
# Usage:
#   bash scripts/setup-claude-web.sh            # full autonomous setup
#   bash scripts/setup-claude-web.sh --check    # report status only, install/build nothing
#
# Exit codes:
#   0  ok
#   1  a required step failed
#   3  not a supported platform (this script is Linux/claude-web only)
# -----------------------------------------------------------------------------
set -uo pipefail

# ---------------------------------------------------------------------------
# Setup revision - BUMP THIS DATE to force a fresh setup run.
# Claude Code on the web re-runs its setup step when the script content changes,
# so editing this date is enough to invalidate a cached container and re-do the
# full bootstrap (re-pull the GHCR image, re-clone the submodules, rebuild the
# binary, etc.) after an upstream change. Format: YYYY-MM-DD.
# ---------------------------------------------------------------------------
SETUP_DATE="2026-07-02"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_SETUP="$REPO_DIR/.claude/skills/ts-runtypes-setup/setup.sh"

NODE_MAJOR_MIN=24
# pnpm version the repo pins via package.json "packageManager" (fallback if unparsable).
PNPM_PIN="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\)".*/\1/p' "$REPO_DIR/package.json" 2>/dev/null | head -1)"
[ -n "$PNPM_PIN" ] || PNPM_PIN="11.8.0"

CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --check)   CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,55p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $arg (try --help)" >&2; exit 1 ;;
  esac
done

FAILED=0
bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m  %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m   %s\n' "$*"; }
err()  { printf '  \033[31mERR\033[0m %s\n' "$*" >&2; }

# node major version currently resolvable on PATH (0 if node absent).
node_major() { command -v node >/dev/null 2>&1 && node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

# -----------------------------------------------------------------------------
# 1. Node 24. Install it (nvm first, nodejs.org tarball fallback), then make it
#    win on PATH for the harness's non-login shells via $HOME/.local/bin symlinks.
# -----------------------------------------------------------------------------
provision_node24() {
  bold "Node $NODE_MAJOR_MIN (repo requires >= $NODE_MAJOR_MIN; CI pins $NODE_MAJOR_MIN)"

  local n24root=""
  if [ "$(node_major)" -ge "$NODE_MAJOR_MIN" ] && [ -x "/opt/node24/bin/node" ]; then
    ok "Node $(node --version) already active"
  elif [ "$CHECK_ONLY" = 1 ]; then
    warn "Node $NODE_MAJOR_MIN not active (found major $(node_major)) - re-run without --check to install"
    return 0
  else
    # (a) prefer the image's nvm
    local nvm_dir="${NVM_DIR:-}"
    for cand in "$nvm_dir" /opt/nvm "$HOME/.nvm"; do
      [ -n "$cand" ] && [ -s "$cand/nvm.sh" ] && { nvm_dir="$cand"; break; }
    done
    if [ -n "$nvm_dir" ] && [ -s "$nvm_dir/nvm.sh" ]; then
      bold "Installing Node $NODE_MAJOR_MIN via nvm ($nvm_dir)"
      # shellcheck disable=SC1091
      export NVM_DIR="$nvm_dir"; . "$nvm_dir/nvm.sh"
      if nvm install "$NODE_MAJOR_MIN" >/dev/null 2>&1; then
        n24root="$(dirname "$(dirname "$(nvm which "$NODE_MAJOR_MIN" 2>/dev/null)")")"
      fi
    fi
    # (b) fallback: nodejs.org tarball
    if [ -z "$n24root" ] || [ ! -x "$n24root/bin/node" ]; then
      warn "nvm unavailable or failed - falling back to a nodejs.org tarball"
      local goarch; case "$(uname -m)" in
        x86_64) goarch=x64 ;; aarch64|arm64) goarch=arm64 ;;
        *) err "unsupported arch $(uname -m) for Node auto-install"; FAILED=1; return 1 ;;
      esac
      local ver; ver="$(curl -fsSL "https://nodejs.org/dist/index.json" 2>/dev/null \
        | sed -n 's/.*"version":"v\('"$NODE_MAJOR_MIN"'\.[0-9.]*\)".*/\1/p' | head -1)"
      [ -n "$ver" ] || { err "could not resolve a Node $NODE_MAJOR_MIN release from nodejs.org"; FAILED=1; return 1; }
      local tarball="node-v${ver}-linux-${goarch}.tar.xz"
      curl -fsSL "https://nodejs.org/dist/v${ver}/${tarball}" -o "/tmp/${tarball}" \
        || { err "Node tarball download failed"; FAILED=1; return 1; }
      rm -rf /opt/node24-dist && mkdir -p /opt/node24-dist
      tar -C /opt/node24-dist --strip-components=1 -xf "/tmp/${tarball}" \
        || { err "Node tarball extract failed"; FAILED=1; return 1; }
      n24root="/opt/node24-dist"
    fi
  fi

  # Ensure the stable /opt/node24 symlink + PATH wiring even on the "already
  # active" path, so a re-run repairs a half-set-up container.
  if [ -n "$n24root" ]; then
    ln -sfn "$n24root" /opt/node24 || { err "could not create /opt/node24 symlink"; FAILED=1; return 1; }
  fi
  [ -x "/opt/node24/bin/node" ] || { [ "$CHECK_ONLY" = 1 ] && return 0; err "/opt/node24/bin/node missing after install"; FAILED=1; return 1; }

  # pnpm via corepack, pinned to the repo's packageManager. Run from the repo
  # root so corepack reads the ROOT package.json (a submodule pins npm).
  /opt/node24/bin/corepack enable >/dev/null 2>&1 || true
  ( cd "$REPO_DIR" && /opt/node24/bin/corepack prepare "pnpm@$PNPM_PIN" --activate >/dev/null 2>&1 ) \
    || warn "corepack could not pre-activate pnpm@$PNPM_PIN (will resolve on first use)"

  # The harness runs NON-login shells that inherit PATH from the image and do
  # NOT source /etc/profile.d, so a profile.d file alone would not take effect.
  # $HOME/.local/bin is first on that inherited PATH (ahead of /opt/node<xx>),
  # so symlinking the node24 binaries there makes `node`/`pnpm` resolve to 24.
  local localbin="$HOME/.local/bin"; mkdir -p "$localbin"
  local exe
  for exe in /opt/node24/bin/*; do ln -sfn "$exe" "$localbin/$(basename "$exe")"; done
  case ":$PATH:" in *":$localbin:"*) : ;; *) warn "$localbin is not on PATH - add it ahead of /opt/node<xx>/bin" ;; esac

  # Belt-and-suspenders for LOGIN shells (e.g. an interactive terminal).
  if [ -w /etc/profile.d ] || [ "$(id -u)" = 0 ]; then
    cat > /etc/profile.d/zz-node24.sh <<EOF
# ts-runtypes claude-web setup: prefer Node $NODE_MAJOR_MIN (repo requires >= $NODE_MAJOR_MIN; CI pins $NODE_MAJOR_MIN)
export NVM_DIR="${NVM_DIR:-/opt/nvm}"
export PATH="\$HOME/.local/bin:/opt/node24/bin:\$PATH"
EOF
    chmod 0644 /etc/profile.d/zz-node24.sh 2>/dev/null || true
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
# 1b. Submodules (light) - init tsgolint + typescript-go but SKIP the 620MB
#     nested _submodules/TypeScript (microsoft/TypeScript). That corpus is only
#     used by typescript-go's OWN test runner (internal/testrunner), never by our
#     `go build ./cmd/ts-runtypes`, so cloning it just burns setup time budget.
#     Running this BEFORE the shared bootstrap makes its ensure_submodules see the
#     modules already present and skip its own `--recursive` clone (which WOULD
#     pull the deep submodule). Keeps the injected-git-proxy bypass as a fallback.
# -----------------------------------------------------------------------------
provision_submodules_light() {
  bold "Submodules (tsgolint + typescript-go; skipping the 620MB TypeScript test corpus)"
  local tsgolint="$REPO_DIR/third_party/tsgolint"
  local tsgo="$tsgolint/typescript-go"
  if [ -f "$tsgolint/go.mod" ] && [ -e "$tsgo/.git" ]; then
    ok "submodules present"
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    warn "submodules not initialized - re-run without --check"
    return 0
  fi
  # Non-recursive: tsgolint, then typescript-go inside it. No --recursive, so the
  # nested _submodules/TypeScript is never fetched.
  _light_submodule_init() {
    ( cd "$REPO_DIR" && git submodule update --init third_party/tsgolint ) &&
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
# 2. Shared host bootstrap: delegate to the setup skill (podman, patches, pnpm
#    install, Go binary, devtools dist). Single source of truth. Submodules are
#    already present from step 1b, so the skill's recursive clone is skipped.
# -----------------------------------------------------------------------------
run_core_bootstrap() {
  bold "Host bootstrap (delegating to the ts-runtypes-setup skill)"
  [ -f "$SKILL_SETUP" ] || { err "skill setup.sh not found at $SKILL_SETUP"; FAILED=1; return 1; }
  local args=(); [ "$CHECK_ONLY" = 1 ] && args+=(--check)
  if bash "$SKILL_SETUP" "${args[@]}"; then
    ok "core bootstrap complete"
  else
    err "core bootstrap (skill setup.sh) reported failure"
    FAILED=1
  fi
}

# -----------------------------------------------------------------------------
# 2b. Keep the placeholder .env from shadowing real environment secrets.
#     The shared bootstrap creates .env from .env.sample, whose secret rows are
#     empty (GHCR_PAT= etc.). lib-env.sh sources .env with `set -a`, so an empty
#     assignment OVERWRITES the value the web environment injects - breaking GHCR
#     login. On the web the environment is the source of truth for secrets, so we
#     strip the empty placeholder lines whenever the process env already has them.
# -----------------------------------------------------------------------------
neutralize_placeholder_env() {
  local envfile="$REPO_DIR/.env"
  [ -f "$envfile" ] || return 0
  [ "$CHECK_ONLY" = 1 ] && return 0
  local var stripped=0
  for var in GHCR_PAT NPM_TOKEN CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_PAGES_PROJECT; do
    # Only strip an EMPTY placeholder, and only when the environment supplies a value.
    if [ -n "${!var:-}" ] && grep -qE "^${var}=$" "$envfile"; then
      sed -i -E "/^${var}=$/d" "$envfile"
      stripped=$((stripped + 1))
    fi
  done
  [ "$stripped" -gt 0 ] && ok "stripped $stripped empty placeholder secret line(s) from .env (env values win)" || ok ".env does not shadow environment secrets"
}

# -----------------------------------------------------------------------------
# 3. GHCR login so a later `pnpm run website:dev` / `pnpm run bench` can PULL the
#    private tsrt-website image instead of rebuilding it. Login is registry auth
#    only - it does not pull anything, so it stays within the setup time budget.
#    NOTE: pulling the image ALSO needs the egress policy to allow the GHCR blob
#    host (pkg-containers.githubusercontent.com); auth + manifest via ghcr.io are
#    not sufficient on their own. That is a network-policy concern, not this
#    script's - here we just establish the credential.
# -----------------------------------------------------------------------------
ghcr_login() {
  bold "GHCR login (private image ghcr.io/${GHCR_OWNER:-mionkit}/tsrt-website)"
  if [ "$CHECK_ONLY" = 1 ]; then
    if [ -n "${GHCR_PAT:-}" ]; then ok "GHCR_PAT present - login would run"
    else warn "GHCR_PAT not set - container image would have to be built locally later"; fi
    return 0
  fi
  if [ -z "${GHCR_PAT:-}" ]; then
    warn "GHCR_PAT not set - skipping login (containers would build locally on demand)"
    return 0
  fi
  if bash "$REPO_DIR/scripts/podman-website.sh" login; then
    ok "logged in to GHCR"
  else
    warn "GHCR login failed - containers would build locally on demand"
  fi
}

main() {
  bold "RunTypes - Claude Code on the web setup (rev $SETUP_DATE)$([ "$CHECK_ONLY" = 1 ] && echo '  [check-only]')"
  case "$(uname -s)" in
    Linux) ;;
    *) err "This script targets Claude Code on the web (Linux). For local hosts use the ts-runtypes-setup skill."; exit 3 ;;
  esac
  [ "$(id -u)" = 0 ] || warn "not running as root - podman/Node install steps may need sudo"

  provision_node24
  provision_submodules_light
  run_core_bootstrap
  neutralize_placeholder_env
  ghcr_login

  bold "Ready. Verify / work from the repo root (this setup ran no tests):"
  echo "  pnpm test                 # full JS suite (spawns the Go binary)"
  echo "  pnpm run website:dev      # docs site -> http://localhost:3000"
  echo "  pnpm run bench            # full validation benchmark"

  if [ "$FAILED" = 0 ]; then bold "Setup OK."; else bold "Setup incomplete - see ERR above."; exit 1; fi
}

main "$@"
