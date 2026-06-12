#!/usr/bin/env node
// Generates gendocs/serialization-suite.{json,md} from SERIALIZATION_SPEC.
//
// Bench surface: all five encoder shapes from the orthogonal
// (strategy, stripExtras) matrix + two decoder shapes (see APIS below).
// Each (case, api) is measured for:
//
//   - Runtime ops/sec: pre-allocate a pool of fresh sample values
//     outside the timed loop, then time `cycles * iters` calls into
//     the api fn over the pool. Decode APIs additionally pre-encode
//     each pool entry via the safe encoder so the timed loop measures
//     pure parse + restore.
//   - Compile latency (compileMs): spawn a dedicated serverMode
//     ResolverClient, synthesise a .ts file wrapping the case body
//     around the right create* import, drive reset + setSources +
//     scanFiles with includeEntryModules for COMPILE_CYCLES rounds,
//     record scanFiles wall time. Measures the ts-go-run-types marker
//     scan + per-entry module collection phase (demand-driven: only the
//     families the probe's call sites request render).
//   - Pure-TS compile latency (tsCompileMs): same setSources +
//     tsCompile op, which runs the embedded tsgo through bind +
//     typecheck + Emit() without touching the marker scanner. The two
//     phases run sequentially in a real build pipeline (TypeScript 7
//     has no transforms API yet), so the doc shows both numbers
//     side-by-side rather than nested.
//
// Single-file orchestrator on purpose — see the matching header
// comment in export-validation-suite.mjs.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {performance} from 'node:perf_hooks';
import {createServer} from 'vite';
// Node 22 has no native `Temporal` (unflagged in Node 26 / ES2026). The
// vitest run installs the polyfill via test/setup.ts; this script loads the
// same suites OUTSIDE vitest, so it must install it itself — the Temporal
// cases' getSamples / emitted runtime code reference `globalThis.Temporal`.
import {Temporal} from 'temporal-polyfill';
if (typeof globalThis.Temporal === 'undefined') {
  globalThis.Temporal = Temporal;
}

import runtypesPlugin from '../packages/vite-plugin-runtypes/dist/index.js';
import {ResolverClient} from '../packages/vite-plugin-runtypes/dist/resolver-client.js';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
// Suite selection — `--suite serialization` (default) or `--suite format-serialization`.
// Both use the SerializationCase shape (format-serialization re-uses it).
const SUITE_CONFIGS = {
  serialization: {dir: 'serialization', exportConst: 'SERIALIZATION_SPEC'},
  'format-serialization': {dir: 'format-serialization', exportConst: 'FORMAT_SERIALIZATION_SUITE'},
};
const suiteArgIndex = process.argv.indexOf('--suite');
const SUITE = suiteArgIndex >= 0 ? process.argv[suiteArgIndex + 1] : 'serialization';
const SUITE_CFG = SUITE_CONFIGS[SUITE];
if (!SUITE_CFG) {
  process.stderr.write(`unknown --suite '${SUITE}' (known: ${Object.keys(SUITE_CONFIGS).join(', ')})\n`);
  process.exit(1);
}
const SUITE_DIR = path.join(REPO_ROOT, 'packages/ts-go-run-types/test/suites', SUITE_CFG.dir);
const SUITE_PATH = path.join(SUITE_DIR, 'index.ts');
const PACKAGE_ROOT = path.join(REPO_ROOT, 'packages/ts-go-run-types');
const BIN = path.join(REPO_ROOT, 'bin/ts-go-run-types');
const OUT_PATH = path.join(REPO_ROOT, `gendocs/${SUITE}-suite.json`);
const MD_PATH = path.join(REPO_ROOT, `gendocs/${SUITE}-suite.md`);
const FN_FIELDS = ['cloneEncoder', 'schemaEncoder', 'mutateEncoder', 'directEncoder', 'stripDecoder', 'preserveDecoder'];

