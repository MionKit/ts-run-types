// @ts-nocheck
// Hand-authored skeleton for the typeErrors cache module. Served by
// the Go binary via the Vite plugin's `transform()` hook after replacing
// the marker line below with generated `init(…)` calls — one per
// cached RunType the TypeErrors emitter supports.
//
// Mirrors `isTypeCache.ts` exactly except for the three-arg shape
// (vλl / pλth / εrr) and the `fnID: 'te'` tag — every JitCompiledFn
// entry the typeErrors emitter produces accumulates errors into `er`
// and returns it.

'use strict';

export function initCache(jitUtils) {
  // Module-local pure-fn key consts. The Go emitter references these
  // by short name in `pureFnDependencies` and inside each createJitFn
  // closure so the literal "mion::<fnName>" only appears once per cache
  // (here) instead of once per factory call. Names mirror the Go-side
  // alias table at internal/caches/jitfn/purefn_aliases.go — keep both
  // sides in sync when adding a new pure-fn the typeErrors emitter
  // calls.
  const k_nRT = 'mion::newRunTypeErr';
  const k_sIK = 'mion::safeIterableKey';
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
      fnID: 'te',
      typeName,
      args: {vλl: 'v', pλth: 'pth', εrr: 'er'},
      defaultParamValues: {vλl: undefined, pλth: [], εrr: []},
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
  void k_nRT;
  void k_sIK;

  // #### REPLACE HERE ####

  for (let i = 0; i < pending.length; i++) {
    const entry = pending[i];
    entry.fn = entry.createJitFn(jitUtils);
  }
}
