// Compile-time benchmark — the build-time OVERHEAD each transform-based library adds
// over a plain compile that produces no validators. Two libraries only (ts-runtypes,
// typia), measured PER SUITE SECTION (not per case): all of a section's call sites are
// compiled in ONE file, twice — with the transform OFF (the baseline) and ON.
//
//   ts-runtypes   vite, the runtypes-devtools plugin OFF (baseline) vs ON (the Go
//                 resolver runs, generates the validators, the bundler emits them)
//   typia         esbuild, the @ttsc/unplugin typia transform OFF vs ON (its native
//                 transform inlines validator bodies the compiler then type-checks)
//
// Why per section + on/off — the two fixes for the per-function distortion:
//  - Per-CASE wall-clock is dominated by fixed bundler/compiler init (lib load, parse,
//    checker setup), not the function. Batching a whole section amortizes that fixed
//    cost across many functions, so the transform work is a real fraction of the total.
//  - The SAME file is built twice (transform off, then on). The init/parse cost is
//    byte-for-byte identical in both runs, so it CANCELS in the gap; what's left is
//    purely the transform + generated-function compilation. The overhead is
//    transform_ms - baseline_ms. Each number is the median of N repeats.
//
// The transform column wipes the RT disk cache first, so it is the honest from-scratch
// cost (not a cache hit). typia's one-time plugin compile (~200s) persists in the
// .ttsc volume and is excluded from per-section numbers by a warm-up build before timing.
//
// Module resolution: this driver lives at /bench/compiletime but is RUN with cwd =
// competitors/<name>. vite / esbuild / the bind-mounted plugin all live in THAT
// competitor's node_modules, so it resolves every tool through a require anchored at
// the competitor dir. The section probe is written INTO the competitor dir so its
// bare imports and the verbatim realworld relative imports resolve.

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {makeExtractors} from '../_lib/extract-cases.mjs';

// ── config ───────────────────────────────────────────────────────────────────

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const intEnv = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : dflt;
};

const COMPETITOR = argOf('--competitor');
if (COMPETITOR !== 'ts-runtypes' && COMPETITOR !== 'typia') {
  console.error('compiletime: --competitor must be ts-runtypes or typia (the transform-based libraries)');
  process.exit(1);
}
const COMPETITOR_DIR = process.cwd(); // bash runs us with cwd = competitors/<name>
const RESULTS_DIR = process.env.BENCH_RESULTS_DIR ?? '/bench/results';
const SECTION_FILTER = (process.env.BENCH_CASE ?? '').toLowerCase(); // matches section keys
const N = intEnv('COMPILETIME_N', 5);

const PROBE = path.join(COMPETITOR_DIR, '__compiletime_probe.ts');
const PROBE_TSCONFIG = path.join(COMPETITOR_DIR, '__compiletime_tsconfig.json');
const RT_CACHE = path.join(COMPETITOR_DIR, '.compiletime-rt-cache');
const VITE_CACHE = path.join(COMPETITOR_DIR, '.compiletime-vite-cache');
const RT_BINARY = process.env.RT_BINARY ?? path.join(COMPETITOR_DIR, 'bin', 'ts-runtypes');

// ── tool resolution (anchored at the competitor dir) ─────────────────────────

const req = createRequire(path.join(COMPETITOR_DIR, '__compiletime_resolve.cjs'));
const importFrom = async (spec) => import(pathToFileURL(req.resolve(spec)).href);

// runtypes-devtools is import-ONLY (no `require` condition), so createRequire can't
// resolve it. It is bind-mounted at a known path, so read its exports map directly.
async function importExport(packageRoot, subpath) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const entry = pkg.exports?.[subpath] ?? pkg.exports?.['.'];
  const rel = typeof entry === 'string' ? entry : entry?.import ?? entry?.node ?? entry?.default;
  if (!rel) throw new Error(`no import target for ${subpath} in ${packageRoot}`);
  return import(pathToFileURL(path.join(packageRoot, rel)).href);
}

