#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# website-publish.sh - the WHOLE docs-site publish pipeline in one command.
#
# Chains the four stages the Cloudflare Pages artifact needs, in dependency
# order (each delegates to the script that already owns it - this is a thin,
# faithful composition, not a reimplementation):
#
#   1. shared website+benchmark podman image   (podman-website.sh ensure)
#   2. Go resolver binary + marker/plugin dist  (benchmarks.sh prep)
#   3. all benchmark data -> bench-data/        (benchmarks.sh website-bench)
#   4. static Nuxt build -> .output/public      (website.sh generate)
#
# WHY this order: the Nuxt pages render container-website/public/bench-data/,
# which stage 3 regenerates - so the benchmarks MUST run before the site build,
# and the benchmarks mount the Go binary from stage 2, which needs the image
# from stage 1. Stage 3 ends with gen-bench-docs (results -> bench-data/).
#
# Stage 3 is HEAVY (runtime benchmarks for every competitor + serialization +
# compile-time tiers); a full run is minutes, by design - this is a publish, not
# a dev loop.
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

step "1/4  shared website+benchmark podman image"
bash "$SCRIPT_DIR/podman-website.sh" ensure

step "2/4  Go resolver binary (+ marker/plugin dist)"
bash "$SCRIPT_DIR/benchmarks.sh" prep

step "3/4  benchmarks -> container-website/public/bench-data/"
bash "$SCRIPT_DIR/benchmarks.sh" website-bench

step "4/4  Nuxt $TARGET -> container-website/.output"
bash "$SCRIPT_DIR/website.sh" "$TARGET"

echo
echo "==> website:publish DONE (target: $TARGET${BENCH_QUICK:+, quick benchmarks})"
if [ "$TARGET" = "generate" ]; then
  echo "    static site:   container-website/.output/public"
  echo "    Cloudflare Pages 'build output directory' -> .output/public"
else
  echo "    server build:  container-website/.output  (needs a Node/nitro runtime)"
fi