// One API descriptor per measured shape. Three encoders cover the
// JsonEncoderStrategy axis exposed by createJsonEncoder:
//   clone  → strategy='clone'  (pjs — shape-derived, strips by construction; default)
//   mutate → strategy='mutate' (pj — in place, preserves extras)
//   direct → strategy='direct' (sj — single-pass stringify)
// Two decoders cover the JsonDecoderStrategy axis (strip / preserve).
const APIS = [
  {key: 'clone', kind: 'encode', factory: 'cloneEncoder'},
  {key: 'mutate', kind: 'encode', factory: 'mutateEncoder'},
  {key: 'direct', kind: 'encode', factory: 'directEncoder'},
  {key: 'strip-decode', kind: 'decode', factory: 'stripDecoder'},
  {key: 'preserve-decode', kind: 'decode', factory: 'preserveDecoder'},
];

// Workload knobs. Tune at the top — no CLI flags for now.
const OPS_CYCLES = 10;
const OPS_ITERS = 1_000;
const OPS_WARMUP = 50;
const COMPILE_CYCLES = 3;

// Ambient overlay so the synthetic compile-pass files can import the marker
// package without resolving a real package.json. Mirrors the validation
// suite's RUNTYPES_DTS, extended with the JSON serializer signatures.
const RUNTYPES_DTS = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __mionCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __mionInjectTypeFnArgsBrand?: T; readonly __mionInjectTypeFnArgsFn?: Fn};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export interface ValidateOptions {
    noLiterals?: boolean;
    noIsArrayCheck?: boolean;
  }
  export type ValidateFn = (value: unknown) => boolean;
  export function createValidate<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): ValidateFn;
  export function createGetValidationErrors<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'verr'>): (value: unknown, path?: unknown[], errors?: unknown[]) => unknown[];
  export type JsonEncoderOptions = {strategy?: 'clone' | 'mutate' | 'direct'};
  export type JsonDecoderOptions = {strategy?: 'strip' | 'preserve'};
  export function createJsonEncoder<T>(val?: T, options?: CompTimeFnArgs<JsonEncoderOptions>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (value: unknown) => string | undefined;
  export function createJsonDecoder<T>(val?: T, options?: CompTimeFnArgs<JsonDecoderOptions>, id?: InjectTypeFnArgs<T, 'jsonDecoder'>): (serialized: string) => unknown;
  export function createBinaryEncoder<T>(val?: T, options?: any, id?: InjectTypeFnArgs<T, 'tb'>): (value: unknown) => unknown;
  export function createBinaryDecoder<T>(val?: T, options?: any, id?: InjectTypeFnArgs<T, 'fb'>): (input: unknown) => unknown;
}
`;

// UPPER_SNAKE group name -> PascalCase data-file basename ('CIRCULAR_REFS' -> 'CircularRefs').
function groupToFile(group) {
  const pascal = group
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
  // Resolve case-insensitively against the suite dir — group keys flatten
  // word boundaries ('DATETIME' would otherwise miss DateTime.ts).
  const wanted = `${pascal.toLowerCase()}.ts`;
  const actual = fs.readdirSync(SUITE_DIR).find((name) => name.toLowerCase() === wanted);
  return actual ? actual.slice(0, -3) : pascal;
}

// The suite is split one file per group under SUITE_DIR, so the body extractor
// runs once per group file — the barrel index.ts only re-exports imported
// identifiers, which the Go extractor (a single object-literal walker) can't
// see. Results merge into the {GROUP: {caseKey: {field: body}}} shape the rest
// of the script consumes.
function runGoExtractor(groups) {
  const bodies = {};
  for (const group of groups) {
    const groupFile = path.join(SUITE_DIR, `${groupToFile(group)}.ts`);
    const res = spawnSync('go', ['run', './cmd/extract-fn-bodies', '--file', groupFile, '--identifier', group], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    if (res.error) {
      process.stderr.write(`go run failed to launch: ${res.error.message}\n`);
      process.exit(1);
    }
    if (res.status !== 0) {
      process.stderr.write(res.stderr || '');
      process.exit(res.status || 1);
    }
    bodies[group] = JSON.parse(res.stdout);
  }
  return bodies;
}

function ensureBinary() {
  if (!fs.existsSync(BIN)) {
    process.stderr.write(`ts-go-run-types binary not found at ${BIN}\n`);
    process.stderr.write(`build it with: go build -o bin/ts-go-run-types ./cmd/ts-go-run-types\n`);
    process.exit(1);
  }
}

// Load the suite WITH the runtypes plugin active so the marker scanner +
// RT cache populate before we exercise any factory.
async function loadSuiteWithPlugin() {
  const server = await createServer({
    root: REPO_ROOT,
    configFile: false,
    // watch: null disables chokidar. Without this, vite walks `third_party/`
    // (which holds the tsgo + TypeScript test baseline trees) and exhausts
    // the OS file-watcher quota.
    server: {middlewareMode: true, watch: null},
    appType: 'custom',
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    optimizeDeps: {noDiscovery: true},
    logLevel: 'error',
    plugins: [
      runtypesPlugin({
        binary: BIN,
        cwd: PACKAGE_ROOT,
        tsconfig: 'tsconfig.test.json',
      }),
    ],
  });
  try {
    const mod = await server.ssrLoadModule(SUITE_PATH);
    return mod[SUITE_CFG.exportConst];
  } finally {
    await server.close();
  }
}

function statsOf(samples) {
  if (!samples || samples.length === 0) return undefined;
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return {
    mean: roundSig(mean),
    stddev: roundSig(stddev),
    min: roundSig(Math.min(...samples)),
    max: roundSig(Math.max(...samples)),
  };
}

function roundSig(x) {
  if (!Number.isFinite(x)) return x;
  if (Math.abs(x) >= 1000) return Math.round(x);
  return Math.round(x * 1000) / 1000;
}

// One ops/sec measurement = `iters` fn calls timed, repeated `cycles` times.
// Each call indexes into the pre-cloned pool so per-iter work mirrors what
// the timed user sees but the pool prep cost sits outside the timed window.
function benchOpsPerSecPooled(fn, pool, cycles, iters, warmup) {
  let idx = 0;
  for (let i = 0; i < warmup; i++) {
    fn(pool[idx % pool.length]);
    idx += 1;
  }
  const out = [];
  for (let c = 0; c < cycles; c++) {
    const start = performance.now();
    for (let i = 0; i < iters; i++) {
      fn(pool[idx % pool.length]);
      idx += 1;
    }
    const elapsed = performance.now() - start;
    out.push(iters / (elapsed / 1000));
  }
  return out;
}

// Builds a pool of `count` fresh sample values for the given case. Calls
// case.getTestData() repeatedly so each pool entry is its own freshly-
// constructed object — required for the unsafe encode path, which
// mutates the value in place. `selectValues` extracts the source array
// from each getTestData() call (caller picks `values` or
// `getTestDataForStringify().values`).
function buildPool(caseObj, selectValues, count) {
  const pool = new Array(count);
  for (let i = 0; i < count; i++) {
    const got = selectValues(caseObj);
    if (!Array.isArray(got) || got.length === 0) {
      throw new Error(`empty values array from getTestData on ${caseObj.title}`);
    }
    pool[i] = got[i % got.length];
  }
  return pool;
}

// Same as buildPool but rotates through `indices` into the freshly-built
// values array. Each pool entry is its own freshly-constructed object so
// in-place mutation by the encode path doesn't leak across iterations.
function buildPoolFromIndices(caseObj, selectValues, count, indices) {
  const pool = new Array(count);
  for (let i = 0; i < count; i++) {
    const got = selectValues(caseObj);
    const idx = indices[i % indices.length];
    pool[i] = got[idx];
  }
  return pool;
}

// Pre-encode each pool entry with `stringify`. Returns parallel JSON
// strings used to seed the decode bench (which then re-parses + restores
// per iter; sharing the JSON strings is fine because parse always emits
// fresh objects). Filters out null/undefined stringify results so the
// decode pool is never empty.
function buildEncodedPool(stringify, pool) {
  const encoded = [];
  for (const v of pool) {
    const s = stringify(v);
    if (typeof s === 'string') encoded.push(s);
  }
  if (encoded.length === 0) {
    throw new Error('stringify returned no usable JSON strings for the encode pool');
  }
  return encoded;
}

// Cap iters for cases whose first-sample byte size exceeds the threshold,
// so the pre-allocated pool stays under a few MB.
const LARGE_SAMPLE_BYTES = 100 * 1024;
const LARGE_ITERS = 200;
function pickIters(sample) {
  try {
    const s = JSON.stringify(sample, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    if (typeof s === 'string' && s.length > LARGE_SAMPLE_BYTES) return LARGE_ITERS;
  } catch {
    // Inputs that JSON-fail (functions, symbols, recursive) — fall through.
  }
  return OPS_ITERS;
}

// Phase 3 — per-case runtime metrics across all six APIs. Skips
// throwsAtCompile cases entirely (factory invocation throws — no point
// benching). Each api's entry carries `{pass, opsPerSec}`.
async function runRuntimePhase(suite) {
  const totalCases = Object.values(suite).reduce((n, cs) => n + Object.keys(cs).length, 0);
  const metrics = {};
  let cases = 0;
  let fnsRun = 0;
  let failedCases = [];
  const phaseStart = performance.now();
  for (const [category, casesObj] of Object.entries(suite)) {
    metrics[category] = {};
    for (const [caseKey, caseObj] of Object.entries(casesObj)) {
      cases += 1;
      progress('runtime', cases, totalCases, phaseStart, `${category}.${caseKey}`);
      if (caseObj.throwsAtCompile) continue;
      // jsonStringifyThrows cases produce values JSON.stringify can't
      // handle — the encode bench would throw mid-loop. Skip them; the
      // round-trip suite already documents the throw semantic.
      if (caseObj.jsonStringifyThrows) continue;
      const perApi = {};
      for (const api of APIS) {
        const result = benchOneApi(caseObj, api);
        if (result == null) continue;
        perApi[api.key] = result;
        fnsRun += 1;
        if (!result.pass) failedCases.push(`${category}.${caseKey}.${api.key}`);
      }
      if (Object.keys(perApi).length > 0) metrics[category][caseKey] = perApi;
    }
  }
  progressEnd('runtime');
  if (failedCases.length > 0) {
    process.stderr.write(`note: ${failedCases.length} (case,api) pair(s) reported pass:false:\n`);
    for (const id of failedCases.slice(0, 20)) process.stderr.write(`  - ${id}\n`);
    if (failedCases.length > 20) process.stderr.write(`  ... (+${failedCases.length - 20} more)\n`);
  }
  return {metrics, cases, fnsRun};
}

// Runs the round-trip pass/fail check + benches one (case, api) pair.
// Returns null when the api factory throws at lookup or the api's value
// pool is empty.
function benchOneApi(caseObj, api) {
  // Each api always builds its OWN pool from getTestData() so encode-path
  // mutation across runs never leaks. The `direct` encoder can optionally
  // use getTestDataForStringify when present (single-pass stringifyJson
  // handles the some-broad-types samples differently than the
  // prepareForJson family).
  const useStringifyData = api.factory === 'directEncoder' && typeof caseObj.getTestDataForStringify === 'function';
  const selectValues = useStringifyData ? (c) => c.getTestDataForStringify().values : (c) => c.getTestData().values;

  // First fetch a single sample to size the pool (large shapes get a
  // smaller pool to bound memory).
  let firstSample;
  try {
    const first = selectValues(caseObj);
    if (!Array.isArray(first) || first.length === 0) return null;
    firstSample = first[0];
  } catch (err) {
    process.stderr.write(`warn: getTestData() threw on ${caseObj.title}: ${err.message}\n`);
    return null;
  }
  const iters = pickIters(firstSample);
  const poolSize = iters * OPS_CYCLES + OPS_WARMUP;

  let factoryFn;
  try {
    factoryFn = caseObj[api.factory]();
  } catch (err) {
    // Some atomic cases legitimately throw at factory time (never type
    // already gated above, but defensive).
    return {pass: false, error: `factory threw: ${err.message}`};
  }
  if (typeof factoryFn !== 'function') return null;

  if (api.kind === 'encode') {
    // Probe every distinct sample in the case's values array once on a
    // throwaway copy; collect indices that survive. The bench pool then
    // only draws from surviving indices so a single bigint-in-`any`
    // sample doesn't crash the loop mid-flight. (For `any`-typed
    // cases the RT emits a raw JSON.stringify(v) and bigint root
    // values throw — those samples are not what the bench is
    // characterising.)
    let surviving;
    try {
      const sourceArray = selectValues(caseObj);
      surviving = [];
      for (let i = 0; i < sourceArray.length; i++) {
        try {
          factoryFn(selectValues(caseObj)[i]);
          surviving.push(i);
        } catch {
          // skip
        }
      }
    } catch (err) {
      return {pass: false, error: `probe failed: ${err.message}`};
    }
    if (surviving.length === 0) return {pass: false, error: 'no samples survived probe'};
    let pool;
    try {
      pool = buildPoolFromIndices(caseObj, selectValues, poolSize, surviving);
    } catch (err) {
      return {pass: false, error: `pool build failed: ${err.message}`};
    }
    const pass = roundTripSanity(caseObj, api, pool[0]);
    const runs = benchOpsPerSecPooled(factoryFn, pool, OPS_CYCLES, iters, OPS_WARMUP);
    return {pass, opsPerSec: statsOf(runs)};
  }
  // Decode path — pre-encode the pool, then time JSON.parse + restore.
  // safeAdapterStringifyJsonNotParseable cases produce JSON the parser
  // can't handle (e.g. "Infinity") — skip the decode bench entirely;
  // the bench is about steady-state speed, not error handling.
  if (caseObj.safeAdapterStringifyJsonNotParseable) return null;
  let encodedPool;
  try {
    // Use the clone (default) encoder to produce the pre-encoded JSON
    // pool for decode benching. Pure-function shape, no mutation, strips
    // by construction — the wire shape decoders expect.
    const stringify = caseObj.cloneEncoder();
    const encodePool = buildPool(caseObj, selectValues, poolSize);
    encodedPool = buildEncodedPool(stringify, encodePool);
    // Filter to entries the decoder can actually parse + restore. Drops
    // edge cases like roundTripBestEffort samples where stringify
    // produced something JSON.parse rejects.
    encodedPool = encodedPool.filter((s) => {
      try {
        // Decoders take the JSON STRING (they parse internally).
        factoryFn(s);
        return true;
      } catch {
        return false;
      }
    });
    if (encodedPool.length === 0) return null;
  } catch (err) {
    return {pass: false, error: `decode pool build failed: ${err.message}`};
  }
  const decodeFn = (s) => factoryFn(s);
  const pass = roundTripSanity(caseObj, api, encodedPool[0], decodeFn);
  const runs = benchOpsPerSecPooled(decodeFn, encodedPool, OPS_CYCLES, iters, OPS_WARMUP);
  return {pass, opsPerSec: statsOf(runs)};
}

// Single-shot sanity check that the api fn returns something at all.
// Intentionally loose — full correctness is covered by
// serializationRoundTrip*.test.ts; this only catches "encoder silently
// produced undefined for every input" type regressions.
function roundTripSanity(caseObj, api, sample, overrideFn) {
  try {
    if (overrideFn) {
      const out = overrideFn(sample);
      return out !== undefined;
    }
    if (api.kind === 'encode') {
      const encode = caseObj[api.factory]();
      const out = encode(deepClone(sample));
      return typeof out === 'string';
    }
  } catch {
    return false;
  }
  return false;
}

function deepClone(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(deepClone);
  const out = {};
  for (const k of Object.keys(value)) out[k] = deepClone(value[k]);
  return out;
}

// Phase 4 — compile-time scan + pure-TS compile per (case, api).
// Skips throwsAtCompile. Each cycle measures BOTH timings against a
// fresh Program (no shared checker warmth):
//
//   - reset + setSources  → Program allocated, tsgo bind runs
//   - tsCompile           → tsgo Emit() (full typecheck + emit)
//   - reset + setSources  → fresh Program (drops tsCompile's warm checker)
//   - scanFiles           → marker scan + cache emit on a cold Program
//
// Without the second reset+setSources, scanFiles would inherit the
// warm checker tsCompile populated and compileMs would be artificially
// low. In production tsgo and our binary run as separate processes, so
// scanFiles ALWAYS starts cold — the bench mirrors that.
async function runCompilePhase(metrics, bodies) {
  const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true});
  const overlayDts = {__bench__: 'runtypes.d.ts', body: RUNTYPES_DTS};
  // Suite-scoped dump dir (gendocs/cases is shared across suites). Wipe only ours.
  const casesDir = path.join(REPO_ROOT, 'gendocs/cases', SUITE);
  fs.rmSync(casesDir, {recursive: true, force: true});
  fs.mkdirSync(casesDir, {recursive: true});
  let modulesWritten = 0;
  const units = [];
  for (const [category, caseBodies] of Object.entries(bodies)) {
    for (const [caseKey, byApi] of Object.entries(caseBodies)) {
      for (const api of APIS) {
        if (typeof byApi?.[api.factory] === 'string') units.push({category, caseKey, api, body: byApi[api.factory]});
      }
    }
  }
  let totalRpcs = 0;
  const startWall = performance.now();
  let doneUnits = 0;
  try {
    for (const {category, caseKey, api, body} of units) {
      doneUnits += 1;
      progress('compile', doneUnits, units.length, startWall, `${category}.${caseKey}.${api.key}`);
      metrics[category] ??= {};
      const relpath = `__bench__/${safe(category)}__${safe(caseKey)}__${api.key}.ts`;
      const synth = buildSynthetic(body);
      const sourcesMap = {[overlayDts.__bench__]: overlayDts.body, [relpath]: synth};
      const compileTimes = [];
      const tsCompileTimes = [];
      for (let c = 0; c < COMPILE_CYCLES; c++) {
        // tsCompile cycle on a fresh Program.
        await client.reset();
        await client.setSources(sourcesMap);
        tsCompileTimes.push(await client.tsCompile());
        // Fresh Program again so scanFiles doesn't inherit tsCompile's
        // warm checker — this drops the tsgo Program and its bound state.
        await client.reset();
        await client.setSources(sourcesMap);
        const scanStart = performance.now();
        await client.scanFiles([relpath], {includeEntryModules: true});
        compileTimes.push(performance.now() - scanStart);
        totalRpcs += 2;
      }
      metrics[category][caseKey] ??= {};
      metrics[category][caseKey][api.key] ??= {};
      metrics[category][caseKey][api.key].compileMs = statsOf(compileTimes);
      metrics[category][caseKey][api.key].tsCompileMs = statsOf(tsCompileTimes);

      // Dump the generated modules once per case — the 'clone' strategy is the
      // type-first default (`createJsonEncoder<T>()`), the doc "pure type"
      // representative. Untimed extra scan; the synth file is the same shape.
      if (api.key === 'clone') {
        await client.reset();
        await client.setSources(sourcesMap);
        const dumpResp = await client.scanFiles([relpath], {includeEntryModules: true});
        totalRpcs += 1;
        modulesWritten += writeCaseDump(casesDir, category, caseKey, dumpResp);
      }
    }
  } finally {
    client.close();
  }
  progressEnd('compile');
  return {totalRpcs, modulesWritten, wallMs: performance.now() - startWall};
}

// Concatenate the daemon-rendered entry modules for one case into a single
// generated.js under gendocs/cases/serialization/<CAT>__<case>/. The website
// transform reads every .js in the dir and lifts the JIT function bodies out.
function writeCaseDump(casesDir, category, caseKey, resp) {
  const entries = Object.entries(resp.entryModules ?? {}).filter(([, src]) => typeof src === 'string' && src.length > 0);
  if (entries.length === 0) return 0;
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dir = path.join(casesDir, `${safe(category)}__${safe(caseKey)}`);
  fs.mkdirSync(dir, {recursive: true});
  const parts = [];
  for (const [basename, source] of entries) {
    parts.push(`// === virtual:rt/${basename}.js ===`);
    parts.push(source.endsWith('\n') ? source.slice(0, -1) : source);
    parts.push('');
  }
  fs.writeFileSync(path.join(dir, 'generated.js'), parts.join('\n'));
  return 1;
}

