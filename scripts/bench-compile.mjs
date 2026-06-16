#!/usr/bin/env node
// Compile-time benchmark harness for the Go backend (Step 2 of the perf
// plan — see docs/PERF-WORKLOADS.md).
//
// Two tiers:
//
//   MICRO — per-case synthetic compiles. Extracts every thunk body from the
//   validation + serialization suites via cmd/extract-fn-bodies (bodies there
//   are self-contained), wraps each in a minimal synthetic module against an
//   ambient marker DTS, and drives `reset → setSources → scanFiles` cycles on
//   a single --inline-server binary. Per cycle it records the scanFiles wall
//   time plus the Go-side Metrics block (markerScanMs / prepMs / renderMs /
//   alloc deltas / tsgo checker counters). A one-shot `tsCompile` per unit
//   records the pure-tsgo baseline.
//
//   MACRO — whole-suite scans through the real tsconfig.test.json Program
//   (all four suites, including format-validation / format-serialization
//   whose case bodies reference module-scope consts and therefore can't be
//   extracted per-case). One fresh binary per cycle; scans every data file
//   of the suite in a single scanFiles request with includeCacheSources all.
//   This is the holdout against per-case overfitting — its shape matches the
//   real vite workload.
//
// Usage:
//   node scripts/bench-compile.mjs [--quick] [--label NAME] [--out PATH]
//                                  [--cycles N] [--macro-cycles N]
//                                  [--skip-macro] [--skip-micro]
//
// Results land in bench/results/<label>.json; compare two result files with
// scripts/bench-compare.mjs.

import {spawnSync, spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import {performance} from 'node:perf_hooks';
import {createInterface} from 'node:readline';
import {ResolverClient} from '../packages/vite-plugin-runtypes/dist/resolver-client.js';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const PACKAGE_ROOT = path.join(REPO_ROOT, 'packages/ts-runtypes');
const SUITES_ROOT = path.join(PACKAGE_ROOT, 'test/suites');
const BIN = path.join(REPO_ROOT, 'bin/ts-runtypes');
const EXTRACT_BIN = path.join(REPO_ROOT, 'bin/extract-fn-bodies');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const QUICK = argv.includes('--quick');
const SKIP_MACRO = argv.includes('--skip-macro');
const SKIP_MICRO = argv.includes('--skip-micro');
function argValue(flag, fallback) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
// Spawn mode selects the binary's parallelism configuration:
//   st       — `--single-threaded` (one pool checker; the historical
//              baseline every pre-parallel measurement used)
//   serial   — multi-checker pool, `--no-parallel-scan --no-parallel-render`
//              (isolates pool/program cost from the fan-out itself)
//   parallel — default spawn, the shipped behavior (harness default)
const SPAWN_MODE = argValue('--spawn-mode', 'parallel');
if (!['st', 'serial', 'parallel'].includes(SPAWN_MODE)) {
  console.error(`unknown --spawn-mode '${SPAWN_MODE}' (expected st | serial | parallel)`);
  process.exit(1);
}
const LABEL = argValue('--label', `${QUICK ? 'quick' : 'full'}-${SPAWN_MODE}`);
const CYCLES = Number(argValue('--cycles', QUICK ? '3' : '5'));
const MACRO_CYCLES = Number(argValue('--macro-cycles', QUICK ? '1' : '2'));
const OUT_PATH = argValue('--out', path.join(REPO_ROOT, 'bench/results', `${LABEL}.json`));

// Extra binary flags for the macro tier's direct spawn, per mode.
function spawnModeArgs() {
  if (SPAWN_MODE === 'st') return ['--single-threaded'];
  if (SPAWN_MODE === 'serial') return ['--no-parallel-scan', '--no-parallel-render'];
  return [];
}

// ResolverClient option fragment for the micro tier (inline-server mode
// builds inferred multi-checker programs, so `st` collapses to the serial
// opt-outs there).
function spawnModeClientOptions() {
  return SPAWN_MODE === 'parallel' ? {} : {parallelScan: false, parallelRender: false};
}

// ---------------------------------------------------------------------------
// Micro-tier configuration. Per suite: which thunk fields to bench and which
// marker functions the synthetic wrapper must import. Entry collection is
// demand-driven, so each scanFiles request renders exactly the families the
// probe's call sites request. Bodies for these fields are self-contained
// (the format-* suites are NOT — they go through the macro tier only).
// ---------------------------------------------------------------------------
const MICRO_SUITES = [
  {
    suite: 'validation',
    apis: [
      {field: 'validate'},
      {field: 'validateReflect'},
      {field: 'getValidationErrors'},
    ],
    imports: ['createValidate', 'createGetValidationErrors'],
  },
  {
    suite: 'serialization',
    apis: [
      {field: 'cloneEncoder'},
      {field: 'stripDecoder'},
      {field: 'binaryEncoder'},
    ],
    imports: ['createJsonEncoder', 'createJsonDecoder', 'createBinaryEncoder', 'createBinaryDecoder'],
  },
];

// Ambient overlay mirroring internal/resolver/inline_test.go's runtypesDTS —
// the full createX surface so any self-contained suite body typechecks.
const RUNTYPES_DTS = `declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean}
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function createValidate<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createGetValidationErrors<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'verr'>): (v: unknown, p?: unknown[], e?: unknown[]) => unknown[];
  export function createMockType<T>(val?: T, id?: InjectRunTypeId<T>): () => T;
  export function createBinaryEncoder<T>(val?: T, options?: unknown, id?: InjectTypeFnArgs<T, 'tb'>): (v: unknown) => unknown;
  export function createBinaryDecoder<T>(val?: T, options?: unknown, id?: InjectTypeFnArgs<T, 'fb'>): (v: unknown) => unknown;
  export type JsonEncoderOptions = {strategy?: 'clone' | 'mutate' | 'direct'};
  export type JsonDecoderOptions = {strategy?: 'strip' | 'preserve'};
  export function createJsonEncoder<T>(val?: T, options?: CompTimeFnArgs<JsonEncoderOptions>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: unknown) => string | undefined;
  export function createJsonDecoder<T>(val?: T, options?: CompTimeFnArgs<JsonDecoderOptions>, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): (s: string) => unknown;
}
`;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function fail(msg) {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

function ensureBinaries() {
  if (!fs.existsSync(BIN)) fail(`binary not found at ${BIN} — go build -o bin/ts-runtypes ./cmd/ts-runtypes`);
  const res = spawnSync('go', ['build', '-o', EXTRACT_BIN, './cmd/extract-fn-bodies'], {cwd: REPO_ROOT, encoding: 'utf8'});
  if (res.status !== 0) fail(`building extract-fn-bodies failed:\n${res.stderr}`);
}

function gitSha() {
  const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: REPO_ROOT, encoding: 'utf8'});
  return res.status === 0 ? res.stdout.trim() : 'unknown';
}

