#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  ts-runtypes publish${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"

# ── Check npm auth ──
echo ""
echo -e "${GREEN}[1/4] Checking npm authentication...${NC}"
echo "──────────────────────────────────────────"
if ! NPM_USER=$(npm whoami --no-interactive 2>/dev/null); then
  echo -e "${RED}Not logged in to npm. Run 'npm login' first.${NC}"
  exit 1
fi
echo -e "Logged in as: ${GREEN}${NPM_USER}${NC}"

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
echo -e "${YELLOW}Select version bump (lerna version):${NC}"
pnpm exec lerna version

# ── Cross-compile + stage the per-platform binary packages ──
echo ""
echo -e "${GREEN}[4/5] Building per-platform binary packages...${NC}"
echo "──────────────────────────────────────────"
# Stamps the freshly bumped lerna version into every ts-runtypes-binary-<os>-<arch>
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

# FE packages via lerna (rewrites workspace:* → concrete versions). ts-runtypes-bin
# was just published above, so `from-package` sees its version on the registry and
# skips it — only ts-runtypes + vite-plugin-runtypes publish here.
pnpm exec lerna publish from-package --no-private --ignore-scripts "${OTP_FLAG[@]}"

echo ""
echo -e "${GREEN}══════════════════════════════════════════${NC}"
echo -e "${GREEN}  Published successfully!${NC}"
echo -e "${GREEN}══════════════════════════════════════════${NC}"