// Wraps the extracted factory body in an arrow probe. The body is the
// RHS of a thunk like `() => createJsonEncoder<X>(...)`, so the
// synthetic file imports both encoder + decoder constructors.
function buildSynthetic(body) {
  return `import {createJsonEncoder, createJsonDecoder} from '@mionjs/ts-go-run-types';\nconst _probe = () => {\n${body}\n};\n`;
}

function safe(s) {
  return String(s).replace(/[^A-Za-z0-9_]/g, '_');
}

// Markdown renderer. One table per category. Per case: title, then
// three pairs of (baseline, flat, ratio) columns for encode / stringify
// / decode. Speedup ratio = baseline / flat (> 1 means flat is faster).
function renderMarkdown(out) {
  const lines = [];
  lines.push('# Serialization suite');
  lines.push('');
  lines.push(
    'Generated from `SERIALIZATION_SPEC` in `packages/ts-go-run-types/test/suites/serialization/`. ' +
      'Full per-case metrics (including compile-time scanFiles latency and pure-TS compile time) live in `serialization-suite.json`. ' +
      'All ops/sec columns are absolute (no ratios). `ts-compile` measures pure tsgo typecheck + emit on the synthetic case file; ' +
      '`compile` measures the ts-go-run-types marker scan + cache emit. The two phases run sequentially in a real build, not nested.'
  );
  lines.push('');
  // Column order: title, ts-compile (ms), compile (ms), then one ops/sec
  // column per APIS entry in the order declared.
  for (const [category, cases] of Object.entries(out)) {
    lines.push(`## ${category}`);
    lines.push('');
    lines.push('<table>');
    lines.push('<thead><tr>');
    lines.push('<th>title</th>');
    lines.push('<th align="right">ts-compile (ms)</th>');
    lines.push('<th align="right">compile (ms)</th>');
    for (const api of APIS) {
      lines.push(`<th align="right">${htmlEscape(api.key)} ops/sec</th>`);
    }
    lines.push('</tr></thead>');
    lines.push('<tbody>');
    for (const [caseKey, record] of Object.entries(cases)) {
      const title = record.title ?? caseKey;
      const m = record.metrics ?? {};
      // ts-compile and compile are per-source-file — pick the first
      // non-null value across the APIs (they're rendered against the
      // same synthetic file). The compile column reuses each API's own
      // compileMs (entry collection is demand-driven per probe).
      let tsCompile = null;
      let compile = null;
      for (const api of APIS) {
        const apiMetrics = m[api.key];
        if (apiMetrics) {
          if (tsCompile == null && apiMetrics.tsCompileMs?.mean != null) tsCompile = apiMetrics.tsCompileMs.mean;
          if (compile == null && apiMetrics.compileMs?.mean != null) compile = apiMetrics.compileMs.mean;
        }
      }
      lines.push('<tr>');
      lines.push(`<td>${htmlEscape(title)}</td>`);
      lines.push(`<td align="right">${fmtNum(tsCompile)}</td>`);
      lines.push(`<td align="right">${fmtNum(compile)}</td>`);
      for (const api of APIS) {
        const ops = m[api.key]?.opsPerSec?.mean ?? null;
        lines.push(`<td align="right">${fmtNum(ops)}</td>`);
      }
      lines.push('</tr>');
    }
    lines.push('</tbody>');
    lines.push('</table>');
    lines.push('');
  }
  return lines.join('\n');
}

const compactNumberFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
function fmtNum(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return compactNumberFormat.format(n);
}
function fmtRatio(r) {
  if (r == null || !Number.isFinite(r)) return '—';
  return r.toFixed(2);
}

function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildOutput(suite, bodies, metrics) {
  const out = {};
  let totalCategories = 0;
  let totalCases = 0;
  let totalBodies = 0;
  for (const [category, cases] of Object.entries(suite)) {
    out[category] = {};
    totalCategories += 1;
    for (const [caseKey, caseObj] of Object.entries(cases)) {
      totalCases += 1;
      const record = {};
      if (typeof caseObj.title === 'string') record.title = caseObj.title;
      if (typeof caseObj.description === 'string') record.description = caseObj.description;
      if (caseObj.serializeNotes !== undefined) record.serializeNotes = caseObj.serializeNotes;
      if (caseObj.throwsAtCompile) record.throwsAtCompile = true;
      if (caseObj.jsonStringifyThrows) record.jsonStringifyThrows = true;
      if (caseObj.roundTripBestEffort) record.roundTripBestEffort = true;
      for (const fnField of FN_FIELDS) {
        if (typeof caseObj[fnField] !== 'function') continue;
        const body = bodies?.[category]?.[caseKey]?.[fnField];
        if (typeof body !== 'string') continue;
        record[fnField] = body;
        totalBodies += 1;
      }
      const caseMetrics = metrics?.[category]?.[caseKey];
      if (caseMetrics && Object.keys(caseMetrics).length > 0) record.metrics = caseMetrics;
      out[category][caseKey] = record;
    }
  }
  return {out, totalCategories, totalCases, totalBodies};
}

