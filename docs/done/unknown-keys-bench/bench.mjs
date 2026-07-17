// Micro-benchmarks for ts-runtypes unknown-keys improvements.
//
// Child-process mode: `node --expose-gc bench.mjs run <bench> <variant> <profile> <consume>`
// prints one JSON result line. Each (bench,variant,profile) runs in its own
// process so inline caches / hidden-class feedback never leak across variants.
//
// Emitted-code replicas are VERBATIM from the generated moltar case files:
//   validate    <- cases/ts-runtypes/src/__runtypes/types/uSW_d1lDhHV.js
//   huk current <- cases/ts-runtypes/src/__runtypes/types/IOY_d1lDhHV.js
//   clone (pjs) <- cases/ts-runtypes/src/__runtypes/types/HFX_d1lDhHV.js
//   pure fns    <- packages/ts-runtypes/src/runtypes/pure-fns-utils.ts
//   suk / uku   <- reconstructed from unknownkeys_strip.go / unknownkeys_to_undefined.go
//                  (getUnknownKeysFromArray + delete / assign-undefined loops,
//                  no object guards, required props descend unguarded)

// ---------------------------------------------------------------------------
// anti-DCE sink (same pattern as benchmarks/helpers/sink.ts)
let hole;
function sink(value) {
  hole = value;
  if (hole === sink) throw new Error('unreachable');
}

// ---------------------------------------------------------------------------
// pure fns (verbatim from pure-fns-utils.ts)
function hUKFA(obj, keys) {
  for (const prop in obj) {
    let found = false;
    for (let j = 0; j < keys.length; j++) {
      if (keys[j] === prop) {
        found = true;
        break;
      }
    }
    if (!found) return true;
  }
  return false;
}

const MAX_UNKNOWN_KEYS = 10;
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
      if (unknownKeys.length >= MAX_UNKNOWN_KEYS) throw new Error('Too many unknown keys');
    }
  }
  return unknownKeys;
}

// key arrays exactly as emitted (sorted)
const k7 = ['boolean', 'deeplyNested', 'longString', 'maxNumber', 'negNumber', 'number', 'string'];
const k3 = ['bool', 'foo', 'num'];
const s7 = new Set(k7);
const s3 = new Set(k3);

// ---------------------------------------------------------------------------
// validate (verbatim uSW_d1lDhHV)
function validate(v) {
  return (
    typeof v === 'object' &&
    v !== null &&
    Number.isFinite(v.number) &&
    Number.isFinite(v.negNumber) &&
    Number.isFinite(v.maxNumber) &&
    typeof v.string === 'string' &&
    typeof v.longString === 'string' &&
    typeof v.boolean === 'boolean' &&
    (typeof v.deeplyNested === 'object' &&
      v.deeplyNested !== null &&
      typeof v.deeplyNested.foo === 'string' &&
      Number.isFinite(v.deeplyNested.num) &&
      typeof v.deeplyNested.bool === 'boolean')
  );
}

