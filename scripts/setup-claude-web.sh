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
# three things the web container needs and the skill alone does not do:
#
#   1. Node 24. The web image ships Node 20/21/22, but package.json requires
#      >= 24 and CI pins 24. We install Node 24 (via the image's nvm, or a
#      nodejs.org tarball fallback) and make it win on PATH for the harness's
#      NON-login shells - which do not source /etc/profile.d - by symlinking the
#      node24 binaries into the earliest writable PATH dir ($HOME/.local/bin).
#      pnpm is provided through corepack, pinned to the repo's packageManager.
#
#   2. GHCR login. The docs-website / benchmarks image
#      (ghcr.io/$GHCR_OWNER/tsrt-website) is PRIVATE, so `podman pull` 403s and
#      silently falls back to a slow local build unless we log in first. We run
#      `scripts/podman-website.sh login`, which uses GHCR_PAT (already provided
#      to the web environment). Requires the environment's network policy to
#      allow ghcr.io (the "trusted" egress policy does).
#
#   3. A fast readiness check (`bin/ts-runtypes --version`) so a green run means
#      the resolver binary built and runs. The heavy container smokes (boot the
#      website, vite-build the benchmark - the same gates CI runs) are opt-in via
#      --with-container-smoke, since they pull the image + run a container and
#      would add minutes to every session boot. `pnpm test` is the full gate.
#      (We intentionally skip `pnpm run ts-runtypes:smoke`: it is bit-rotted on
#      main - imports a dist/rewrite.js removed in a refactor - and CI never runs
#      it, so it always fails regardless of setup.)
#
# Usage:
#   bash scripts/setup-claude-web.sh                       # full autonomous setup
#   bash scripts/setup-claude-web.sh --check               # report status only
#   bash scripts/setup-claude-web.sh --with-container-smoke # also run website+bench smokes
#
# Exit codes:
#   0  ok
#   1  a required step failed
#   3  not a supported platform (this script is Linux/claude-web only)
# -----------------------------------------------------------------------------
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_SETUP="$REPO_DIR/.claude/skills/ts-runtypes-setup/setup.sh"

NODE_MAJOR_MIN=24
# pnpm version the repo pins via package.json "packageManager" (fallback if unparsable).
PNPM_PIN="$(sed -n 's/.*"packageManager": *"pnpm@\([0-9.]*\)".*/\1/p' "$REPO_DIR/package.json" 2>/dev/null | head -1)"
[ -n "$PNPM_PIN" ] || PNPM_PIN="11.8.0"

CHECK_ONLY=0
WITH_CONTAINER_SMOKE=0
for arg in "$@"; do
  case "$arg" in
    --check)                CHECK_ONLY=1 ;;
    --with-container-smoke) WITH_CONTAINER_SMOKE=1 ;;
    -h|--help)              sed -n '2,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
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
# 2. Shared host bootstrap: delegate to the setup skill (podman, submodules,
#    patches, pnpm install, Go binary, devtools dist). Single source of truth.
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
# 3. GHCR login so the PRIVATE tsrt-website image can be pulled instead of built.
# -----------------------------------------------------------------------------
ghcr_login() {
  bold "GHCR login (private image ghcr.io/${GHCR_OWNER:-mionkit}/tsrt-website)"
  if [ "$CHECK_ONLY" = 1 ]; then
    if [ -n "${GHCR_PAT:-}" ]; then ok "GHCR_PAT present - login would run"
    else warn "GHCR_PAT not set - website/bench smokes would fall back to a local image build"; fi
    return 0
  fi
  if [ -z "${GHCR_PAT:-}" ]; then
    warn "GHCR_PAT not set - skipping login; website/bench smokes will build the image locally"
    return 0
  fi
  if bash "$REPO_DIR/scripts/podman-website.sh" login; then
    ok "logged in to GHCR"
  else
    warn "GHCR login failed - website/bench smokes will fall back to a local image build"
  fi
}

# -----------------------------------------------------------------------------
# 4. Smokes.
# -----------------------------------------------------------------------------
run_smokes() {
  [ "$CHECK_ONLY" = 1 ] && return 0
  # Fast readiness check: the resolver binary built and runs. (We deliberately do
  # NOT run `pnpm run ts-runtypes:smoke` here - that dev smoke is bit-rotted on
  # main: it imports dist/rewrite.js, a module removed in a refactor, and CI does
  # not run it so the rot went unnoticed. The real gates are `pnpm test` and the
  # container smokes below, both of which we point the user at.)
  bold "Wiring check (resolver binary runs)"
  if ( cd "$REPO_DIR" && ./bin/ts-runtypes --version ); then ok "resolver binary OK"
  else err "resolver binary did not run"; FAILED=1; fi

  if [ "$WITH_CONTAINER_SMOKE" = 1 ]; then
    bold "Container smokes (docs website + benchmarks)"
    ( cd "$REPO_DIR" && pnpm run website:smoke ) && ok "website:smoke passed" || { err "website:smoke failed"; FAILED=1; }
    ( cd "$REPO_DIR" && pnpm run bench:smoke )   && ok "bench:smoke passed"   || { err "bench:smoke failed";   FAILED=1; }
  fi
}

main() {
  bold "RunTypes - Claude Code on the web setup$([ "$CHECK_ONLY" = 1 ] && echo '  [check-only]')"
  case "$(uname -s)" in
    Linux) ;;
    *) err "This script targets Claude Code on the web (Linux). For local hosts use the ts-runtypes-setup skill."; exit 3 ;;
  esac
  [ "$(id -u)" = 0 ] || warn "not running as root - podman/Node install steps may need sudo"

  provision_node24
  run_core_bootstrap
  neutralize_placeholder_env
  ghcr_login
  run_smokes

  bold "Next steps (from the repo root)"
  echo "  pnpm test                 # full JS suite (spawns the Go binary)"
  echo "  pnpm run website:dev      # docs site -> http://localhost:3000"
  echo "  pnpm run bench            # full validation benchmark"
  echo "  bash scripts/setup-claude-web.sh --with-container-smoke   # verify the containers too"

  if [ "$FAILED" = 0 ]; then bold "Setup OK."; else bold "Setup incomplete - see ERR above."; exit 1; fi
}

main "$@"
