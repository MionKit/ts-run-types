#!/usr/bin/env node
// Generates gendocs/validation-suite.json from VALIDATION_SUITE.
//
// Pipeline:
//   1. Spawn `go run ./cmd/extract-fn-bodies` to lift the original TS source
//      text of every arrow-function body inside VALIDATION_SUITE.
//   2. Load the suite through vite's ssrLoadModule with the runtypes plugin
//      active, so `createValidate<T>()` calls resolve to real validators
//      (cache populated by the Go daemon via the plugin's transform hook).
//   3. Phase 3 — runtime pass: for each case + each API, call the
//      validator against the case's `valid` / `invalid` samples to compute
//      `pass: boolean`, then bench it to compute `{valid,invalid}OpsPerSec`.
//   4. Close the vite server; spawn a dedicated `serverMode` ResolverClient.
//      Phase 4 — compile pass: for each case + each API, wrap the body in
//      a synthetic .ts file, drive `reset + setSources + scanFiles` cycles
//      and time the `scanFiles` round-trip → `compileMs`.
//   5. Merge bodies + structure + metrics, write the JSON.
//
// Single-file orchestrator on purpose — the metrics phases share the suite
// walk + the Stats helper, splitting them across modules would just add
// indirection without trimming code.

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
import {CACHE_MODULES} from '../packages/vite-plugin-runtypes/dist/runtypes-constants.generated.js';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SUITE_DIR = path.join(REPO_ROOT, 'packages/ts-go-run-types/test/suites/validation');
const SUITE_PATH = path.join(SUITE_DIR, 'index.ts');
const PACKAGE_ROOT = path.join(REPO_ROOT, 'packages/ts-go-run-types');
const BIN = path.join(REPO_ROOT, 'bin/ts-go-run-types');
const OUT_PATH = path.join(REPO_ROOT, 'gendocs/validation-suite.json');
const MD_PATH = path.join(REPO_ROOT, 'gendocs/validation-suite.md');
const FN_FIELDS = ['validate', 'validateSchema', 'validateReflect', 'getSamples'];
const APIS = ['validate', 'validateReflect'];

// Per-kind cache selection is gone with the per-entry virtual modules:
// `includeEntryModules: true` collects every family the file's call sites
// demand — which for these synthetic createValidate-only probes is the
// validate closure (plus runtype nodes and pure fns), i.e. the same work the
// production transform performs. compileMs therefore measures the real
// per-file scan + entry collection cost.

// Workload knobs. Tune at the top — no CLI flags for now.
const OPS_CYCLES = 10;
const OPS_ITERS = 1_000;
const OPS_WARMUP = 50;
const COMPILE_CYCLES = 3;

// Ambient overlay so the synthetic compile-pass files can `import` the marker
// package without a real package.json lookup. Mirrors RUNTYPES_DTS in
// packages/vite-plugin-runtypes/test/helpers/inline.ts — createX signatures
// MUST carry the InjectTypeFnArgs marker or the scanner records no demand and
// the compile probes render zero fn entries.
const RUNTYPES_DTS = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __mionCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __mionInjectTypeFnArgsBrand?: T; readonly __mionInjectTypeFnArgsFn?: Fn};
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function reflectRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
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

// UPPER_SNAKE group name -> PascalCase data-file basename ('TEMPLATE_LITERAL' -> 'TemplateLiteral').
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

