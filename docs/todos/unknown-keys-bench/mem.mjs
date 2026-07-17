// Memory comparison: delete-strip (suk) vs undefined-strip (uku) vs exact
// clone. Two modes, each variant in its own child process:
//
//  - retained: build N inputs, apply the op, RETAIN the results (what a real
//    app holds after parse+strip), report settled heap bytes per object.
//    For suk/uku the retained object IS the mutated input; for clone the
//    input dies young and only the clone survives.
//  - churn: run M ops without retaining, count GC events + total GC pause via
//    PerformanceObserver, report allocations pressure as gc-count/M ops.
//
// Strings are shared closure constants, so numbers measure object STRUCTURE
// (shapes, property stores), not string payloads — same for every variant.
import { spawnSync } from 'node:child_process';
import { PerformanceObserver, constants as perfConstants } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);

let hole;
function sink(v) {
  hole = v;
  if (hole === sink) throw new Error('unreachable');
}

function gUKFA(obj, keys) {
  const unknownKeys = [];
  for (const prop in obj) {
    let found = false;
    for (let j = 0; j < keys.length; j++) {
      if (keys[j] === prop) {
        found = true;
        break;
      }
    }
    if (!found) {
      unknownKeys.push(prop);
      if (unknownKeys.length >= 10) throw new Error('too many');
    }
  }
  return unknownKeys;
}

const k7 = ['boolean', 'deeplyNested', 'longString', 'maxNumber', 'negNumber', 'number', 'string'];
const k3 = ['bool', 'foo', 'num'];

const longString = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';

const makeDataByProfile = {
  clean: () => ({
    number: 1,
    negNumber: -1,
    maxNumber: Number.MAX_VALUE,
    string: 'string',
    longString,
    boolean: true,
    deeplyNested: { foo: 'bar', num: 1, bool: false },
  }),
  dirty1: () => ({
    number: 1,
    negNumber: -1,
    maxNumber: Number.MAX_VALUE,
    string: 'string',
    longString,
    boolean: true,
    deeplyNested: { foo: 'bar', num: 1, bool: false, extraNestedAttribute: 'bar' },
    extraAttribute: 'foo',
  }),
  dirty5: () => ({
    number: 1,
    negNumber: -1,
    maxNumber: Number.MAX_VALUE,
    string: 'string',
    longString,
    boolean: true,
    deeplyNested: { foo: 'bar', num: 1, bool: false, extraNested1: 'x', extraNested2: 2 },
    extra1: 'foo',
    extra2: 42,
    extra3: true,
    extra4: 'bar',
    extra5: null,
  }),
};

const ctxFn0 = (v) => ({ foo: v.deeplyNested.foo, num: v.deeplyNested.num, bool: v.deeplyNested.bool });

const variants = {
  // retain the input untouched — reference size of the (possibly dirty) parse output
  baseline: (v) => v,
  suk: function (v) {
    const unk0 = gUKFA(v, k7);
    if (unk0) {
      for (const ky0 of unk0) delete v[ky0];
    }
    const unk1 = gUKFA(v.deeplyNested, k3);
    if (unk1) {
      for (const ky1 of unk1) delete v.deeplyNested[ky1];
    }
    return v;
  },
  uku: function (v) {
    const unk0 = gUKFA(v, k7);
    if (unk0) {
      for (const ky0 of unk0) v[ky0] = undefined;
    }
    const unk1 = gUKFA(v.deeplyNested, k3);
    if (unk1) {
      for (const ky1 of unk1) v.deeplyNested[ky1] = undefined;
    }
    return v;
  },
  clone: function (v) {
    return {
      number: v.number,
      negNumber: v.negNumber,
      maxNumber: v.maxNumber,
      string: v.string,
      longString: v.longString,
      boolean: v.boolean,
      deeplyNested: ctxFn0(v),
    };
  },
};

function settleHeap() {
  for (let i = 0; i < 5; i++) globalThis.gc();
  return process.memoryUsage().heapUsed;
}

