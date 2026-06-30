# lib-env.sh - the ONE place that loads the repo-root .env and defines the env-var
# registry. Sourced first by every script that consumes a user-set env var
# (lib-container.sh, lib-ghcr.sh, website-publish.sh) and by check-env.sh.
#
# .env is DEV-ONLY: it is git-ignored (so it is never in a CI checkout), and we also
# skip loading it when CI is set - belt and suspenders, so a stray .env can never
# affect GitHub Actions. Loaded once (guarded); `set -a` exports each assignment;
# only uncommented KEY=value lines apply, and a missing .env is a silent no-op.
# ASCII-only by policy (macOS bash 3.2 mis-parses UTF-8 in variable expansions).

# Repo root (scripts/..), unless a caller already set RT_ENV_ROOT.
if [ -z "${RT_ENV_ROOT:-}" ]; then
  RT_ENV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

if [ -z "${RT_ENV_LOADED:-}" ]; then
  RT_ENV_LOADED=1
  if [ -z "${CI:-}" ] && [ -f "$RT_ENV_ROOT/.env" ]; then
    set -a
    . "$RT_ENV_ROOT/.env"
    set +a
  fi
fi

# The registry: single source of truth for check-env.sh (mirror of .env.sample).
# One row per var: NAME|SCOPE|TASK|DESCRIPTION
#   SCOPE  dev = set locally in .env        |  ci = GitHub repo/Environment secret
#   TASK   the operation that needs it      |  "-" = optional knob (has a default)
rt_env_registry() {
  cat <<'REG'
GHCR_PAT|dev|push-image|GitHub PAT (write:packages) to push the shared image (or set GHCR_PAT_FILE)
GHCR_PAT_FILE|dev|push-image|Path to a file holding only the GHCR token (alternative to GHCR_PAT)
GHCR_OWNER|dev|-|GHCR namespace (default mionkit)
GHCR_USER|dev|-|GHCR login user (cosmetic; the PAT authenticates)
RT_WEBSITE_USE_LOCAL|dev|-|Build the shared image locally instead of pulling from GHCR
RT_BENCH_USE_LOCAL|dev|-|Build the shared image locally for benchmark runs
RT_BENCH_NO_TYPIA|dev|-|Skip the typia competitor (its native plugin build)
RT_BENCH_QUICK|dev|-|Fast/preview benchmark numbers (noisy)
NPM_TOKEN|ci|publish-npm|npm automation token (CI secret; local publish uses npm login)
CLOUDFLARE_API_TOKEN|ci|deploy-website|Cloudflare Pages: Edit API token (CI secret)
CLOUDFLARE_ACCOUNT_ID|ci|deploy-website|Cloudflare account id (CI secret)
REG
}
