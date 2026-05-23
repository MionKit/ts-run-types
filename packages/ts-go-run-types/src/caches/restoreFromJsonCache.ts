// @ts-nocheck
// Hand-authored skeleton for the restoreFromJson cache module. Served
// by the Go binary via the Vite plugin's `transform()` hook after
// replacing the marker line below with generated `init(…)` calls —
// one per cached RunType the RestoreFromJson emitter supports.
//
// Mirrors `prepareForJsonCache.ts` exactly except for the `fnID: 'rj'`
// tag. Every JitCompiledFn entry the restoreFromJson emitter produces
// takes a JSON-parsed value and reconstructs the original runtime
// shape (Dates from ISO strings, BigInts from decimal strings, etc.).

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
      fnID: 'rj',
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
