#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# website-publish.sh - the WHOLE docs-site publish pipeline in one command.
#
# Chains the five stages the Cloudflare Pages artifact needs, in dependency
# order (each delegates to the script that already owns it - this is a thin,
# faithful composition, not a reimplementation):
#
#   1. shared website+benchmark podman image   (podman-website.sh ensure)
#   2. Go resolver binary + marker/plugin dist  (benchmarks.sh prep)
#   3. suite-data -> public/suite-data/         (pnpm run gen:suite-docs, host)
#   4. all benchmark data -> bench-data/        (benchmarks.sh website-bench)
#   5. static Nuxt build -> .output/public      (website.sh generate)
#
# WHY this order: the Nuxt pages FETCH public/suite-data/ (test/validation pages)
# and public/bench-data/ (benchmark pages) at runtime - both dirs are git-ignored,
# so stages 3 + 4 MUST regenerate them before the site build (stage 5) bakes them
# into the static output. The data gens need the Go binary + dists from stage 2,
# which need the image from stage 1. Stage 4 ends with gen-bench-docs.
#
# Stage 4 is HEAVY (runtime benchmarks for every competitor + serialization +
# compile-time tiers) and stage 3 benchmarks every suite case; a full run is many
# minutes. Pass --quick (BENCH_QUICK=1) for the fast/preview path - this is a
# publish, not a dev loop.
#
# IMAGE SOURCE follows the same knobs as the sibling scripts. By default the
# shared image is pulled-or-built (ensure) so CI and local never drift. Set
# WEBSITE_USE_LOCAL=1 to force a local image build instead (maintainer/offline);
# the orchestrator mirrors that onto the benchmark stage's BENCH_USE_LOCAL knob
# so every stage uses the SAME image source.
#
# OUTPUT: a static site at container-website/.output/public - point Cloudflare
# Pages' "build output directory" at that path. Deployment itself is Cloudflare's
# job; this script only produces the artifact. ASCII-only (macOS bash 3.2).
#
# Usage:
#   scripts/website-publish.sh            # full pipeline, static artifact (generate)
#   scripts/website-publish.sh build      # final stage = SSR/nitro build instead
#   scripts/website-publish.sh --quick    # fast/preview benchmarks (noisy numbers)
#   WEBSITE_USE_LOCAL=1 scripts/website-publish.sh   # force a local image build
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# generate = static prerender -> .output/public (Cloudflare Pages default).
# build    = SSR/nitro build  -> .output         (needs a server runtime).
# --quick  = fast/preview benchmark stage (BENCH_QUICK=1) for a two-staged site;
#            stage 3 then maps it onto every benchmark's native quick lever.
TARGET=generate
for arg in "$@"; do
  case "$arg" in
    --quick)        export BENCH_QUICK=1 ;;
    generate|build) TARGET="$arg" ;;
    *) echo "website-publish: unknown arg '$arg' (want: [generate|build] [--quick])" >&2; exit 2 ;;
  esac
done

# One USE_LOCAL knob across both child scripts: podman-website.sh / website.sh
# read WEBSITE_USE_LOCAL; benchmarks.sh reads BENCH_USE_LOCAL (its run_manager
# maps it back onto WEBSITE_USE_LOCAL). Mirror whichever is set so a single knob
# steers the whole run and the stages can't pick different images.
if [ -n "${WEBSITE_USE_LOCAL:-}" ] || [ -n "${BENCH_USE_LOCAL:-}" ]; then
  export WEBSITE_USE_LOCAL=1 BENCH_USE_LOCAL=1
fi

step() { printf '\n========== website:publish  %s ==========\n' "$1"; }

step "1/5  shared website+benchmark podman image"
bash "$SCRIPT_DIR/podman-website.sh" ensure

step "2/5  Go resolver binary (+ marker/plugin dist)"
bash "$SCRIPT_DIR/benchmarks.sh" prep

# Host step: regenerates public/suite-data/ (the validation/serialization test-page
# examples). Honors BENCH_QUICK via the export scripts. Needs the stage-2 binary+dists.
step "3/5  suite-data -> container-website/public/suite-data/"
( cd "$SCRIPT_DIR/.." && pnpm run gen:suite-docs )

step "4/5  benchmarks -> container-website/public/bench-data/"
bash "$SCRIPT_DIR/benchmarks.sh" website-bench

step "5/5  Nuxt $TARGET -> container-website/.output"
bash "$SCRIPT_DIR/website.sh" "$TARGET"

echo
echo "==> website:publish DONE (target: $TARGET${BENCH_QUICK:+, quick benchmarks})"
if [ "$TARGET" = "generate" ]; then
  echo "    static site:   container-website/.output/public"
  echo "    Cloudflare Pages 'build output directory' -> .output/public"
else
  echo "    server build:  container-website/.output  (needs a Node/nitro runtime)"
fi
