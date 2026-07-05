#!/usr/bin/env bash
# check.sh - report RunTypes env vars and verify what a task needs.
#
# Loads the repo-root .env (dev only) via registry.sh, then reads the env-var
# registry it defines (the single source of truth, mirrored by .env.sample).
# ASCII-only (macOS bash 3.2).
#
# Usage:
#   scripts/env/check.sh                 status of every known var
#   scripts/env/check.sh push-image      verify the vars `pnpm rt container push` needs
#   scripts/env/check.sh publish-npm     (info) where the npm publish secret lives
#   scripts/env/check.sh deploy-website  (info) where the Cloudflare secrets live
#   scripts/env/check.sh --create-env    create .env from .env.sample if missing
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RT_ENV_ROOT="$ROOT_DIR"
source "$SCRIPT_DIR/registry.sh"

GREEN='\033[0;32m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'

usage() {
  cat <<'USAGE'
Usage: scripts/env/check.sh [TASK | --create-env]
  (no args)        status of every known RunTypes env var
  push-image       verify the vars `pnpm rt container push` needs (GHCR token)
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
  printf "  %-30s %-4s %-8s %-14s %s\n" NAME SET SCOPE NEEDED-FOR DESCRIPTION
  printf "  %-30s %-4s %-8s %-14s %s\n" "------------------------------" "---" "--------" "-------------" "-----------"
  while IFS='|' read -r name scope task desc; do
    case "$name" in ''|\#*) continue ;; esac   # skip blank + #-comment section lines
    if is_set "$name"; then set="yes"; else set="-"; fi
    printf "  %-30s %-4s %-8s %-14s %s\n" "$name" "$set" "$scope" "$task" "$desc"
  done < <(rt_env_registry)
  printf "\n${DIM}dev vars are local knobs in .env (cp .env.sample .env). secret vars (GHCR_PAT,${NC}\n"
  printf "${DIM}NPM_TOKEN, CLOUDFLARE_*) go in .env to run a step from local, or are GitHub secrets in CI.${NC}\n"
  printf "${DIM}internal vars are set by the scripts themselves (container paths / plumbing) - do NOT put them in .env.${NC}\n"
}

# verify_task TASK -> 0 if its dev requirements are met, else 1 (prints guidance)
verify_task() {
  case "$1" in
    push-image)
      if is_set GHCR_PAT; then
        printf "${GREEN}ok${NC} push-image: GHCR token is configured.\n"; return 0
      fi
      printf "${RED}missing${NC} push-image needs GHCR_PAT (write:packages).\n"
      printf "   fix: scripts/env/check.sh --create-env   then set GHCR_PAT=... in .env\n"
      return 1 ;;
    publish-npm)
      if is_set NPM_TOKEN; then
        printf "${GREEN}ok${NC} publish-npm: NPM_TOKEN is set for a local publish. In CI it is the NPM_TOKEN secret.\n"; return 0
      fi
      printf "publish-npm: no NPM_TOKEN in .env. Set NPM_TOKEN to publish from local; in CI it is the NPM_TOKEN secret.\n"
      return 0 ;;
    deploy-website)
      local miss=""
      is_set CLOUDFLARE_API_TOKEN || miss="$miss CLOUDFLARE_API_TOKEN"
      is_set CLOUDFLARE_ACCOUNT_ID || miss="$miss CLOUDFLARE_ACCOUNT_ID"
      if [ -z "$miss" ]; then
        printf "${GREEN}ok${NC} deploy-website: Cloudflare creds are set for a local deploy. In CI they are GitHub secrets.\n"; return 0
      fi
      printf "${RED}missing${NC} deploy-website needs:$miss - set them in .env for a local deploy (GitHub secrets in CI).\n"
      return 1 ;;
    *) printf "${RED}unknown task '%s'${NC}\n" "$1"; usage; return 2 ;;
  esac
}

case "${1:-}" in
  -h|--help)    usage ;;
  --create-env) create_env ;;
  '')           print_status ;;
  *)            print_status; echo; verify_task "$1" ;;
esac
