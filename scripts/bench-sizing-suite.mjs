#!/usr/bin/env node
// Throughput of the FULL serialization suite's binary round-trip under each of the
// three buffer-sizing modes — 'dynamic' (default), 'precalculate' (measure pass →
// exact alloc), and 'initial' (caller-fixed buffer, no grow). Sizing only affects
// ENCODE; decode + on-wire bytes are identical, so encode ops/sec is the only axis
// compared (bytes are asserted equal across modes as a sanity check).
//
// The mode is selected via the PUBLIC setDefaultBinarySizing() global default (a
// per-call {sizing} option would override it). The suite's binaryEncoder thunks pass
// no options, so they pick up whatever default is set right before the thunk is
// invoked. For 'initial' the buffer is fixed to the case's largest encoded size
// (found during the dynamic probe), so it never overflows.
//
//   node scripts/bench-sizing-suite.mjs            # full
//   BENCH_QUICK=1 node scripts/bench-sizing-suite.mjs   # fast + noisy

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {performance} from 'node:perf_hooks';
import {createServer} from 'vite';

if (typeof globalThis.Temporal === 'undefined') {
  try {
    ({Temporal: globalThis.Temporal} = await import('temporal-polyfill'));
  } catch {
    process.stderr.write('Temporal is unavailable: run on Node >= 26, or install temporal-polyfill.\n');
    process.exit(1);
  }
}

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const PACKAGE_ROOT = path.join(REPO_ROOT, 'packages/ts-runtypes');
const SUITE_DIR = path.join(PACKAGE_ROOT, 'test/suites/serialization');
const SUITE_PATH = path.join(SUITE_DIR, 'index.ts');
const BINARY_MODULE = path.join(PACKAGE_ROOT, 'src/createRTFBinary.ts');
const BIN = path.join(REPO_ROOT, 'bin/ts-runtypes');
const PLUGIN_ENTRY = path.join(REPO_ROOT, 'packages/runtypes-devtools/dist/vite.js');
const OUT_JSON = path.join(REPO_ROOT, 'bench-sizing-results.json');

const QUICK = process.env.BENCH_QUICK === '1';
const OPS_CYCLES = QUICK ? 2 : 8;
const OPS_ITERS = QUICK ? 100 : 800;
const OPS_WARMUP = QUICK ? 10 : 50;
const LARGE_SAMPLE_BYTES = 100 * 1024;
const LARGE_ITERS = QUICK ? 25 : 150;

const MODES = ['dynamic', 'precalculate', 'initial'];