// ---------------------------------------------------------------------------
// hasUnknownKeys variants
const hukVariants = {
  // verbatim IOY_d1lDhHV (current emit)
  current: function (v, opts = {}) {
    return (
      (typeof v === 'object' && v !== null && hUKFA(v, k7)) ||
      (typeof v.deeplyNested === 'object' && v.deeplyNested !== null && hUKFA(v.deeplyNested, k3))
    );
  },
  // afterValidation step 1: object guards dropped, same pure fn
  noguard: function (v) {
    return hUKFA(v, k7) || hUKFA(v.deeplyNested, k3);
  },
  // afterValidation step 2 (all props required): key-count comparison
  keyslen: function (v) {
    return Object.keys(v).length !== 7 || Object.keys(v.deeplyNested).length !== 3;
  },
  // allocation-free alternative to Object.keys().length
  forincount: function (v) {
    let n = 0;
    for (const p in v) n++;
    if (n !== 7) return true;
    n = 0;
    for (const p in v.deeplyNested) n++;
    return n !== 3;
  },
  // emitter-realistic afterValidation shape: hoisted count helper (context fn),
  // called as an expression inside the usual OR-chain
  cntfn: function (v) {
    return cnt(v) !== 7 || cnt(v.deeplyNested) !== 3;
  },
  // standalone-mode candidate: guards kept, Set membership instead of array scan
  set_std: function (v, opts = {}) {
    return (
      (typeof v === 'object' && v !== null && setScan(v, s7)) ||
      (typeof v.deeplyNested === 'object' && v.deeplyNested !== null && setScan(v.deeplyNested, s3))
    );
  },
};
function cnt(o) {
  let n = 0;
  for (const k in o) n++;
  return n;
}
function setScan(obj, set) {
  for (const prop in obj) {
    if (!set.has(prop)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// strip variants
// verbatim HFX_d1lDhHV (pjs / clone)
const ctxFn0 = function (v) {
  if (Object.keys(v.deeplyNested).length === 3) return v.deeplyNested;
  return { foo: v.deeplyNested.foo, num: v.deeplyNested.num, bool: v.deeplyNested.bool };
};
function clone_pjs(v) {
  return {
    number: v.number,
    negNumber: v.negNumber,
    maxNumber: v.maxNumber,
    string: v.string,
    longString: v.longString,
    boolean: v.boolean,
    deeplyNested: ctxFn0(v),
  };
}

const stripVariants = {
  // fresh-object baseline: the per-iteration data allocation every variant pays
  baseline: function (v) {
    return v;
  },
  // faithful stripUnknownKeys emit (scan -> unknown-keys array -> delete loop)
  suk: function (v) {
    const unk0 = gUKFA(v, k7);
    if (unk0) {
      for (const ky0 of unk0) {
        delete v[ky0];
      }
    }
    const unk1 = gUKFA(v.deeplyNested, k3);
    if (unk1) {
      for (const ky1 of unk1) {
        delete v.deeplyNested[ky1];
      }
    }
    return v;
  },
  // faithful unknownKeysToUndefined emit (scan -> array -> assign undefined)
  uku: function (v) {
    const unk0 = gUKFA(v, k7);
    if (unk0) {
      for (const ky0 of unk0) {
        v[ky0] = undefined;
      }
    }
    const unk1 = gUKFA(v.deeplyNested, k3);
    if (unk1) {
      for (const ky1 of unk1) {
        v.deeplyNested[ky1] = undefined;
      }
    }
    return v;
  },
  // improved in-place: single for-in, Set membership, no array allocation
  suk_inline: function (v) {
    for (const p in v) {
      if (!s7.has(p)) delete v[p];
    }
    for (const p in v.deeplyNested) {
      if (!s3.has(p)) delete v.deeplyNested[p];
    }
    return v;
  },
  uku_inline: function (v) {
    for (const p in v) {
      if (!s7.has(p)) v[p] = undefined;
    }
    for (const p in v.deeplyNested) {
      if (!s3.has(p)) v.deeplyNested[p] = undefined;
    }
    return v;
  },
  // current pjs clone (root always rebuilds; nested reuses when clean)
  clone: clone_pjs,
  // proposed: whole-subtree key-count gate, then clone. On clean input returns
  // the input reference untouched (zero allocation).
  clone_gated: function (v) {
    if (Object.keys(v).length === 7 && Object.keys(v.deeplyNested).length === 3) return v;
    return clone_pjs(v);
  },
  // reference point only — copies unknown keys, NOT a strip
  sclone: function (v) {
    return structuredClone(v);
  },
  // clone WITHOUT the nested reuse shortcut (ctxFn0 minus the keys-length check)
  clone_noshortcut: function (v) {
    return {
      number: v.number,
      negNumber: v.negNumber,
      maxNumber: v.maxNumber,
      string: v.string,
      longString: v.longString,
      boolean: v.boolean,
      deeplyNested: ctxFn1(v),
    };
  },
  // clone with the nested literal fully inline (no ctx fn call, no shortcut)
  clone_flat: function (v) {
    return {
      number: v.number,
      negNumber: v.negNumber,
      maxNumber: v.maxNumber,
      string: v.string,
      longString: v.longString,
      boolean: v.boolean,
      deeplyNested: { foo: v.deeplyNested.foo, num: v.deeplyNested.num, bool: v.deeplyNested.bool },
    };
  },
};
function ctxFn1(v) {
  return { foo: v.deeplyNested.foo, num: v.deeplyNested.num, bool: v.deeplyNested.bool };
}

// ---------------------------------------------------------------------------
// flow variants (end-to-end moltar case bodies)
const flowVariants = {
  assertStrict_current: function (v) {
    if (!(validate(v) && !hukVariants.current(v))) throw new Error('wrong type.');
    return true;
  },
  assertStrict_noguard: function (v) {
    if (!(validate(v) && !hukVariants.noguard(v))) throw new Error('wrong type.');
    return true;
  },
  assertStrict_keyslen: function (v) {
    if (!(validate(v) && !hukVariants.keyslen(v))) throw new Error('wrong type.');
    return true;
  },
  parseSafe_clone: function (v) {
    if (!validate(v)) throw new Error('wrong type.');
    return clone_pjs(v);
  },
  parseSafe_gated: function (v) {
    if (!validate(v)) throw new Error('wrong type.');
    return stripVariants.clone_gated(v);
  },
  parseSafe_suk: function (v) {
    if (!validate(v)) throw new Error('wrong type.');
    return stripVariants.suk(v);
  },
  parseSafe_uku: function (v) {
    if (!validate(v)) throw new Error('wrong type.');
    return stripVariants.uku(v);
  },
};

// ---------------------------------------------------------------------------
// data profiles (moltar validateData shape; fresh object per call)
const longString =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

const makeDataByProfile = {
  clean: function () {
    return {
      number: 1,
      negNumber: -1,
      maxNumber: Number.MAX_VALUE,
      string: 'string',
      longString: longString,
      boolean: true,
      deeplyNested: { foo: 'bar', num: 1, bool: false },
    };
  },
  dirty1: function () {
    return {
      number: 1,
      negNumber: -1,
      maxNumber: Number.MAX_VALUE,
      string: 'string',
      longString: longString,
      boolean: true,
      deeplyNested: { foo: 'bar', num: 1, bool: false, extraNestedAttribute: 'bar' },
      extraAttribute: 'foo',
    };
  },
  dirty5: function () {
    return {
      number: 1,
      negNumber: -1,
      maxNumber: Number.MAX_VALUE,
      string: 'string',
      longString: longString,
      boolean: true,
      deeplyNested: { foo: 'bar', num: 1, bool: false, extraNested1: 'x', extraNested2: 2 },
      extra1: 'foo',
      extra2: 42,
      extra3: true,
      extra4: 'bar',
      extra5: null,
    };
  },
};

// ---------------------------------------------------------------------------
// correctness checks (run once per child before timing)
function verify(bench, variantName) {
  const cleanJson = JSON.stringify(makeDataByProfile.clean());
  if (bench === 'huk') {
    const fn = hukVariants[variantName];
    if (fn(makeDataByProfile.clean()) !== false) throw new Error(variantName + ': clean must be false');
    if (fn(makeDataByProfile.dirty1()) !== true) throw new Error(variantName + ': dirty1 must be true');
    if (fn(makeDataByProfile.dirty5()) !== true) throw new Error(variantName + ': dirty5 must be true');
    // nested-only dirt
    const nestedDirty = makeDataByProfile.clean();
    nestedDirty.deeplyNested.zz = 1;
    if (fn(nestedDirty) !== true) throw new Error(variantName + ': nested dirt must be true');
  } else if (bench === 'strip') {
    if (variantName === 'baseline' || variantName === 'sclone') return;
    const fn = stripVariants[variantName];
    for (const profile of ['clean', 'dirty1', 'dirty5']) {
      const out = fn(makeDataByProfile[profile]());
      // JSON-level equality: uku leaves `key: undefined`, which stringify drops.
      if (JSON.stringify(out) !== cleanJson) {
        throw new Error(variantName + ' on ' + profile + ' not JSON-equal to clean');
      }
    }
    if (variantName === 'clone_gated') {
      const d = makeDataByProfile.clean();
      if (fn(d) !== d) throw new Error('clone_gated must return input ref on clean');
    }
  } else if (bench === 'flow') {
    const fn = flowVariants[variantName];
    if (variantName.startsWith('assertStrict')) {
      if (fn(makeDataByProfile.clean()) !== true) throw new Error(variantName + ' clean must pass');
      let threw = false;
      try {
        fn(makeDataByProfile.dirty1());
      } catch {
        threw = true;
      }
      if (!threw) throw new Error(variantName + ' dirty1 must throw');
    } else {
      for (const profile of ['clean', 'dirty1']) {
        const out = fn(makeDataByProfile[profile]());
        if (JSON.stringify(out) !== cleanJson) throw new Error(variantName + ' ' + profile + ' bad output');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// timing harness
let acc = 0;

// huk / assertStrict flows: non-mutating, reuse ONE object (moltar-style hot loop)
function runSampleShared(op, data, iters) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    const r = op(data);
    acc += r === true ? 1 : 0;
    sink(r);
  }
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0);
}

// strip / parseSafe flows: mutators need a fresh object per iteration; every
// variant pays the same makeData cost (baseline variant shows that floor).
function runSampleFresh(op, makeData, iters) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    const d = makeData();
    // Input must escape like real JSON.parse output does; otherwise V8
    // scalar-replaces the input allocation for non-mutating (clone) variants
    // and they get their input object for free — a harness artifact.
    sink(d);
    const r = op(d);
    acc += r.number;
    sink(r);
  }
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0);
}

// strip+consume: read every declared prop of the result afterwards, so
// dictionary-mode / shape damage from delete shows up in the measurement.
function runSampleConsume(op, makeData, iters) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) {
    const d = makeData();
    sink(d);
    const r = op(d);
    acc +=
      r.number +
      r.negNumber +
      (r.maxNumber === Number.MAX_VALUE ? 1 : 0) +
      r.string.length +
      r.longString.length +
      (r.boolean ? 1 : 0) +
      r.deeplyNested.foo.length +
      r.deeplyNested.num +
      (r.deeplyNested.bool ? 0 : 1);
    sink(r);
  }
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0);
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function run(bench, variantName, profile, consume) {
  verify(bench, variantName);

  const makeData = makeDataByProfile[profile];
  let sampleFn;
  let op;
  if (bench === 'huk') {
    op = hukVariants[variantName];
    const data = makeData();
    sampleFn = (iters) => runSampleShared(op, data, iters);
  } else if (bench === 'strip') {
    op = stripVariants[variantName];
    sampleFn = consume ? (iters) => runSampleConsume(op, makeData, iters) : (iters) => runSampleFresh(op, makeData, iters);
  } else if (bench === 'flow') {
    op = flowVariants[variantName];
    if (variantName.startsWith('assertStrict')) {
      const data = makeData();
      sampleFn = (iters) => runSampleShared(op, data, iters);
    } else {
      sampleFn = (iters) => runSampleFresh(op, makeData, iters);
    }
  } else {
    throw new Error('unknown bench ' + bench);
  }

  // warmup (tier-up), then calibrate to >=20ms per sample against the
  // OPTIMIZED code by doubling until the sample is long enough.
  let iters = 8000;
  sampleFn(iters);
  sampleFn(iters);
  for (let tries = 0; tries < 12; tries++) {
    const ns = sampleFn(iters);
    if (ns >= 20e6 || iters >= 20e6) break;
    iters *= 2;
  }

  const SAMPLES = 24;
  const nsPerOp = [];
  for (let s = 0; s < SAMPLES; s++) {
    if (globalThis.gc && s % 6 === 0) globalThis.gc();
    const ns = sampleFn(iters);
    nsPerOp.push(ns / iters);
  }
  const med = median(nsPerOp);
  const madPct = (median(nsPerOp.map((x) => Math.abs(x - med))) / med) * 100;

  console.log(
    JSON.stringify({
      bench,
      variant: variantName,
      profile,
      consume: consume ? 1 : 0,
      nsPerOp: +med.toFixed(2),
      opsPerSec: Math.round(1e9 / med),
      madPct: +madPct.toFixed(2),
      iters,
      samples: SAMPLES,
      acc,
    }),
  );
}

// ---------------------------------------------------------------------------
const [, , cmd, bench, variant, profile, consume] = process.argv;
if (cmd === 'run') {
  run(bench, variant, profile, consume === '1');
} else if (cmd === 'list') {
  console.log(
    JSON.stringify({
      huk: Object.keys(hukVariants),
      strip: Object.keys(stripVariants),
      flow: Object.keys(flowVariants),
    }),
  );
} else {
  console.error('usage: node bench.mjs run <bench> <variant> <profile> <0|1> | list');
  process.exit(1);
}
