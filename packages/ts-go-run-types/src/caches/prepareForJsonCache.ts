// @ts-nocheck
// Hand-authored skeleton for the prepareForJson cache module. Served by
// the Go binary via the Vite plugin's `transform()` hook after replacing
// the marker line below with generated `init(…)` calls — one per
// cached RunType the PrepareForJson emitter supports.
//
// Mirrors `isTypeCache.ts` exactly except for the `fnID: 'pj'` tag.
// Every JitCompiledFn entry the prepareForJson emitter produces takes
// a single value, transforms it into a JSON-serializable form, and
// returns it. Paired with `restoreFromJsonCache.ts` — the round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
// must deep-equal v.

'use strict';

export function initCache(jitUtils) {
  // Two-phase registration so cyclic dependency graphs (X depends
  // on Y, Y depends on X) resolve correctly:
  //   Phase 1 — each `init(...)` call registers a stub entry on
  //     the JIT cache with `fn: undefined`. The entry is the canonical
  //     object identity for that hash.
  //   Phase 2 — after every init line has run, we walk the pending
  //     list and invoke each entry's `createJitFn(jitUtils)` to
  //     materialise `entry.fn`. Any `const X = utl.getJIT('X')`
  //     captured at init time points at the SAME entry, so its
  //     `.fn` is now populated by the time the outer validator
  //     actually runs.
  const pending = [];
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    const entry = {
      jitFnHash,
      fnID: 'pj',
      typeName,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
      code,
      isNoop,
      jitDependencies,
      pureFnDependencies,
      createJitFn,
      fn: undefined,
    };
    jitUtils.addToJitCache(entry);
    pending.push(entry);
  }
  void init;

  // #### REPLACE HERE ####

  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i];
    entry.fn = entry.createJitFn(jitUtils);
  }
}