async function main() {
  ensureBinary();

  const t1 = performance.now();
  const suite = await loadSuiteWithPlugin();
  process.stdout.write(`loaded SERIALIZATION_SPEC via vite + runtypes plugin (${ms(t1)})\n`);

  const t0 = performance.now();
  const bodies = runGoExtractor(Object.keys(suite));
  process.stdout.write(`extracted bodies (${ms(t0)})\n`);

  const t2 = performance.now();
  const {metrics, cases, fnsRun} = await runRuntimePhase(suite);
  process.stdout.write(`ran runtime ops/sec on ${cases} cases × ${fnsRun} api invocations (${ms(t2)})\n`);

  const t3 = performance.now();
  const {totalRpcs, modulesWritten, wallMs} = await runCompilePhase(metrics, bodies);
  process.stdout.write(
    `ran compile pass — ${totalRpcs} RPCs, ${COMPILE_CYCLES} cycles per (case,api), ` +
      `${modulesWritten} cache modules dumped to gendocs/cases/${SUITE}/ (${ms(t3)})\n`
  );
  void wallMs;

  const {out, totalCategories, totalCases, totalBodies} = buildOutput(suite, bodies, metrics);
  fs.mkdirSync(path.dirname(OUT_PATH), {recursive: true});
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(MD_PATH, renderMarkdown(out));
  process.stdout.write(
    `wrote ${path.relative(REPO_ROOT, OUT_PATH)} + ${path.relative(REPO_ROOT, MD_PATH)} — ${totalCategories} categories, ${totalCases} cases, ${totalBodies} function bodies (total ${ms(t0)})\n`
  );
}

function ms(start) {
  const elapsed = performance.now() - start;
  if (elapsed < 1000) return `${Math.round(elapsed)}ms`;
  return `${(elapsed / 1000).toFixed(1)}s`;
}

const progressLastDecile = new Map();
function progress(label, current, total, startTime, detail) {
  const pct = total > 0 ? (current * 100) / total : 100;
  const decile = Math.floor(pct / 10);
  if (decile <= (progressLastDecile.get(label) ?? -1)) return;
  progressLastDecile.set(label, decile);
  const elapsed = (performance.now() - startTime) / 1000;
  const rate = current > 0 ? current / elapsed : 0;
  const remaining = rate > 0 ? (total - current) / rate : 0;
  process.stdout.write(
    `[${label}] ${decile * 10}% (${current}/${total}) — ` +
      `${formatDur(elapsed)} elapsed, ~${formatDur(remaining)} left ` +
      `(${rate.toFixed(1)}/s)${detail ? ` — ${detail}` : ''}\n`
  );
}
function progressEnd(label) {
  progressLastDecile.delete(label);
}
function formatDur(secs) {
  if (!Number.isFinite(secs)) return '?';
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.round(secs - m * 60);
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

await main();
