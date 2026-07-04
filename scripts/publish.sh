#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load the repo-root .env (dev only) so NPM_TOKEN is available for the publish auth.
source "$(dirname "${BASH_SOURCE[0]}")/lib-env.sh"

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ts-runtypes publish${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"

# ── npm auth (single source: NPM_TOKEN in .env) ──
echo ""
echo -e "${GREEN}[1/5] Configuring npm authentication...${NC}"
echo "──────────────────────────────────────────"
if [ -z "${NPM_TOKEN:-}" ]; then
  echo -e "${RED}NPM_TOKEN is not set. Put NPM_TOKEN=<npm automation token> in .env (cp .env.sample .env).${NC}"
  exit 1
fi
npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
NPM_USER=$(npm whoami 2>/dev/null || true)
if [ -n "$NPM_USER" ]; then
  echo -e "Authenticated as: ${GREEN}${NPM_USER}${NC}"
else
  echo -e "${GREEN}npm token configured${NC}"
fi

# ── Check clean working tree ──
echo ""
echo -e "${GREEN}[2/4] Checking working tree...${NC}"
echo "──────────────────────────────────────────"
if [ -n "$(git status --porcelain)" ]; then
  echo -e "${RED}Working tree is dirty. Commit or stash changes first.${NC}"
  git status --short
  exit 1
fi
echo -e "${GREEN}Working tree is clean${NC}"

# ── Version bump (interactive) ──
echo ""
echo -e "${GREEN}[3/5] Version bump${NC}"
echo "──────────────────────────────────────────"
read -rp "Version bump (patch / minor / major or explicit X.Y.Z): " BUMP
# Writes the lockstep version into version.json + every package.json, then commits + tags.
node scripts/bump-version.mjs "$BUMP"

# ── Cross-compile + stage the per-platform binary packages ──
echo ""
echo -e "${GREEN}[4/5] Building per-platform binary packages...${NC}"
echo "──────────────────────────────────────────"
# Stamps the freshly bumped version.json into every ts-runtypes-binary-<os>-<arch>
# package and into ts-runtypes-bin's optionalDependencies. Output: dist-binaries/.
node scripts/build-binary-packages.mjs

# ── Publish to npm ──
echo ""
echo -e "${GREEN}[5/5] Publishing to npm...${NC}"
echo "──────────────────────────────────────────"
# OTP is time-based and may expire across the sequential publishes below. A
# granular npm automation token (an _authToken in ~/.npmrc) skips the prompt
# entirely; leave the answer blank to use it. On an OTP timeout, re-run.
read -rp "Enter npm OTP code (blank if using an automation token): " OTP
OTP_FLAG=()
[ -n "${OTP}" ] && OTP_FLAG=(--otp="${OTP}")

# Platform binary packages FIRST, launcher LAST (dist-binaries/publish-order.json),
# so the launcher never lands referencing optional deps not yet on the registry.
# These carry no workspace deps, so they publish directly with npm.
while read -r PKG; do
  echo -e "${YELLOW}publishing ${PKG}...${NC}"
  npm publish "dist-binaries/${PKG}" --access public "${OTP_FLAG[@]}"
done < <(node -e "JSON.parse(require('fs').readFileSync('dist-binaries/publish-order.json','utf8')).forEach(p=>console.log(p))")

# FE packages via `pnpm publish` (rewrites workspace:* → concrete versions, exactly
# like the CI pack path in pack-artifacts.mjs). ts-runtypes-bin was already published
# in the loop above; only ts-runtypes + runtypes-devtools publish here.
pnpm --filter ts-runtypes --filter runtypes-devtools publish \
  --no-git-checks --ignore-scripts --access public "${OTP_FLAG[@]}"

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Published successfully!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