// Phase 2 — load the suite WITH the runtypes plugin active. The plugin's
// transform hook scans the suite file, spawns the daemon, and populates
// the validate cache so the validators are usable after this returns.
async function loadSuiteWithPlugin() {
  const server = await createServer({
    root: REPO_ROOT,
    configFile: false,
    // watch: null disables chokidar. Without this, vite walks `third_party/`
    // (tsgo + TypeScript test baseline trees) and exhausts the OS file-
    // watcher quota. Mirrors the same fix in export-serialization-suite.mjs.
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
    return mod.VALIDATION_SUITE;
  } finally {
    await server.close();
  }
}

// Stats over an array of numeric samples. Rounds to a precision that keeps
// the JSON diffable (integer for big numbers, 3-decimal for small ms).
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

// One ops/sec measurement = `iters` validator calls timed, repeated `cycles`
// times. Per-cycle ops/sec values are returned; the caller flattens these
// across all (sample, cycle) tuples to compute case-level Stats.
function benchOpsPerSec(fn, value, cycles, iters, warmup) {
  for (let i = 0; i < warmup; i++) fn(value);
  const out = [];
  for (let c = 0; c < cycles; c++) {
    const start = performance.now();
    for (let i = 0; i < iters; i++) fn(value);
    const elapsed = performance.now() - start;
    out.push(iters / (elapsed / 1000));
  }
  return out;
}

// Phase 3 — runtime pass/fail + ops/sec. Returns a tree of partial metrics
// (pass + valid/invalid stats) keyed by category → caseKey → api.
async function runValidationPhase(suite) {
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
      progress('validate', cases, totalCases, phaseStart, `${category}.${caseKey}`);
      const samples = caseObj.getSamples();
      const valid = Array.isArray(samples?.valid) ? samples.valid : [];
      const invalid = Array.isArray(samples?.invalid) ? samples.invalid : [];
      const perApi = {};
      for (const api of APIS) {
        if (typeof caseObj[api] !== 'function') continue;
        let validator;
        try {
          validator = await caseObj[api]();
        } catch (err) {
          process.stderr.write(`warn: ${category}.${caseKey}.${api}() threw at lookup: ${err.message}\n`);
          continue;
        }
        if (typeof validator !== 'function') {
          process.stderr.write(`warn: ${category}.${caseKey}.${api}() did not return a function\n`);
          continue;
        }
        fnsRun += 1;

        const pass = valid.every((v) => validator(v) === true) && invalid.every((v) => validator(v) === false);
        if (!pass) failedCases.push(`${category}.${caseKey}.${api}`);

        const validRuns = [];
        for (const v of valid) validRuns.push(...benchOpsPerSec(validator, v, OPS_CYCLES, OPS_ITERS, OPS_WARMUP));
        const invalidRuns = [];
        for (const v of invalid) invalidRuns.push(...benchOpsPerSec(validator, v, OPS_CYCLES, OPS_ITERS, OPS_WARMUP));

        perApi[api] = {
          pass,
          validOpsPerSec: statsOf(validRuns),
          invalidOpsPerSec: statsOf(invalidRuns),
        };
      }
      if (Object.keys(perApi).length > 0) metrics[category][caseKey] = perApi;
    }
  }
  progressEnd('validate');
  if (failedCases.length > 0) {
    process.stderr.write(`note: ${failedCases.length} case(s) reported pass:false:\n`);
    for (const id of failedCases.slice(0, 20)) process.stderr.write(`  - ${id}\n`);
    if (failedCases.length > 20) process.stderr.write(`  ... (+${failedCases.length - 20} more)\n`);
  }
  return {metrics, cases, fnsRun};
}

// Phase 4 — compile-time pass. Spawns a dedicated serverMode client and
// drives reset + setSources + scanFiles cycles per (case, api). Mutates
// `metrics` in place, adding `compileMs` to each existing api entry and
// creating new api entries for cases that had no Phase-3 metrics but do
// have a body (e.g. when Phase 3 skipped due to a validator lookup error).
async function runCompilePhase(metrics, bodies) {
  // Wipe + recreate the per-case cache-module dump dir so removed cases
  // don't leave orphan files behind.
  // Suite-scoped so each exporter wipes only its own dumps (gendocs/cases is
  // shared; validation / serialization / format suites reuse category names).
  const casesDir = path.join(REPO_ROOT, 'gendocs/cases/validation');
  fs.rmSync(casesDir, {recursive: true, force: true});
  fs.mkdirSync(casesDir, {recursive: true});

  const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true});
  const overlayDts = {__bench__: 'runtypes.d.ts', body: RUNTYPES_DTS};
  const units = [];
  for (const [category, caseBodies] of Object.entries(bodies)) {
    for (const [caseKey, byApi] of Object.entries(caseBodies)) {
      for (const api of APIS) {
        if (typeof byApi?.[api] === 'string') units.push({category, caseKey, api, body: byApi[api]});
      }
    }
  }
  let totalRpcs = 0;
  let modulesWritten = 0;
  const startWall = performance.now();
  let doneUnits = 0;
  try {
    for (const {category, caseKey, api, body} of units) {
      doneUnits += 1;
      progress('compile', doneUnits, units.length, startWall, `${category}.${caseKey}.${api}`);
      metrics[category] ??= {};
      const relpath = `__bench__/${safe(category)}__${safe(caseKey)}__${api}.ts`;
      const synth = buildSynthetic(body);
      const sourcesMap = {[overlayDts.__bench__]: overlayDts.body, [relpath]: synth};
      const compileTimes = [];
      const tsCompileTimes = [];
      for (let c = 0; c < COMPILE_CYCLES; c++) {
        // tsCompile cycle — fresh tsgo Program, full bind + typecheck + emit.
        await client.reset();
        await client.setSources(sourcesMap);
        tsCompileTimes.push(await client.tsCompile());
        // Reset between measurements so scanFiles doesn't inherit
        // tsCompile's warm checker (production runs tsc and our binary
        // as separate processes, so scanFiles always starts cold).
        await client.reset();
        await client.setSources(sourcesMap);
        const scanStart = performance.now();
        // Entry collection is demand-driven: the synthetic probe only calls
        // createValidate, so this renders the validate closure (plus runtype
        // nodes / pure fns) — the work the validation suite is about.
        await client.scanFiles([relpath], {includeEntryModules: true});
        compileTimes.push(performance.now() - scanStart);
        totalRpcs += 2;
      }
      metrics[category][caseKey] ??= {};
      metrics[category][caseKey][api] ??= {};
      metrics[category][caseKey][api].compileMs = statsOf(compileTimes);
      metrics[category][caseKey][api].tsCompileMs = statsOf(tsCompileTimes);
      // Untimed extra scan to capture the dump artifacts — the per-entry
      // virtual modules writeCaseDump groups by cache kind. Skipped after
      // the first API — the synth file is the same regardless of which call
      // shape the API uses, so the entry modules are identical and one dump
      // per case is enough.
      if (api === APIS[0]) {
        await client.reset();
        await client.setSources(sourcesMap);
        const dumpResp = await client.scanFiles([relpath], {includeEntryModules: true});
        totalRpcs += 1;
        modulesWritten += writeCaseDump(casesDir, category, caseKey, api, dumpResp);
      }
    }
  } finally {
    client.close();
  }
  progressEnd('compile');
  return {totalRpcs, modulesWritten, wallMs: performance.now() - startWall};
}

