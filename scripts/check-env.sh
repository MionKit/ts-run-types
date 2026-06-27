#!/usr/bin/env bash
# check-env.sh - report RunTypes env vars and verify what a task needs.
#
# Loads the repo-root .env (dev only) via lib-env.sh, then reads the env-var
# registry it defines (the single source of truth, mirrored by .env.sample).
# ASCII-only (macOS bash 3.2).
#
# Usage:
#   scripts/check-env.sh                 status of every known var
#   scripts/check-env.sh push-image      verify the vars `podman-website:push` needs
#   scripts/check-env.sh publish-npm     (info) where the npm publish secret lives
#   scripts/check-env.sh deploy-website  (info) where the Cloudflare secrets live
#   scripts/check-env.sh --create-env    create .env from .env.sample if missing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
RT_ENV_ROOT="$ROOT_DIR"
source "$SCRIPT_DIR/lib-env.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'

usage() {
  cat <<'USAGE'
Usage: scripts/check-env.sh [TASK | --create-env]
  (no args)        status of every known RunTypes env var
  push-image       verify the vars `pnpm run podman-website:push` needs (GHCR token)
  publish-npm      info: the npm publish secret lives in GitHub, not .env
  deploy-website   info: the Cloudflare secrets live in GitHub, not .env
  --create-env     create .env from .env.sample if it does not exist
USAGE
}

# is_set NAME -> 0 if the var is set and non-empty (bash 3.2 safe indirection)
is_set() { local _v; eval "_v=\${$1:-}"; [ -n "$_v" ]; }

create_env() {
  if [ -f "$ROOT_DIR/.env" ]; then
    echo "$ROOT_DIR/.env already exists - not overwriting."
    return 0
  fi
  cp "$ROOT_DIR/.env.sample" "$ROOT_DIR/.env"
  printf "${GREEN}created .env${NC} from .env.sample - fill in the values you need (e.g. GHCR_PAT).\n"
}

print_status() {
  local have_env ci_state name scope task desc set
  [ -f "$ROOT_DIR/.env" ] && have_env="yes" || have_env="no"
  [ -n "${CI:-}" ] && ci_state="yes" || ci_state="no"
  printf "RunTypes env vars   (.env present: %s   CI: %s)\n\n" "$have_env" "$ci_state"
  printf "  %-24s %-4s %-5s %-14s %s\n" NAME SET SCOPE NEEDED-FOR DESCRIPTION
  printf "  %-24s %-4s %-5s %-14s %s\n" "------------------------" "---" "-----" "-------------" "-----------"
  while IFS='|' read -r name scope task desc; do
    [ -z "$name" ] && continue
    if is_set "$name"; then set="yes"; else set="-"; fi
    printf "  %-24s %-4s %-5s %-14s %s\n" "$name" "$set" "$scope" "$task" "$desc"
  done < <(rt_env_registry)
  printf "\n${DIM}dev vars go in .env (cp .env.sample .env); ci vars are GitHub repo/Environment secrets.${NC}\n"
}

# verify_task TASK -> 0 if its dev requirements are met, else 1 (prints guidance)
verify_task() {
  case "$1" in
    push-image)
      if is_set GHCR_PAT || { is_set GHCR_PAT_FILE && [ -f "${GHCR_PAT_FILE}" ]; }; then
        printf "${GREEN}ok${NC} push-image: GHCR token is configured.\n"; return 0
      fi
      printf "${RED}missing${NC} push-image needs GHCR_PAT (write:packages), or GHCR_PAT_FILE pointing at a token file.\n"
      printf "   fix: scripts/check-env.sh --create-env   then set GHCR_PAT=... in .env\n"
      return 1 ;;
    publish-npm)
      printf "publish-npm runs in CI: set the NPM_TOKEN secret in GitHub. Locally, use \`npm login\`.\n"; return 0 ;;
    deploy-website)
      printf "deploy-website runs in CI: set CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID secrets in GitHub.\n"; return 0 ;;
    *) printf "${RED}unknown task '%s'${NC}\n" "$1"; usage; return 2 ;;
  esac
}

case "${1:-}" in
  -h|--help)    usage ;;
  --create-env) create_env ;;
  '')           print_status ;;
  *)            print_status; echo; verify_task "$1" ;;
esac