// ── timing helpers (ported from gen-serialization-bench.mjs) ──
function roundSig(x) {
  if (!Number.isFinite(x)) return x;
  return Math.abs(x) >= 1000 ? Math.round(x) : Math.round(x * 1000) / 1000;
}
function opsOf(samples) {
  if (!samples || samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return roundSig(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}
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
    out.push(iters / ((performance.now() - start) / 1000));
  }
  return out;
}
function byteLengthOf(encoded) {
  if (encoded == null) return null;
  if (typeof encoded === 'string') return Buffer.byteLength(encoded, 'utf8');
  if (encoded.byteLength != null) return encoded.byteLength;
  if (encoded.length != null) return encoded.length;
  return null;
}
function pickIters(sample) {
  try {
    const text = JSON.stringify(sample, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    if (typeof text === 'string' && text.length > LARGE_SAMPLE_BYTES) return LARGE_ITERS;
  } catch {
    /* bigint-at-root / functions / cycles */
  }
  return OPS_ITERS;
}
function binaryValues(caseObj) {
  return (caseObj.getBinaryTestData ?? caseObj.getTestDataForStringify ?? caseObj.getTestData)().values;
}
function buildPool(selectValues, count, indices) {
  const pool = new Array(count);
  for (let i = 0; i < count; i++) pool[i] = selectValues()[indices[i % indices.length]];
  return pool;
}
function geomean(xs) {
  const pos = xs.filter((x) => x > 0 && Number.isFinite(x));
  return pos.length === 0 ? 0 : Math.exp(pos.reduce((s, x) => s + Math.log(x), 0) / pos.length);
}
function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n.toFixed(0)}`;
}
function pct(ratio) {
  return `${ratio >= 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(1)}%`;
}

// Measure encode ops/sec for one case in all three modes. `setMode(sizing, size?)`
// flips the global default; the encoder captures it at creation, so we set the mode
// then build that mode's encoder. Returns null when the case has no binary round-trip.
function measureCase(caseObj, setMode) {
  const encThunk = caseObj.binaryEncoder;
  const decThunk = caseObj.binaryDecoder;
  if (encThunk === 'not-supported' || decThunk === 'not-supported') return null;

  const selectValues = () => binaryValues(caseObj);
  let decode;
  let probeEncode;
  try {
    setMode('dynamic');
    probeEncode = encThunk();
    decode = decThunk();
  } catch {
    return null;
  } finally {
    setMode();
  }
  if (typeof probeEncode !== 'function' || typeof decode !== 'function') return null;

  // Which sample indices survive encode AND decode, and how big is the largest?
  let surviving = [];
  let firstSample;
  let maxBytes = 0;
  try {
    const values = selectValues();
    if (!Array.isArray(values) || values.length === 0) return null;
    firstSample = values[0];
    for (let i = 0; i < values.length; i++) {
      try {
        const wire = probeEncode(selectValues()[i]);
        if (wire == null) continue;
        decode(wire);
        surviving.push(i);
        maxBytes = Math.max(maxBytes, byteLengthOf(wire) ?? 0);
      } catch {
        /* skip */
      }
    }
  } catch {
    return null;
  }
  if (surviving.length === 0) return null;

  const iters = pickIters(firstSample);
  const poolSize = iters * OPS_CYCLES + OPS_WARMUP;
  const bytes = byteLengthOf(probeEncode(selectValues()[surviving[0]]));

  const ops = {};
  let lastWireBytes = null;
  for (const mode of MODES) {
    // 'initial' fixes the buffer to the case's largest encoded size (+ a byte of
    // slack) so no value overflows.
    if (mode === 'initial') setMode('initial', maxBytes + 1);
    else setMode(mode);
    let encode;
    try {
      encode = encThunk();
    } catch {
      setMode();
      ops[mode] = 0;
      continue;
    }
    setMode(); // reset global; encoder already captured the mode
    // Sanity: bytes identical across modes.
    try {
      const wb = byteLengthOf(encode(selectValues()[surviving[0]]));
      if (lastWireBytes != null && wb !== lastWireBytes) ops.byteMismatch = true;
      lastWireBytes = wb;
    } catch {
      /* ignore */
    }
    const pool = buildPool(selectValues, poolSize, surviving);
    ops[mode] = opsOf(benchOpsPerSecPooled(encode, pool, OPS_CYCLES, iters, OPS_WARMUP));
  }

  return {...ops, bytes, samples: surviving.length};
}

async function main() {
  if (!fs.existsSync(BIN)) {
    process.stderr.write(`ts-runtypes binary not found at ${BIN} — build it first.\n`);
    process.exit(1);
  }

  const t0 = performance.now();
  const server = await createServer({
    root: REPO_ROOT,
    configFile: false,
    server: {middlewareMode: true, watch: null},
    appType: 'custom',
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    optimizeDeps: {noDiscovery: true},
    logLevel: 'error',
    plugins: [
      (await import(url.pathToFileURL(PLUGIN_ENTRY).href)).default({
        binary: BIN,
        cwd: PACKAGE_ROOT,
        tsconfig: 'tsconfig.test.json',
        cacheDir: false,
      }),
    ],
  });

  try {
    const binMod = await server.ssrLoadModule(BINARY_MODULE);
    const setDefaultBinarySizing = binMod.setDefaultBinarySizing;
    if (typeof setDefaultBinarySizing !== 'function') throw new Error('setDefaultBinarySizing not exported from createRTFBinary.ts');
    const setMode = (sizing, bufferSize) => setDefaultBinarySizing(sizing, bufferSize);

    const suite = await server.ssrLoadModule(SUITE_PATH).then((m) => m.SERIALIZATION_SPEC);
    process.stdout.write(`loaded SERIALIZATION_SPEC via vite + runtypes plugin (${ms(t0)})\n`);

    const groups = [];
    const perCase = [];
    let byteMismatches = 0;
    const totalCases = Object.values(suite).reduce((n, cs) => n + Object.keys(cs).length, 0);
    let done = 0;
    const benchStart = performance.now();

    for (const [group, cases] of Object.entries(suite)) {
      const rows = [];
      for (const [caseKey, caseObj] of Object.entries(cases)) {
        done += 1;
        progress(done, totalCases, benchStart, `${group}.${caseKey}`);
        if (caseObj.factoryThrows) continue;
        let m = null;
        try {
          m = measureCase(caseObj, setMode);
        } catch {
          m = null;
        } finally {
          setMode();
        }
        if (!m) continue;
        if (m.byteMismatch) byteMismatches += 1;
        rows.push({group, case: caseKey, ...m});
        perCase.push({group, case: caseKey, ...m});
      }
      if (rows.length === 0) continue;
      groups.push({
        group,
        cases: rows.length,
        dynamic: geomean(rows.map((r) => r.dynamic)),
        precalculate: geomean(rows.map((r) => r.precalculate)),
        initial: geomean(rows.map((r) => r.initial)),
      });
    }
    progressEnd();

    // ── report ──
    const all = (k) => geomean(perCase.map((r) => r[k]));
    const ratio = (k) => geomean(perCase.map((r) => (r.dynamic > 0 ? r[k] / r.dynamic : 0)));

    process.stdout.write(`\n=== serialization suite: binary ENCODE ops/sec by sizing mode (${perCase.length} cases, geomean) ===\n`);
    process.stdout.write(
      `${'group'.padEnd(20)} ${'cases'.padStart(5)}   ${'dynamic'.padStart(9)} ${'precalc'.padStart(9)} ${'initial'.padStart(9)}   ${'precalc/dyn'.padStart(11)} ${'initial/dyn'.padStart(11)}\n`
    );
    for (const g of groups.sort((a, b) => a.precalculate / a.dynamic - b.precalculate / b.dynamic)) {
      process.stdout.write(
        `${g.group.padEnd(20)} ${String(g.cases).padStart(5)}   ${fmt(g.dynamic).padStart(9)} ${fmt(g.precalculate).padStart(9)} ${fmt(g.initial).padStart(9)}   ${pct(g.precalculate / g.dynamic).padStart(11)} ${pct(g.initial / g.dynamic).padStart(11)}\n`
      );
    }
    process.stdout.write(`${'-'.repeat(84)}\n`);
    process.stdout.write(
      `${'OVERALL (geomean)'.padEnd(20)} ${String(perCase.length).padStart(5)}   ${fmt(all('dynamic')).padStart(9)} ${fmt(all('precalculate')).padStart(9)} ${fmt(all('initial')).padStart(9)}   ${pct(ratio('precalculate')).padStart(11)} ${pct(ratio('initial')).padStart(11)}\n`
    );
    process.stdout.write(`\nbyte mismatches across modes: ${byteMismatches} (expected 0 — same wire format)\n`);

    fs.writeFileSync(OUT_JSON, JSON.stringify({quick: QUICK, opsCycles: OPS_CYCLES, opsIters: OPS_ITERS, groups, perCase}, null, 2));
    process.stdout.write(`\nall numbers → ${path.relative(REPO_ROOT, OUT_JSON)} (total ${ms(t0)})\n`);
  } finally {
    await server.close();
  }
}

function ms(start) {
  const elapsed = performance.now() - start;
  return elapsed < 1000 ? `${Math.round(elapsed)}ms` : `${(elapsed / 1000).toFixed(1)}s`;
}
let lastDecile = -1;
function progress(current, total, startTime, detail) {
  const decile = Math.floor((total > 0 ? (current * 100) / total : 100) / 10);
  if (decile <= lastDecile) return;
  lastDecile = decile;
  const elapsed = (performance.now() - startTime) / 1000;
  const remaining = current > 0 ? (total - current) / (current / elapsed) : 0;
  process.stdout.write(`[bench] ${decile * 10}% (${current}/${total}) — ${elapsed.toFixed(1)}s elapsed, ~${remaining.toFixed(1)}s left — ${detail}\n`);
}
function progressEnd() {
  lastDecile = -1;
}

await main();