// Data files of a suite: every .ts that isn't a test file, the barrel, or
// the shared types module.
function suiteDataFiles(suite) {
  const dir = path.join(SUITES_ROOT, suite);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts' && f !== 'types.ts')
    .sort()
    .map((f) => path.join(dir, f));
}

// First `export const UPPER_SNAKE` in a data file — the group identifier the
// extractor walks. (File names are not reverse-mappable to const names:
// DateTime.ts exports DATETIME, CircularRefs.ts exports CIRCULAR_REFS.)
function groupIdentifier(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^export const ([A-Z][A-Z0-9_]*)\b/m);
  return m ? m[1] : null;
}

function extractBodies(file, identifier) {
  const res = spawnSync(EXTRACT_BIN, ['--file', file, '--identifier', identifier], {cwd: REPO_ROOT, encoding: 'utf8'});
  if (res.status !== 0) fail(`extract-fn-bodies ${file} ${identifier} failed:\n${res.stderr}`);
  return JSON.parse(res.stdout);
}

function buildSynthetic(imports, body) {
  return `import {${imports.join(', ')}} from 'ts-runtypes';\nconst _probe = () => {\n${body}\n};\n`;
}

function statsOf(samples) {
  if (!samples || samples.length === 0) return undefined;
  const sorted = [...samples].sort((a, b) => a - b);
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const stddev = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return {mean: round3(mean), stddev: round3(stddev), min: round3(sorted[0]), max: round3(sorted[n - 1])};
}
function round3(x) {
  return Math.round(x * 1000) / 1000;
}
function sumRenderMs(metrics) {
  if (!metrics?.renderMs) return 0;
  return Object.values(metrics.renderMs).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// MICRO tier
// ---------------------------------------------------------------------------
async function runMicro() {
  const units = [];
  for (const cfg of MICRO_SUITES) {
    for (const file of suiteDataFiles(cfg.suite)) {
      const identifier = groupIdentifier(file);
      if (!identifier) continue;
      const bodies = extractBodies(file, identifier);
      const caseKeys = Object.keys(bodies);
      const selectedKeys = QUICK ? caseKeys.slice(0, 1) : caseKeys;
      for (const caseKey of selectedKeys) {
        for (const api of cfg.apis) {
          const body = bodies[caseKey]?.[api.field];
          if (typeof body !== 'string') continue;
          units.push({suite: cfg.suite, group: identifier, caseKey, api: api.field, imports: cfg.imports, body});
        }
      }
    }
  }

  const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, ...spawnModeClientOptions()});
  const results = {};
  const phaseStart = performance.now();
  let done = 0;
  try {
    for (const unit of units) {
      done += 1;
      progress('micro', done, units.length, phaseStart, `${unit.suite}/${unit.group}.${unit.caseKey}.${unit.api}`);
      const relpath = `__bench__/${safe(unit.group)}__${safe(unit.caseKey)}__${unit.api}.ts`;
      const sources = {'runtypes.d.ts': RUNTYPES_DTS, [relpath]: buildSynthetic(unit.imports, unit.body)};
      const wall = [];
      const goTotal = [];
      const markerScan = [];
      const prep = [];
      const render = [];
      const alloc = [];
      const mallocs = [];
      const instantiations = [];
      const types = [];
      let sites = 0;
      let heapAlloc = 0;
      let cacheNodes = 0;
      let errored = null;
      try {
        for (let c = 0; c < CYCLES + 1; c++) {
          await client.reset();
          await client.setSources(sources);
          const t0 = performance.now();
          const resp = await client.scanFiles([relpath], {includeEntryModules: true, includeMetrics: true});
          const elapsed = performance.now() - t0;
          if (c === 0) continue; // warmup cycle (first-touch disk/JIT noise)
          wall.push(elapsed);
          const m = resp.metrics ?? {};
          goTotal.push(m.totalMs ?? 0);
          markerScan.push(m.markerScanMs ?? 0);
          prep.push(m.prepMs ?? 0);
          render.push(sumRenderMs(m));
          alloc.push(m.allocBytes ?? 0);
          mallocs.push(m.mallocs ?? 0);
          instantiations.push(m.instantiations ?? 0);
          types.push(m.types ?? 0);
          sites = resp.sites.length;
          heapAlloc = m.heapAlloc ?? 0;
          cacheNodes = m.cacheNodes ?? 0;
        }
        // tsgo baseline, one cycle.
        await client.reset();
        await client.setSources(sources);
        const tsCompileMs = await client.tsCompile();
        const key = `${unit.suite}/${unit.group}.${unit.caseKey}.${unit.api}`;
        results[key] = {
          sites,
          wallMs: statsOf(wall),
          goTotalMs: statsOf(goTotal),
          markerScanMs: statsOf(markerScan),
          prepMs: statsOf(prep),
          renderMs: statsOf(render),
          allocBytes: statsOf(alloc),
          mallocs: statsOf(mallocs),
          instantiations: statsOf(instantiations),
          types: statsOf(types),
          heapAlloc,
          cacheNodes,
          tsCompileMs: round3(tsCompileMs),
        };
      } catch (err) {
        errored = String(err?.message ?? err);
        results[`${unit.suite}/${unit.group}.${unit.caseKey}.${unit.api}`] = {error: errored};
      }
    }
  } finally {
    client.close();
  }
  return results;
}

