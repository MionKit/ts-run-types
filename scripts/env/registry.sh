# registry.sh - the ONE place that loads the repo-root .env and defines the env-var
# registry. Sourced first by every script that consumes a user-set env var
# (lib.sh, ghcr.sh, build.sh) and by check.sh.
#
# .env is DEV-ONLY: it is git-ignored (so it is never in a CI checkout), and we also
# skip loading it when CI is set - belt and suspenders, so a stray .env can never
# affect GitHub Actions. Loaded once (guarded); `set -a` exports each assignment;
# only uncommented KEY=value lines apply, and a missing .env is a silent no-op.
# ASCII-only by policy (macOS bash 3.2 mis-parses UTF-8 in variable expansions).

# Repo root (scripts/..), unless a caller already set RT_ENV_ROOT.
if [ -z "${RT_ENV_ROOT:-}" ]; then
  RT_ENV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

if [ -z "${RT_ENV_LOADED:-}" ]; then
  RT_ENV_LOADED=1
  if [ -z "${CI:-}" ] && [ -f "$RT_ENV_ROOT/.env" ]; then
    set -a
    . "$RT_ENV_ROOT/.env"
    set +a
  fi
fi

# The registry: the SINGLE SOURCE OF TRUTH for every env var the project consumes
# (scripts, containers, CI, tests). check.sh reports it; .env.sample mirrors the
# user-settable rows only (dev + secret). Every NEW env var MUST be added here.
# One row per var: NAME|SCOPE|TASK|DESCRIPTION  (blank + #-comment lines are ignored)
#   SCOPE  dev      = local knob with a default (set in .env to override)
#          secret   = a credential: set in .env to run the step from LOCAL, or as a
#                     GitHub repo/Environment secret when the step runs in CI
#          internal = set by the scripts themselves (container paths / plumbing);
#                     documented for reference, NEVER put in .env (setting it breaks runs)
#   TASK   the operation that needs it      |  "-" = optional knob (has a default)
# Runtypes-owned vars are prefixed RT_; external/standard names (GHCR_*, NPM_TOKEN,
# CLOUDFLARE_*, CI) keep their conventional spelling so the tools that read them work.
rt_env_registry() {
  cat <<'REG'
# --- secrets (credentials: .env locally, GitHub secrets in CI) ---
GHCR_PAT|secret|push-image|GitHub PAT (write:packages) to push the shared image; set in .env
NPM_TOKEN|secret|publish-npm|npm token to publish from local (set in .env); the NPM_TOKEN secret in CI
CLOUDFLARE_API_TOKEN|secret|deploy-website|Cloudflare Pages: Edit token; .env for a local deploy, a GitHub secret in CI
CLOUDFLARE_ACCOUNT_ID|secret|deploy-website|Cloudflare account id; .env for a local deploy, a GitHub secret in CI

# --- deploy config (non-secret) ---
CLOUDFLARE_PAGES_PROJECT|dev|deploy-website|Cloudflare Pages project name (default runtypes); .env for a local deploy, set in publish.yml for CI

# --- GHCR coordinates (defaults already target this repo) ---
GHCR_OWNER|dev|-|GHCR namespace (default mionkit)
GHCR_USER|dev|-|GHCR login user (cosmetic; the PAT authenticates; default M-jerez)
GHCR_REGISTRY|dev|-|GHCR registry host (default ghcr.io)

# --- image source toggles (opt out of the GHCR pull; build/use a local image) ---
RT_WEBSITE_USE_LOCAL|dev|-|Build the shared image locally instead of pulling from GHCR
RT_BENCH_USE_LOCAL|dev|-|Build the shared image locally for benchmark runs

# --- docs website knobs (scripts/website/site.sh, scripts/container/image.sh) ---
RT_WEBSITE_ENGINE|dev|-|Container engine (default podman)
RT_WEBSITE_IMAGE|dev|-|Local image tag (default tsrt-website:dev)
RT_WEBSITE_CONTAINER|dev|-|Container name prefix (default tsrt-website)
RT_WEBSITE_PORT|dev|-|Dev server host port (default 3000)
RT_WEBSITE_AGENT_PORT|dev|-|Agent-mode host port (default 3100)
RT_WEBSITE_AGENT_IDLE_SECONDS|dev|-|Agent-mode idle self-stop seconds (default 300)
RT_WEBSITE_POLL|dev|-|Force fs polling for watchers (default 1 on macOS, 0 on Linux)
RT_WEBSITE_REPO_CONTEXT|dev|-|Host checkout with packages/ for code-import/twoslash (default this repo)
RT_WEBSITE_DOCDATA|dev|-|Host dir of generated bench/test JSON the docs read (default .docdata)
RT_WEBSITE_SKIP_PLAYGROUND|dev|-|Skip auto-building the /playground bundle on run
RT_WEBSITE_MOUNT_OPTS|dev|-|Extra bind-mount opts, e.g. ":z" on SELinux
RT_WEBSITE_RUN_NETWORK|dev|-|podman run network (e.g. "host" behind a proxy)
RT_WEBSITE_BUILD_NETWORK|dev|-|podman build network (e.g. "host" behind a proxy)
RT_WEBSITE_BASE_IMAGE|dev|-|Node base image (default node:26-bookworm); mirror for air-gapped builds
RT_WEBSITE_PNPM_VERSION|dev|-|Override the pnpm version baked into the image
RT_WEBSITE_CA_CERT|dev|-|File/dir of extra CA certs to trust in the image (corporate/MITM proxy)
RT_WEBSITE_REMOTE_IMAGE|dev|-|GHCR ref to pull (default ghcr.io/$GHCR_OWNER/tsrt-website:latest)
RT_WEBSITE_SMOKE_TIMEOUT|dev|-|Seconds to wait for the smoke/verify server (default 90/120)

# --- benchmark knobs (scripts/website/bench-data/bench.sh) ---
RT_BENCH_ENGINE|dev|-|Container engine (default podman)
RT_BENCH_IMAGE|dev|-|Local image tag (default tsrt-website:dev)
RT_BENCH_CONTAINER|dev|-|Container name prefix (default tsrt-bench)
RT_BENCH_NO_TYPIA|dev|-|Skip the typia competitor (its native plugin build)
RT_BENCH_QUICK|dev|-|Fast/preview benchmark numbers (noisy)
RT_BENCH_NO_TIMING|dev|-|Correctness-only run (no timing)
RT_BENCH_TIME_MS|dev|-|Per-cell timing window in ms (default 100)
RT_BENCH_CASE|dev|-|Restrict a run to matching case names (inspection)
RT_BENCH_DUMP|dev|-|Print typecost probe sources (debug)
RT_BENCH_SERIALIZATION_OUT|dev|-|Serialization bench output dir (default container/website/public/bench-data)
RT_COMPILETIME_N|dev|-|Compile-time bench repeat count (default 5)
RT_COMPILETIME_COMPETITORS|dev|-|Libraries to measure compile time for (default "ts-runtypes typia")
RT_TRANSFORM_WIRE_N|dev|-|Transform-wire bench per-cell repeat count (default 5)
RT_BENCH_DOCDATA|dev|-|Host dir to publish benchmark JSON into (default .docdata)
RT_BENCH_REMOTE_IMAGE|dev|-|GHCR ref to pull (default ghcr.io/$GHCR_OWNER/tsrt-website:latest)
RT_BENCH_MOUNT_OPTS|dev|-|Extra bind-mount opts, e.g. ":z" on SELinux
RT_BENCH_RUN_NETWORK|dev|-|podman run network (e.g. "host" behind a proxy)
RT_BENCH_BUILD_NETWORK|dev|-|podman build network, forwarded to the image build
RT_BENCH_BASE_IMAGE|dev|-|Node base image, forwarded to the image build
RT_BENCH_PNPM_VERSION|dev|-|pnpm version, forwarded to the image build
RT_BENCH_CA_CERT|dev|-|Extra CA certs, forwarded to the image build

# --- fuzz test knobs (package.json fuzz scripts + the harness) ---
RT_FUZZ_SEED|dev|-|Fuzz PRNG seed (per-suite default)
RT_FUZZ_SOAK_MS|dev|-|value fuzz soak duration in ms
RT_FUZZ_TYPES_SOAK_MS|dev|-|type fuzz soak duration in ms
RT_FUZZ_SIZE_SOAK_MS|dev|-|binary-size fuzz soak duration in ms
RT_FUZZ_ROUNDTRIP_SOAK_MS|dev|-|round-trip fuzz soak duration in ms
RT_FUZZ_NONDATA_SOAK_MS|dev|-|non-data type fuzz soak duration in ms
RT_FUZZ_ENRICH_SEQUENCES|dev|-|enrich fuzz sequence count (default 6)
RT_FUZZ_ENRICH_MAXCMDS|dev|-|enrich fuzz max commands per sequence (default 8)
RT_FUZZ_ENRICH_REPLAY|dev|-|re-run one failing enrich sequence verbatim (seed)
RT_FUZZ_I18N_SEQUENCES|dev|-|i18n-sync fuzz sequence count (default 6)
RT_FUZZ_I18N_MAXCMDS|dev|-|i18n-sync fuzz max commands per sequence (default 10)
RT_FUZZ_I18N_REPLAY|dev|-|re-run one failing i18n-sync sequence verbatim (seed)
RT_FUZZ_TYPEMOD_SEQUENCES|dev|-|type-mod fuzz sequence count (default 6)
RT_FUZZ_TYPEMOD_MAXSTEPS|dev|-|type-mod fuzz max steps per sequence (default 8)
RT_FUZZ_TYPEMOD_REPLAY|dev|-|re-run one failing type-mod sequence verbatim (seed)
RT_FUZZ_TYPEMOD_REPORT|dev|-|print type-mod run/skip/flake/coverage stats
RT_FUZZ_TYPEMOD_DEBUG|dev|-|verbose type-mod failure diagnostics
RT_FUZZ_RACE|dev|-|enable the enrich race test (set by rt core fuzz race)
RT_FUZZ_RACE_ITERATIONS|dev|-|enrich race iterations (default 2)
RT_FUZZ_RACE_FANOUT|dev|-|enrich race fanout (default 6)

# --- resolver knobs (the ts-runtypes Go binary) ---
RT_CACHE_DIR|dev|-|Internal RT disk-cache override (tests/power users): path forces it on there, "" forces it off, unset follows the tsconfig incremental/composite setting

# --- lint knobs (the runtypes-devtools OXlint/ESLint plugin) ---
RT_LINT_PRESPAWN|dev|-|Set 0 to skip the lint plugin's load-time resolver pre-spawn (small hosts)

# --- alignment-audit knobs (scripts/website/bench-data/bench.sh audit + the harness) ---
RT_AUDIT_OUT_DIR|dev|-|Audit output dir (default the results dir)
RT_AUDIT_TSX|dev|-|Path to the tsx runner for the host-side audit collector

# --- internal / protocol vars: set by the scripts (container paths, plumbing). DO NOT set in .env ---
RT_AUDIT_ALIGNMENT|internal|-|Bench mode flag: emit alignment records instead of timing (set by rt bench audit)
RT_ENV_ROOT|internal|-|Repo root the .env loader anchors to (scripts/..)
RT_ENV_LOADED|internal|-|One-time .env-load guard sentinel
RT_REPO_ROOT|internal|-|In-container repo-context mount point (passed via -e)
RT_DOCDATA|internal|-|In-container docdata mount point (passed via -e)
RT_AGENT|internal|-|Agent-mode flag inside the container (passed via -e)
RT_AGENT_HEARTBEAT|internal|-|Agent heartbeat file path inside the container (passed via -e)
RT_AGENT_IDLE_SECONDS|internal|-|Agent idle window inside the container (passed via -e)
RT_BENCH_RESULTS_DIR|internal|-|In-container benchmark results dir (passed via -e)
RT_BENCH_HOST_CPU|internal|-|Host CPU model captured into env.json (passed via -e)
RT_BENCH_REPO_ROOT|internal|-|Serialization-bench repo root (passed via -e)
RT_BENCH_VITE_ROOT|internal|-|Serialization-bench vite root (passed via -e)
RT_BENCH_PACKAGE_ROOT|internal|-|Serialization-bench marker package root (passed via -e)
RT_BENCH_RT_OUTDIR|internal|-|Serialization-bench resolver output dir (passed via -e)
RT_BENCH_BIN|internal|-|Serialization-bench resolver binary path (passed via -e)
RT_BENCH_PLUGIN_ENTRY|internal|-|Serialization-bench vite plugin entry (passed via -e)
RT_EXTRACT_BIN|internal|-|Serialization-bench fn-body extractor path (passed via -e)
RT_BENCH_OUT_DIR|internal|-|Serialization-bench output dir (passed via -e)
RT_BENCH_SSR_NOEXTERNAL|internal|-|Serialization-bench vite ssr.noExternal list (passed via -e)
RT_BENCH_CACHE_DIR|internal|-|Serialization-bench resolver cache dir / false (passed via -e; forwarded to the binary's RT_CACHE_DIR)
REG
}
