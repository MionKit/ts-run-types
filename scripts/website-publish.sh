#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# website-publish.sh - the WHOLE docs-site publish pipeline in one command.
#
# Chains the six stages the Cloudflare Pages artifact needs, in dependency
# order (each delegates to the script that already owns it - this is a thin,
# faithful composition, not a reimplementation):
#
#   1. shared website+benchmark podman image   (podman-website.sh ensure)
#   2. Go resolver binary + marker/plugin dist  (benchmarks.sh prep)
#   3. suite-data -> public/suite-data/         (pnpm run gen:suite-docs, host)
#   4. all benchmark data -> bench-data/        (benchmarks.sh website-bench)
#   5. playground bundle -> public/playground-app/ (build-playground.sh, host)
#   6. static Nuxt build -> .output/public      (website.sh generate)
#
# WHY this order: the Nuxt pages FETCH public/suite-data/ (test/validation pages)
# and public/bench-data/ (benchmark pages) at runtime, and the /playground page
# loads public/playground-app/ (the resolver WASM + Monaco web component) - all
# three dirs are git-ignored, so stages 3-5 MUST regenerate them before the site
# build (stage 6) bakes them into the static output. The data gens + the
# playground WASM need the Go binary from stage 2, which needs the image from
# stage 1. Stage 4 ends with gen-bench-docs.
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
# OUTPUT: a static site at container/website/.output/public - point Cloudflare
# Pages' "build output directory" at that path. The generate target also packages
# that dir into container/website/.output/site.zip (public/ contents at the zip
# root) for a manual dashboard "direct upload" or a backup. Deployment itself is
# Cloudflare's job; this script only produces the artifact. ASCII-only (macOS bash 3.2).
#
# Usage:
#   scripts/website-publish.sh            # full pipeline, static artifact (generate)
#   scripts/website-publish.sh build      # final stage = SSR/nitro build instead
#   scripts/website-publish.sh --quick    # fast/preview benchmarks (noisy numbers)
#   scripts/website-publish.sh --no-bench # SKIP stages 3+4; reuse the suite-data +
#                                         #   bench-data already on disk (rebuild
#                                         #   only). Errors if that data is absent.
#   WEBSITE_USE_LOCAL=1 scripts/website-publish.sh   # force a local image build
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# generate = static prerender -> .output/public (Cloudflare Pages default).
# build    = SSR/nitro build  -> .output         (needs a server runtime).
# --quick  = fast/preview benchmark stage (BENCH_QUICK=1) for a two-staged site;
#            stage 3 then maps it onto every benchmark's native quick lever.
TARGET=generate
SKIP_BENCH=
for arg in "$@"; do
  case "$arg" in
    --quick)        export BENCH_QUICK=1 ;;
    --no-bench)     SKIP_BENCH=1 ;;
    generate|build) TARGET="$arg" ;;
    *) echo "website-publish: unknown arg '$arg' (want: [generate|build] [--quick] [--no-bench])" >&2; exit 2 ;;
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

# --no-bench reuses already-generated data instead of re-running the (multi-minute)
# suite + benchmark stages (3+4). Both dirs are git-ignored and produced ONLY by
# those stages, so if either is absent or empty the site would build with missing
# panels. Assert UP FRONT and fail LOUD rather than shipping a silently-wrong build
# (and before the prereq stages waste any time).
require_bench_artifacts() {
  local missing=0 dir
  for dir in \
    "$SCRIPT_DIR/../container/website/public/suite-data" \
    "$SCRIPT_DIR/../container/website/public/bench-data"; do
    if [ ! -d "$dir" ] || [ -z "$(find "$dir" -type f -name '*.json' -print -quit 2>/dev/null)" ]; then
      echo "website-publish: --no-bench needs '$dir' to already exist with data, but it is missing or empty." >&2
      missing=1
    fi
  done
  if [ "$missing" -ne 0 ]; then
    echo "website-publish: run a full 'pnpm run website:publish' (or website:publish:quick) once to generate suite-data + bench-data, then re-run with --no-bench." >&2
    exit 1
  fi
}

# Fail fast: verify the reused data exists before spending time on the prereqs.
if [ -n "$SKIP_BENCH" ]; then require_bench_artifacts; fi

step "1/5  shared website+benchmark podman image"
bash "$SCRIPT_DIR/podman-website.sh" ensure

step "2/5  Go resolver binary (+ marker/plugin dist)"
bash "$SCRIPT_DIR/benchmarks.sh" prep

# Stages 3+4 regenerate the git-ignored data the pages fetch: suite-data (the
# validation/serialization test-page examples) and bench-data (the benchmark
# numbers). --no-bench SKIPS both and reuses what is already on disk (presence
# verified up front by require_bench_artifacts). Both honor BENCH_QUICK and both
# need the stage-2 binary + dists.
if [ -n "$SKIP_BENCH" ]; then
  step "3+4/5  SKIPPED (--no-bench): reusing existing suite-data + bench-data"
else
  step "3/5  suite-data -> container/website/public/suite-data/"
  ( cd "$SCRIPT_DIR/.." && pnpm run gen:suite-docs )

  step "4/5  benchmarks -> container/website/public/bench-data/"
  bash "$SCRIPT_DIR/benchmarks.sh" website-bench
fi

# The playground bundle is independent of suite-data/bench-data (so it runs even
# under --no-bench) but needs the stage-2 Go binary for its WASM. Staged into the
# git-ignored public/playground-app/ that the /playground page loads.
step "5/6  playground bundle -> container/website/public/playground-app/"
bash "$SCRIPT_DIR/../container/website/scripts/build-playground.sh"

step "6/6  Nuxt $TARGET -> container/website/.output"
bash "$SCRIPT_DIR/website.sh" "$TARGET"

# Package the static artifact into a single zip beside it (for a manual Cloudflare
# Pages dashboard "direct upload", a backup, or sharing a build). Only for the
# generate target - that is the self-contained static site. The zip holds the
# CONTENTS of public/ at its root (index.html at the top level), which is what
# static-hosting drop-zones expect. It lands at .output/site.zip, a SIBLING of
# public/, so it is never swept into the public/ upload or the wrangler deploy.
OUTPUT_DIR="$SCRIPT_DIR/../container/website/.output"
if [ "$TARGET" = "generate" ] && [ -d "$OUTPUT_DIR/public" ]; then
  step "zip  container/website/.output/public -> .output/site.zip"
  if command -v zip >/dev/null 2>&1; then
    rm -f "$OUTPUT_DIR/site.zip"
    ( cd "$OUTPUT_DIR/public" && zip -r -q -X ../site.zip . )
    echo "    wrote $(cd "$OUTPUT_DIR" && pwd)/site.zip ($(du -h "$OUTPUT_DIR/site.zip" | cut -f1))"
  else
    echo "    WARN: 'zip' not on PATH - skipped site.zip (install 'zip' to enable)" >&2
  fi
fi

echo
echo "==> website:publish DONE (target: $TARGET${BENCH_QUICK:+, quick benchmarks}${SKIP_BENCH:+, no-bench: reused suite+bench data})"
if [ "$TARGET" = "generate" ]; then
  echo "    static site:   container/website/.output/public"
  if [ -f "$OUTPUT_DIR/site.zip" ]; then echo "    static zip:    container/website/.output/site.zip"; fi
  echo "    Cloudflare Pages 'build output directory' -> .output/public"
else
  echo "    server build:  container/website/.output  (needs a Node/nitro runtime)"
fi