// Dumps the daemon-rendered entry modules for one (case, api) under
// gendocs/cases/<category>__<caseKey>__<api>/, grouped by cache kind
// (`runType.js`, `validate.js`, `pureFns.js`, …) with one banner per
// virtual module. The kind is sniffed off each tuple's slot 0; family tags
// map back to their CacheModules key via the generated constants mirror.
const keyByFamilyTag = Object.fromEntries(Object.entries(CACHE_MODULES).map(([key, settings]) => [settings.tag, key]));

function entryKindOf(source) {
  const match = source.match(/export const e=\[(?:'([^']+)'|(\d+))[,\]]/);
  if (!match) return 'unknown';
  if (match[1] !== undefined) return keyByFamilyTag[match[1]] ?? match[1];
  return {2: 'pureFns', 3: 'missing', 4: 'runType', 5: 'runType'}[match[2]] ?? 'unknown';
}

function writeCaseDump(casesDir, category, caseKey, api, resp) {
  const dir = path.join(casesDir, `${safe(category)}__${safe(caseKey)}`);
  fs.mkdirSync(dir, {recursive: true});
  const groups = {};
  for (const [basename, source] of Object.entries(resp.entryModules ?? {})) {
    if (typeof source !== 'string' || source.length === 0) continue;
    (groups[entryKindOf(source)] ??= []).push([basename, source]);
  }
  let n = 0;
  for (const [kind, modules] of Object.entries(groups)) {
    modules.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const parts = [];
    for (const [basename, source] of modules) {
      parts.push(`// === virtual:rt/${basename}.js ===`);
      parts.push(source.endsWith('\n') ? source.slice(0, -1) : source);
      parts.push('');
    }
    fs.writeFileSync(path.join(dir, `${kind}.js`), parts.join('\n'));
    n += 1;
  }
  return n;
}

function buildSynthetic(body) {
  return `import {createValidate} from '@mionjs/ts-go-run-types';\nconst _probe = () => {\n${body}\n};\n`;
}

function safe(s) {
  return String(s).replace(/[^A-Za-z0-9_]/g, '_');
}

// Emits a markdown summary of the suite. Per category we render an HTML
// <table> rather than a markdown pipe-table so the `validate` cell can hold
// a fenced ```ts code block — markdown parsers re-enter inline-markdown
// mode inside a <td> when there are blank lines around the fence, which
// triggers syntax highlighting on GitHub / VSCode preview / most GFM
// renderers. Only the `validate` API is shown here; full per-case metrics
// (including `validateReflect`) live in validation-suite.json.
function renderMarkdown(out) {
  const lines = [];
  lines.push('# Validation suite');
  lines.push('');
  lines.push(
    'Generated from `VALIDATION_SUITE` in `packages/ts-go-run-types/test/suites/validation/`. ' +
      'Full per-case metrics (including `validateReflect`) live in `validation-suite.json`; ' +
      'per-case rendered cache modules live under `cases/`. ' +
      '`ts-compile` measures pure tsgo (bind + typecheck + emit) on the synthetic case file; ' +
      '`compile` measures the ts-go-run-types marker scan + cache emit. ' +
      'The two phases run sequentially in a real build pipeline (TypeScript 7 has no transforms API yet), not nested.'
  );
  lines.push('');
  for (const [category, cases] of Object.entries(out)) {
    lines.push(`## ${category}`);
    lines.push('');
    lines.push('<table>');
    lines.push('<thead><tr>');
    lines.push('<th>title</th>');
    lines.push('<th align="right">ts-compile (ms)</th>');
    lines.push('<th align="right">compile (ms)</th>');
    lines.push('<th align="right">valid ops/sec</th>');
    lines.push('<th align="right">invalid ops/sec</th>');
    lines.push('<th>validate</th>');
    lines.push('</tr></thead>');
    lines.push('<tbody>');
    for (const [caseKey, record] of Object.entries(cases)) {
      const title = record.title ?? caseKey;
      const m = record.metrics?.validate;
      const tsCompileMs = m?.tsCompileMs?.mean ?? null;
      const compileMs = m?.compileMs?.mean ?? null;
      const validOps = m?.validOpsPerSec?.mean ?? null;
      const invalidOps = m?.invalidOpsPerSec?.mean ?? null;
      lines.push('<tr>');
      lines.push(`<td>${htmlEscape(title)}</td>`);
      lines.push(`<td align="right">${fmtNum(tsCompileMs)}</td>`);
      lines.push(`<td align="right">${fmtNum(compileMs)}</td>`);
      lines.push(`<td align="right">${fmtNum(validOps)}</td>`);
      lines.push(`<td align="right">${fmtNum(invalidOps)}</td>`);
      // Blank lines + fenced block re-enter markdown parsing inside this <td>.
      lines.push('<td>');
      lines.push('');
      if (typeof record.validate === 'string' && record.validate.length > 0) {
        lines.push('```ts');
        lines.push(record.validate);
        lines.push('```');
      } else {
        lines.push('_no validate thunk_');
      }
      lines.push('');
      lines.push('</td>');
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
      if (caseObj.validateNotes !== undefined) record.validateNotes = caseObj.validateNotes;
      for (const fnField of FN_FIELDS) {
        if (typeof caseObj[fnField] !== 'function') continue;
        const body = bodies?.[category]?.[caseKey]?.[fnField];
        if (typeof body !== 'string') {
          throw new Error(`missing extracted body for ${category}.${caseKey}.${fnField}`);
        }
        record[fnField] = body;
        totalBodies += 1;
      }
      const caseMetrics = metrics?.[category]?.[caseKey];
      if (caseMetrics && Object.keys(caseMetrics).length > 0) {
        record.metrics = caseMetrics;
      }
      out[category][caseKey] = record;
    }
  }
  return {out, totalCategories, totalCases, totalBodies};
}

async function main() {
  ensureBinary();

  const t1 = performance.now();
  const suite = await loadSuiteWithPlugin();
  process.stdout.write(`loaded VALIDATION_SUITE via vite + runtypes plugin (${ms(t1)})\n`);

  const t0 = performance.now();
  const bodies = runGoExtractor(Object.keys(suite));
  process.stdout.write(`extracted bodies (${ms(t0)})\n`);

  const t2 = performance.now();
  const {metrics, cases, fnsRun} = await runValidationPhase(suite);
  process.stdout.write(`ran pass/fail + ops/sec on ${cases} cases × ${fnsRun} validators (${ms(t2)})\n`);

  const t3 = performance.now();
  const {totalRpcs, modulesWritten, wallMs} = await runCompilePhase(metrics, bodies);
  process.stdout.write(
    `ran compile pass — ${totalRpcs} RPCs, ${COMPILE_CYCLES} cycles per (case,api), ` +
      `${modulesWritten} cache modules dumped to gendocs/cases/ (${ms(t3)})\n`
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

// Decile progress: one line at each 10% boundary (10%, 20%, …, 100%).
// Tracks the last printed decile per label so callers can fire on every
// iteration; we only emit when the decile crosses.
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