function runRetained(variantName, profile) {
  const op = variants[variantName];
  const makeData = makeDataByProfile[profile];
  const N = 200_000;

  // JIT warmup outside the measured window
  for (let i = 0; i < 50_000; i++) sink(op(makeData()));

  const results = new Array(N).fill(null);
  const before = settleHeap();
  for (let i = 0; i < N; i++) {
    results[i] = op(makeData());
  }
  const after = settleHeap();
  const bytesPerObj = (after - before) / N;
  console.log(
    JSON.stringify({
      mode: 'retained',
      variant: variantName,
      profile,
      bytesPerObj: +bytesPerObj.toFixed(1),
      totalMB: +((after - before) / 1048576).toFixed(2),
      note: results.length === N ? undefined : 'bad',
    }),
  );
  sink(results);
}

function runChurn(variantName, profile) {
  const op = variants[variantName];
  const makeData = makeDataByProfile[profile];
  const M = 2_000_000;

  for (let i = 0; i < 100_000; i++) sink(op(makeData())); // warmup

  let gcCount = 0;
  let gcMinor = 0;
  let gcMs = 0;
  const obs = new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      gcCount++;
      gcMs += e.duration;
      if (e.detail?.kind === perfConstants.NODE_PERFORMANCE_GC_MINOR) gcMinor++;
    }
  });
  obs.observe({ entryTypes: ['gc'] });
  globalThis.gc();

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < M; i++) {
    const d = makeData();
    sink(d);
    const r = op(d);
    sink(r);
  }
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  // flush observer callbacks
  return new Promise((resolve) => {
    setTimeout(() => {
      obs.disconnect();
      console.log(
        JSON.stringify({
          mode: 'churn',
          variant: variantName,
          profile,
          ops: M,
          elapsedMs: Math.round(elapsedMs),
          opsPerSec: Math.round((M / elapsedMs) * 1000),
          gcCount,
          gcMinor,
          gcMsTotal: +gcMs.toFixed(1),
          gcMsPerMops: +((gcMs / M) * 1e6).toFixed(1),
        }),
      );
      resolve();
    }, 100);
  });
}

const [, , cmd, mode, variant, profile] = process.argv;
if (cmd === 'run') {
  if (mode === 'retained') runRetained(variant, profile);
  else await runChurn(variant, profile);
} else {
  const rows = [];
  for (const mode of ['retained', 'churn']) {
    for (const v of Object.keys(variants)) {
      for (const p of ['clean', 'dirty1', 'dirty5']) {
        if (mode === 'churn' && p === 'dirty5') continue;
        const r = spawnSync('node', ['--expose-gc', self, 'run', mode, v, p], { encoding: 'utf8' });
        if (r.status !== 0) {
          console.error(`${mode} ${v} ${p} FAILED: ${r.stderr}`);
          continue;
        }
        const parsed = JSON.parse(r.stdout.trim());
        rows.push(parsed);
        console.error(`${mode} ${v} ${p}: ok`);
      }
    }
  }
  console.log('\n## retained bytes per stripped object (200k objects, settled heap)\n');
  console.log('| variant | clean | dirty1 | dirty5 |');
  console.log('|---|---|---|---|');
  for (const v of Object.keys(variants)) {
    const cells = ['clean', 'dirty1', 'dirty5'].map((p) => {
      const r = rows.find((x) => x.mode === 'retained' && x.variant === v && x.profile === p);
      return r ? `${r.bytesPerObj} B` : '-';
    });
    console.log(`| ${v} | ${cells.join(' | ')} |`);
  }
  console.log('\n## GC churn over 2M ops (fresh input each op, results not retained)\n');
  console.log('| variant | profile | ops/s | GC events (minor) | GC ms total | GC ms per 1M ops |');
  console.log('|---|---|---|---|---|---|');
  for (const v of Object.keys(variants)) {
    for (const p of ['clean', 'dirty1']) {
      const r = rows.find((x) => x.mode === 'churn' && x.variant === v && x.profile === p);
      if (r) console.log(`| ${v} | ${p} | ${(r.opsPerSec / 1e6).toFixed(1)} M | ${r.gcCount} (${r.gcMinor}) | ${r.gcMsTotal} | ${r.gcMsPerMops} |`);
    }
  }
}
