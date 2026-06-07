#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup.sh — ts-run-types setup for the containerized apps (docs website +
# benchmarks). Checks EACH required dependency and installs the missing ones,
# one at a time. Supported: Linux, macOS. Any other OS prints a "not ready"
# message and exits.
#
#   bash .claude/skills/ts-run-types-setup/setup.sh           # check + install missing
#   bash .claude/skills/ts-run-types-setup/setup.sh --check    # check only, never install
#
# Supported versions (kept in sync with CLAUDE.md → "Containerized apps"):
#   podman ≥ 4.0     both apps (container runtime)
#   Node   ≥ 24      benchmarks host build (root package.json engines)
#   pnpm   ≥ 11      monorepo workspace policies (packageManager pnpm@11.1.1)
#   Go     ≥ 1.26    benchmarks resolver binary (go.mod)
# Only podman is required for the WEBSITE; the benchmarks additionally need
# Node + pnpm + Go for `pnpm run bench:prep`.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

PODMAN_MIN=4.0
NODE_MIN=24
PNPM_MIN=11
GO_MIN=1.26
GO_INSTALL_VERSION=1.26.0 # used only when Go is absent and must be downloaded

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }

OS="$(uname -s)"
ARCH="$(uname -m)"
SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"
FAILED=0

# true if $1 >= $2 (dotted versions)
version_ge() { [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]; }

pkg_install() { # $@ = packages, via the host's package manager
  if command -v apt-get >/dev/null 2>&1; then $SUDO apt-get update -qq && $SUDO apt-get install -y -qq "$@"
  elif command -v dnf >/dev/null 2>&1; then $SUDO dnf install -y "$@"
  elif command -v pacman >/dev/null 2>&1; then $SUDO pacman -Sy --noconfirm "$@"
  elif command -v zypper >/dev/null 2>&1; then $SUDO zypper install -y "$@"
  else return 1; fi
}

# ── per-dependency install routines ──────────────────────────────────────────

install_podman() {
  case "$OS" in
    Linux) pkg_install podman ;;
    Darwin)
      command -v brew >/dev/null 2>&1 || { err "Homebrew required (https://brew.sh)"; return 1; }
      brew install podman
      podman machine list --format '{{.Name}}' 2>/dev/null | grep -q . || podman machine init
      podman machine list --format '{{.Running}}' 2>/dev/null | grep -qi true || podman machine start
      ;;
  esac
}
install_node() {
  case "$OS" in
    Linux) pkg_install nodejs npm || return 1 ;;
    Darwin) brew install node ;;
  esac
}
install_pnpm() {
  if command -v corepack >/dev/null 2>&1; then corepack enable && corepack prepare pnpm@latest --activate
  elif command -v npm >/dev/null 2>&1; then $SUDO npm install -g pnpm
  else return 1; fi
}
install_go() {
  case "$OS" in
    Darwin) brew install go ;;
    Linux)
      local goarch; case "$ARCH" in x86_64) goarch=amd64 ;; aarch64 | arm64) goarch=arm64 ;; *) goarch="" ;; esac
      [ -z "$goarch" ] && { err "unsupported arch $ARCH for Go auto-install"; return 1; }
      local tgz="go${GO_INSTALL_VERSION}.linux-${goarch}.tar.gz"
      curl -fsSL "https://go.dev/dl/${tgz}" -o "/tmp/${tgz}" || return 1
      $SUDO rm -rf /usr/local/go && $SUDO tar -C /usr/local -xzf "/tmp/${tgz}"
      export PATH="/usr/local/go/bin:$PATH"
      warn "Go installed to /usr/local/go — add /usr/local/go/bin to your PATH."
      ;;
  esac
}

# check_dep <name> <min> <version-cmd> <install-fn> <required:0|1>
check_dep() {
  local name="$1" min="$2" vcmd="$3" install="$4" required="$5" cur
  if command -v "$name" >/dev/null 2>&1; then
    cur="$(eval "$vcmd" 2>/dev/null)"
    if [ -z "$cur" ]; then ok "$name present (version unknown)"; return 0; fi
    if version_ge "$cur" "$min"; then ok "$name $cur (≥ $min)"; else warn "$name $cur present but repo targets ≥ $min — upgrade recommended"; fi
    return 0
  fi
  if [ "$CHECK_ONLY" = 1 ]; then
    if [ "$required" = 1 ]; then err "$name missing (required); re-run without --check to install"; FAILED=1
    else warn "$name missing (needed for benchmarks); re-run without --check to install"; fi
    return 0
  fi
  bold "Installing $name…"
  if "$install" && command -v "$name" >/dev/null 2>&1; then
    cur="$(eval "$vcmd" 2>/dev/null)"; ok "$name installed (${cur:-ok})"
    version_ge "${cur:-0}" "$min" || warn "$name ${cur:-?} is below the supported ≥ $min"
  else
    if [ "$required" = 1 ]; then err "failed to install $name (required)"; FAILED=1
    else warn "failed to install $name (needed only for benchmarks)"; fi
  fi
}

main() {
  case "$OS" in
    Linux | Darwin) ;;
    *)
      bold "ts-run-types setup"
      err "This skill is not ready for '$OS'. Supported platforms: Linux and macOS."
      err "Install podman/Node/pnpm/Go manually, then use scripts/website.sh & scripts/benchmarks.sh."
      exit 3
      ;;
  esac

  bold "ts-run-types setup — $OS ($ARCH)$([ "$CHECK_ONLY" = 1 ] && echo '  [check-only]')"

  bold "Required for the docs website + benchmarks"
  check_dep podman "$PODMAN_MIN" "podman --version | awk '{print \$3}'" install_podman 1

  bold "Required for the benchmarks (host build via 'pnpm run bench:prep')"
  check_dep node "$NODE_MIN" "node --version | tr -d v" install_node 0
  check_dep pnpm "$PNPM_MIN" "pnpm --version" install_pnpm 0
  check_dep go "$GO_MIN" "go version | awk '{print \$3}' | sed 's/^go//'" install_go 0

  # verify the container engine actually runs (not just the binary)
  if command -v podman >/dev/null 2>&1; then
    if podman info >/dev/null 2>&1; then ok "podman engine reachable (podman info)"
    elif [ "$OS" = Darwin ]; then warn "podman engine not reachable — run: podman machine start"
    else warn "podman engine not reachable (podman info failed)"; fi
  fi

  bold "Next steps (from the repo root)"
  echo "  pnpm run website:build-image && pnpm run website:dev   # docs site → http://localhost:3000"
  echo "  pnpm run bench:prep && pnpm run bench                  # validation benchmark"
  echo "  pnpm run bench:typecost                                # type-checking-cost benchmark"
  if [ "$OS" = Darwin ]; then echo "  (macOS: WEBSITE_POLL=1 pnpm run website:dev  for reliable hot reload)"; fi

  [ "$FAILED" = 0 ] && bold "Setup OK." || { bold "Setup incomplete — see ✗ above."; exit 1; }
}

main "$@"