// The extractor only needs `typescript` to parse source (AST). typia's dir ships
// @typescript/native-preview, not `typescript`, so fall back to a sibling dir.
async function resolveTypescript() {
  const competitors = path.resolve(COMPETITOR_DIR, '..');
  const candidates = [COMPETITOR_DIR, path.join(competitors, 'ts-runtypes'), path.join(competitors, 'zod'), path.join(competitors, 'typebox')];
  for (const dir of candidates) {
    try {
      const r = createRequire(path.join(dir, '__rt_resolve.cjs'));
      return await import(pathToFileURL(r.resolve('typescript')).href);
    } catch {
      /* try next */
    }
  }
  throw new Error('typescript not resolvable from any competitor dir');
}
const tsMod = await resolveTypescript();
const ts = tsMod.default ?? tsMod;
const {extractTypeForm} = makeExtractors(ts);

const wipe = (p) => {
  try {
    fs.rmSync(p, {recursive: true, force: true});
  } catch {
    /* best effort */
  }
};
const decls = (locals) => (locals.length ? locals.join('\n') + '\n' : '');

// ── per-section probe assembly ───────────────────────────────────────────────
// One file per section: the file preamble once, then every case in the section as a
// block (locals scoped so a case-local `type Foo` can't collide with a sibling's).
function sectionProbe(model, keys) {
  const callOf = (typeText) =>
    COMPETITOR === 'typia' ? `typia.createIs<${typeText}>()` : `createValidate<${typeText}>()`;
  const blocks = keys.map((key, i) => {
    const e = model.entries[key];
    return `{\n${decls(e.locals)}const __v${i} = ${callOf(e.typeText)};\nvoid __v${i};\n}`;
  });
  return `${model.preamble.join('\n')}\n${blocks.join('\n')}\n`;
}

// ── build pipelines: buildWith(probePath, transform) ─────────────────────────

let buildWith; // async (probePath, transform:boolean) => void

async function setupPipeline() {
  fs.writeFileSync(
    PROBE_TSCONFIG,
    JSON.stringify({extends: './tsconfig.json', include: ['__compiletime_probe.ts', '../../shared']}, null, 2)
  );

  if (COMPETITOR === 'typia') {
    const {buildProbe} = await import(pathToFileURL(path.join(COMPETITOR_DIR, 'esbuild.config.mjs')).href);
    buildWith = (probePath, transform) => buildProbe(probePath, PROBE_TSCONFIG, {transform});
    return;
  }

  const viteMod = await importFrom('vite');
  const viteBuild = viteMod.build ?? viteMod.default?.build;
  if (typeof viteBuild !== 'function') throw new Error('vite build() not found');
  const rtPlugin = (await importExport(path.join(COMPETITOR_DIR, 'node_modules', 'runtypes-devtools'), './vite')).default;
  // A fresh plugin instance per build → a fresh resolver; combined with wiping the
  // disk cache before each transform build, the transform column is from-scratch.
  buildWith = (probePath, transform) =>
    viteBuild({
      configFile: false,
      root: COMPETITOR_DIR,
      logLevel: 'silent',
      clearScreen: false,
      cacheDir: VITE_CACHE,
      plugins: transform ? [rtPlugin({binary: RT_BINARY, cwd: COMPETITOR_DIR, tsconfig: '__compiletime_tsconfig.json', cacheDir: RT_CACHE})] : [],
      build: {
        ssr: probePath,
        write: false,
        minify: false,
        target: 'node22',
        emptyOutDir: false,
        reportCompressedSize: false,
        rollupOptions: {onwarn() {}},
      },
    });
}

async function timedBuild(transform) {
  if (transform) {
    wipe(RT_CACHE); // from-scratch transform (no cache hit)
    wipe(VITE_CACHE);
  }
  const t0 = process.hrtime.bigint();
  await buildWith(PROBE, transform);
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length >= 3) {
    s.shift();
    s.pop();
  }
  return s.reduce((a, b) => a + b, 0) / s.length || 0;
}

// Median of N baseline (transform off) + N transform (transform on) builds of the
// current PROBE. Interleaved so a slow moment hits both columns, not just one.
async function measureSection() {
  const baseline = [];
  const transform = [];
  for (let i = 0; i < N; i++) {
    baseline.push(await timedBuild(false));
    transform.push(await timedBuild(true));
  }
  return {baseline: median(baseline), transform: median(transform)};
}

// ── run ──────────────────────────────────────────────────────────────────────

const round = (n) => Math.round(n * 100) / 100;

function cleanup() {
  for (const p of [PROBE, PROBE_TSCONFIG, RT_CACHE, VITE_CACHE]) wipe(p);
}

