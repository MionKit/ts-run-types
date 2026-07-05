// build.mjs — the WHOLE docs-site publish pipeline in one command. Port of the
// former scripts/website/build.sh. Chains the stages the Cloudflare Pages artifact
// needs, in dependency order, composing the migrated area modules:
//
//   1. shared website+benchmark podman image   (image.mjs ensureImage)
//   2. Go resolver binary + marker/plugin dist  (bench prep)
//   3. suite-data -> public/suite-data/         (suite-data exporters, host)
//   4. all benchmark data -> bench-data/        (bench website-bench)
//   5. playground assets -> public/playground-app/ (build-playground.mjs, host)
//   6. static Nuxt build -> .output/public      (site.mjs generate)
//
// The Nuxt pages FETCH public/suite-data/ + public/bench-data/ at runtime and the
// /playground page loads public/playground-app/ — all git-ignored, so stages 3-5
// regenerate them before the site build (stage 6) bakes them in.
//
// Usage (via `pnpm rt website build …`): [generate|build] [--quick] [--no-bench].
// --quick maps onto RT_BENCH_QUICK; --no-bench reuses existing suite+bench data.

import {existsSync, globSync, mkdirSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {ensureImage} from '../container/image.mjs';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {die, note, reportCliError, run, warn, which} from '../lib/proc.mjs';
import {main as benchMain} from './bench-data/bench.mjs';
import {main as siteMain} from './site.mjs';

const WEBSITE_DIR = join(REPO_ROOT, 'container/website');
const OUTPUT_DIR = join(WEBSITE_DIR, '.output');

const step = (msg) => console.log(`\n========== website build  ${msg} ==========`);

// Run a node script from the repo root; throw CliError on non-zero.
function node(rel, args = []) {
  if (run('node', [join(REPO_ROOT, rel), ...args]) !== 0) die(`website build: ${rel} failed`);
}

// --no-bench reuses already-generated data instead of re-running the (multi-minute)
// suite + benchmark stages. Both dirs are git-ignored and produced ONLY by those
// stages, so assert UP FRONT and fail LOUD rather than shipping a wrong build.
function requireBenchArtifacts() {
  let missing = false;
  for (const dir of [join(WEBSITE_DIR, 'public/suite-data'), join(WEBSITE_DIR, 'public/bench-data')]) {
    if (!existsSync(dir) || globSync('**/*.json', {cwd: dir}).length === 0) {
      console.error(`website build: --no-bench needs '${dir}' to already exist with data, but it is missing or empty.`);
      missing = true;
    }
  }
  if (missing) die("website build: run a full 'pnpm rt website build' once to generate suite-data + bench-data, then re-run with --no-bench.");
}

// Human-readable byte size (KB/MB), for the zip line.
function humanSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${bytes}B`;
}

export async function main(args) {
  // generate = static prerender -> .output/public (Cloudflare Pages default).
  // build    = SSR/nitro build  -> .output         (needs a server runtime).
  let target = 'generate';
  let skipBench = false;
  for (const arg of args) {
    if (arg === '--quick') process.env.RT_BENCH_QUICK = '1';
    else if (arg === '--no-bench') skipBench = true;
    else if (arg === 'generate' || arg === 'build') target = arg;
    else die(`website build: unknown arg '${arg}' (want: [generate|build] [--quick] [--no-bench])`, 2);
  }

  // One USE_LOCAL knob across image + bench: mirror whichever is set so a single
  // knob steers the whole run and the stages can't pick different images.
  if (process.env.RT_WEBSITE_USE_LOCAL || process.env.RT_BENCH_USE_LOCAL) {
    process.env.RT_WEBSITE_USE_LOCAL = '1';
    process.env.RT_BENCH_USE_LOCAL = '1';
  }

  // Fail fast: verify the reused data exists before spending time on the prereqs.
  if (skipBench) requireBenchArtifacts();

  step('1/5  shared website+benchmark podman image');
  ensureImage();

  step('2/5  Go resolver binary (+ marker/plugin dist)');
  benchMain(['prep']);

  if (skipBench) {
    step('3+4/5  SKIPPED (--no-bench): reusing existing suite-data + bench-data');
  } else {
    step('3/5  suite-data -> container/website/public/suite-data/');
    node('scripts/website/suite-data/export-validation.mjs');
    node('scripts/website/suite-data/export-serialization.mjs');
    node('scripts/website/suite-data/export-validation.mjs', ['--suite', 'format-validation']);
    node('scripts/website/suite-data/export-serialization.mjs', ['--suite', 'format-serialization']);
    node('scripts/website/suite-data/website-data.mjs');

    step('4/5  benchmarks -> container/website/public/bench-data/');
    benchMain(['website-bench']);
  }

  // The playground bundle is independent of suite/bench data (runs even under
  // --no-bench) but needs the stage-2 Go binary for its WASM.
  step('5/6  playground assets -> container/website/public/playground-app/');
  node('container/website/scripts/build-playground.mjs');

  step(`6/6  Nuxt ${target} -> container/website/.output`);
  await siteMain([target]);

  // Package the static artifact into a single zip beside it (manual Cloudflare
  // dashboard "direct upload" / backup). Only for generate — the self-contained
  // static site. The zip holds the CONTENTS of public/ at its root; it lands at
  // .output/site.zip, a SIBLING of public/, so it is never swept into the deploy.
  if (target === 'generate' && existsSync(join(OUTPUT_DIR, 'public'))) {
    step('zip  container/website/.output/public -> .output/site.zip');
    if (which('zip')) {
      rmSync(join(OUTPUT_DIR, 'site.zip'), {force: true});
      if (run('zip', ['-r', '-q', '-X', '../site.zip', '.'], {cwd: join(OUTPUT_DIR, 'public')}) !== 0) die('website build: zip failed');
      console.log(`    wrote ${join(OUTPUT_DIR, 'site.zip')} (${humanSize(statSync(join(OUTPUT_DIR, 'site.zip')).size)})`);
    } else {
      warn("'zip' not on PATH - skipped site.zip (install 'zip' to enable)");
    }
  }

  console.log('');
  const quick = process.env.RT_BENCH_QUICK ? ', quick benchmarks' : '';
  const nobench = skipBench ? ', no-bench: reused suite+bench data' : '';
  console.log(`==> website build DONE (target: ${target}${quick}${nobench})`);
  if (target === 'generate') {
    console.log('    static site:   container/website/.output/public');
    if (existsSync(join(OUTPUT_DIR, 'site.zip'))) console.log('    static zip:    container/website/.output/site.zip');
    console.log("    Cloudflare Pages 'build output directory' -> .output/public");
  } else {
    console.log('    server build:  container/website/.output  (needs a Node/nitro runtime)');
  }
}

if (import.meta.main) {
  loadEnv();
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