// ---------------------------------------------------------------------------
// MACRO tier — one fresh binary per cycle against the real tsconfig Program.
// ---------------------------------------------------------------------------
const MACRO_SUITES = ['validation', 'serialization', 'format-validation', 'format-serialization'];

// Raw JSON-per-line client against a one-shot tsconfig-mode binary. The
// ResolverClient could do this too, but here we also want the spawn→first-
// response latency (program parse+bind happens before the serve loop).
function spawnTsconfigClient() {
  const child = spawn(BIN, ['--one-shot', '--cwd', PACKAGE_ROOT, '--tsconfig', 'tsconfig.test.json', ...spawnModeArgs()], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const lines = createInterface({input: child.stdout});
  const queue = [];
  lines.on('line', (line) => {
    const next = queue.shift();
    if (next) next(JSON.parse(line));
  });
  return {
    child,
    request(req) {
      return new Promise((resolve) => {
        queue.push(resolve);
        child.stdin.write(JSON.stringify(req) + '\n');
      });
    },
    close() {
      child.stdin.end();
      child.kill();
    },
  };
}

async function runMacro() {
  const results = {};
  for (const suite of MACRO_SUITES) {
    const files = suiteDataFiles(suite).map((abs) => path.relative(PACKAGE_ROOT, abs));
    const programLoad = [];
    const wall = [];
    const goTotal = [];
    const markerScan = [];
    const prep = [];
    const render = [];
    const alloc = [];
    const instantiations = [];
    const types = [];
    let sites = 0;
    let cacheNodes = 0;
    let heapAlloc = 0;
    let diagnostics = 0;
    for (let c = 0; c < MACRO_CYCLES; c++) {
      const client = spawnTsconfigClient();
      try {
        const spawnT0 = performance.now();
        await client.request({op: 'resolveId', id: '__ping__'});
        programLoad.push(performance.now() - spawnT0);
        const t0 = performance.now();
        const resp = await client.request({op: 'scanFiles', files, includeEntryModules: true, includeMetrics: true});
        wall.push(performance.now() - t0);
        if (resp.error) throw new Error(resp.error);
        const m = resp.metrics ?? {};
        goTotal.push(m.totalMs ?? 0);
        markerScan.push(m.markerScanMs ?? 0);
        prep.push(m.prepMs ?? 0);
        render.push(sumRenderMs(m));
        alloc.push(m.allocBytes ?? 0);
        instantiations.push(m.instantiations ?? 0);
        types.push(m.types ?? 0);
        sites = (resp.sites ?? []).length;
        cacheNodes = m.cacheNodes ?? 0;
        heapAlloc = m.heapAlloc ?? 0;
        diagnostics = (resp.diagnostics ?? []).length;
      } finally {
        client.close();
      }
      process.stdout.write(`[macro] ${suite} cycle ${c + 1}/${MACRO_CYCLES} done\n`);
    }
    results[suite] = {
      files: files.length,
      sites,
      diagnostics,
      programLoadMs: statsOf(programLoad),
      wallMs: statsOf(wall),
      goTotalMs: statsOf(goTotal),
      markerScanMs: statsOf(markerScan),
      prepMs: statsOf(prep),
      renderMs: statsOf(render),
      allocBytes: statsOf(alloc),
      instantiations: statsOf(instantiations),
      types: statsOf(types),
      cacheNodes,
      heapAlloc,
    };
  }
  return results;
}

// ---------------------------------------------------------------------------
function safe(s) {
  return String(s).replace(/[^A-Za-z0-9_]/g, '_');
}

const progressLastDecile = new Map();
function progress(label, current, total, startTime, detail) {
  const decile = Math.floor((total > 0 ? (current * 100) / total : 100) / 10);
  if (decile <= (progressLastDecile.get(label) ?? -1)) return;
  progressLastDecile.set(label, decile);
  const elapsed = (performance.now() - startTime) / 1000;
  process.stdout.write(`[${label}] ${decile * 10}% (${current}/${total}) ${elapsed.toFixed(1)}s — ${detail}\n`);
}

async function main() {
  ensureBinaries();
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const out = {
    meta: {
      label: LABEL,
      quick: QUICK,
      spawnMode: SPAWN_MODE,
      cycles: CYCLES,
      macroCycles: MACRO_CYCLES,
      sha: gitSha(),
      date: startedAt,
      node: process.version,
      host: `${os.platform()}-${os.arch()}-${os.cpus()[0]?.model ?? '?'}x${os.cpus().length}`,
    },
    micro: {},
    macro: {},
  };
  if (!SKIP_MICRO) out.micro = await runMicro();
  if (!SKIP_MACRO) out.macro = await runMacro();
  fs.mkdirSync(path.dirname(OUT_PATH), {recursive: true});
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 1) + '\n');
  const microCount = Object.keys(out.micro).length;
  process.stdout.write(
    `wrote ${path.relative(REPO_ROOT, OUT_PATH)} — ${microCount} micro units, ${Object.keys(out.macro).length} macro suites in ${((performance.now() - t0) / 1000).toFixed(1)}s\n`
  );
}

await main();