async function main() {
  const callName = COMPETITOR === 'typia' ? 'typia.createIs' : 'createValidate';
  const model = extractTypeForm(path.join(COMPETITOR_DIR, 'cases.ts'), 'cases', callName);

  // Group supported case keys by section (the dotted prefix), preserving file order.
  const bySection = new Map();
  for (const key of model.keys) {
    if (!model.entries[key]) continue; // NOT_SUPPORTED
    const section = key.includes('.') ? key.slice(0, key.indexOf('.')) : key;
    if (SECTION_FILTER && !section.toLowerCase().includes(SECTION_FILTER)) continue;
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section).push(key);
  }
  if (!bySection.size) {
    console.error(`compiletime[${COMPETITOR}]: no sections matched (filter='${SECTION_FILTER}')`);
    cleanup();
    process.exit(SECTION_FILTER ? 1 : 0);
  }

  await setupPipeline();

  // Warm up the pipeline before any timing: the FIRST build in the process pays Node
  // JIT + bundler module init (~1s) and, for ts-runtypes/typia, the first resolver /
  // ttsc-plugin spawn (typia's is ~200s, compiled once into the .ttsc volume). A
  // throwaway off+on build of the first section absorbs all of that, so it never lands
  // on whichever section/column happens to run first (which otherwise biases the
  // baseline column, since it always runs before the transform column).
  {
    const [firstKeys] = bySection.values();
    fs.writeFileSync(PROBE, sectionProbe(model, firstKeys));
    try {
      if (COMPETITOR === 'typia') console.error('compiletime[typia]: warming up the ttsc plugin (one-time, excluded)...');
      else console.error(`compiletime[${COMPETITOR}]: warming up the pipeline...`);
      await timedBuild(false);
      await timedBuild(true);
    } catch (err) {
      console.error(`compiletime[${COMPETITOR}]: warm-up failed (${err?.message ?? err})`);
    }
  }

  const rows = [];
  let done = 0;
  for (const [section, keys] of bySection) {
    fs.writeFileSync(PROBE, sectionProbe(model, keys));
    try {
      const m = await measureSection();
      rows.push({
        section,
        count: keys.length,
        status: 'ok',
        baseline_ms: round(m.baseline),
        transform_ms: round(m.transform),
        overhead_ms: round(Math.max(0, m.transform - m.baseline)),
      });
    } catch (err) {
      rows.push({section, count: keys.length, status: 'err', detail: String(err?.message ?? err).slice(0, 200)});
    }
    done++;
    console.error(`compiletime[${COMPETITOR}]: ${done}/${bySection.size} sections (${section})`);
  }

  cleanup();
  report(rows);
  if (!SECTION_FILTER) writeResults(rows);
}

function report(rows) {
  const ok = rows.filter((r) => r.status === 'ok');
  console.log(`\nCompile-time overhead — ${COMPETITOR} (per section, transform off vs on, median of ${N})`);
  console.log('  section'.padEnd(22) + 'fns'.padStart(5) + 'baseline'.padStart(12) + '+transform'.padStart(12) + 'overhead'.padStart(12));
  for (const r of ok) {
    console.log(
      ('  ' + r.section).padEnd(22) +
        String(r.count).padStart(5) +
        `${r.baseline_ms}ms`.padStart(12) +
        `${r.transform_ms}ms`.padStart(12) +
        `${r.overhead_ms}ms`.padStart(12)
    );
  }
  for (const r of rows.filter((r) => r.status === 'err')) console.log(`  ${r.section}: ERR ${r.detail}`);
}

function writeResults(rows) {
  fs.mkdirSync(RESULTS_DIR, {recursive: true});
  const sections = rows.filter((r) => r.status === 'ok').map((r) => ({
    section: r.section,
    count: r.count,
    baseline_ms: r.baseline_ms,
    transform_ms: r.transform_ms,
    overhead_ms: r.overhead_ms,
  }));
  const out = {
    competitor: COMPETITOR,
    sections,
    total_baseline_ms: round(sections.reduce((a, s) => a + s.baseline_ms, 0)),
    total_transform_ms: round(sections.reduce((a, s) => a + s.transform_ms, 0)),
  };
  fs.writeFileSync(path.join(RESULTS_DIR, `${COMPETITOR}.compiletime.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${path.join(RESULTS_DIR, `${COMPETITOR}.compiletime.json`)} (${sections.length} sections)`);
}

main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
