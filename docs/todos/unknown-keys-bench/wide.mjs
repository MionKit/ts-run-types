// Wide-object sensitivity probe: do the moltar-shape conclusions hold at 30
// flat props? Same isolation model: `node wide.mjs` spawns one process per
// (variant, profile); `node wide.mjs run <variant> <profile>` measures one.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const self = fileURLToPath(import.meta.url);
const N = 30;
const keys = Array.from({ length: N }, (_, i) => 'prop' + i);
const keySet = new Set(keys);

let hole;
function sink(v) {
  hole = v;
  if (hole === sink) throw new Error('unreachable');
}

function hUKFA(obj, ks) {
  for (const prop in obj) {
    let found = false;
    for (let j = 0; j < ks.length; j++) {
      if (ks[j] === prop) {
        found = true;
        break;
      }
    }
    if (!found) return true;
  }
  return false;
}
function gUKFA(obj, ks) {
  const unknownKeys = [];
  for (const prop in obj) {
    let found = false;
    for (let j = 0; j < ks.length; j++) {
      if (ks[j] === prop) {
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

// data makers (literal built via generated source so shapes are stable and
// monomorphic, mirroring emitted code)
const makerSrc = (extras) => {
  const props = keys.map((k, i) => `${k}: ${i % 3 === 0 ? `'s${i}'` : i}`);
  for (let e = 0; e < extras; e++) props.push(`extra${e}: 'x${e}'`);
  return `return {${props.join(',')}};`;
};
const makeDataByProfile = {
  clean: new Function(makerSrc(0)),
  dirty1: new Function(makerSrc(1)),
  dirty5: new Function(makerSrc(5)),
};

// clone literal (emitted-style declared-shape rebuild)
const cloneSrc = `return {${keys.map((k) => `${k}: v.${k}`).join(',')}};`;
const clone30 = new Function('v', cloneSrc);

const variants = {
  baseline: (v) => v,
  huk_scan: function (v) {
    return typeof v === 'object' && v !== null && hUKFA(v, keys);
  },
  huk_keyslen: function (v) {
    return Object.keys(v).length !== N;
  },
  huk_forin: function (v) {
    let n = 0;
    for (const p in v) n++;
    return n !== N;
  },
  suk: function (v) {
    const unk = gUKFA(v, keys);
    if (unk) {
      for (const k of unk) delete v[k];
    }
    return v;
  },
  uku: function (v) {
    const unk = gUKFA(v, keys);
    if (unk) {
      for (const k of unk) v[k] = undefined;
    }
    return v;
  },
  clone: clone30,
};

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function run(variantName, profile) {
  const op = variants[variantName];
  const makeData = makeDataByProfile[profile];
  // verify
  if (variantName.startsWith('huk_')) {
    if (op(makeDataByProfile.clean()) !== false) throw new Error('clean must be false');
    if (variantName !== 'huk_scan' || true) {
      if (op(makeDataByProfile.dirty1()) !== true) throw new Error('dirty1 must be true');
    }
  } else if (variantName === 'suk' || variantName === 'uku' || variantName === 'clone') {
    const cleanJson = JSON.stringify(makeDataByProfile.clean());
    if (JSON.stringify(op(makeDataByProfile.dirty5())) !== cleanJson) throw new Error('bad strip');
  }

  let acc = 0;
  const sample = (iters) => {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < iters; i++) {
      const d = makeData();
      sink(d); // input escapes like real JSON.parse output (see bench.mjs note)
      const r = op(d);
      acc += r === true ? 1 : 0;
      sink(r);
    }
    return Number(process.hrtime.bigint() - t0);
  };
  let iters = 8000;
  sample(iters);
  sample(iters);
  for (let t = 0; t < 12; t++) {
    if (sample(iters) >= 20e6 || iters >= 2e7) break;
    iters *= 2;
  }
  const nsPerOp = [];
  for (let s = 0; s < 20; s++) {
    if (globalThis.gc && s % 5 === 0) globalThis.gc();
    nsPerOp.push(sample(iters) / iters);
  }
  const med = median(nsPerOp);
  const madPct = (median(nsPerOp.map((x) => Math.abs(x - med))) / med) * 100;
  console.log(JSON.stringify({ variant: variantName, profile, nsPerOp: +med.toFixed(2), opsPerSec: Math.round(1e9 / med), madPct: +madPct.toFixed(2), acc }));
}

const [, , cmd, variant, profile] = process.argv;
if (cmd === 'run') {
  run(variant, profile);
} else {
  const results = [];
  for (const v of Object.keys(variants)) {
    for (const p of ['clean', 'dirty1', 'dirty5']) {
      const r = spawnSync('node', ['--expose-gc', self, 'run', v, p], { encoding: 'utf8' });
      if (r.status !== 0) {
        console.error(`${v} ${p} FAILED: ${r.stderr}`);
        continue;
      }
      const parsed = JSON.parse(r.stdout.trim());
      results.push(parsed);
      console.error(`${v} ${p}: ${(parsed.opsPerSec / 1e6).toFixed(1)} M ops/s (±${parsed.madPct}%)`);
    }
  }
  console.log('\n| variant | clean | dirty1 | dirty5 |');
  console.log('|---|---|---|---|');
  for (const v of Object.keys(variants)) {
    const cells = ['clean', 'dirty1', 'dirty5'].map((p) => {
      const r = results.find((x) => x.variant === v && x.profile === p);
      return r ? `${(r.opsPerSec / 1e6).toFixed(1)} M (±${r.madPct}%)` : '-';
    });
    console.log(`| ${v} | ${cells.join(' | ')} |`);
  }
}
