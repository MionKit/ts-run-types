// @ts-nocheck
// Hand-authored skeleton for the isType cache module. Served by the Go
// binary via the Vite plugin's `transform()` hook after replacing the
// marker line below with generated `init(…)` calls — one per cached
// RunType the isType emitter supports.
//
// `init` closes over `jitUtils` from the surrounding `initCache`
// parameter and registers each compiled JitCompiledFn via
// `jitUtils.addToJitCache(entry)`. There is no module-local table — the
// jitUtils singleton is the only owner of the cached entries, which
// makes HMR work without stale references.

'use strict';

export function initCache(jitUtils) {
  // Register every entry on the shared jitUtils cache with `fn:
  // undefined`. The fn closure is materialized lazily on first
  // `jitUtils.getJIT(hash)` / `getJitFn(hash)` call — this delays
  // `createJitFn(jitUtils)` until ALL cache modules across every JIT
  // family (isType / typeErrors / prepareForJson / restoreFromJson +
  // pureFns) have registered their entries. Without the delay, an
  // entry materialised here could call `utl.getJIT('rj_X')` for a
  // restoreFromJson dependency that hasn't been registered yet,
  // capturing `undefined` instead of the canonical entry reference.
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    jitUtils.addToJitCache({
      jitFnHash,
      fnID: 'it',
      typeName,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
      code,
      isNoop,
      jitDependencies,
      pureFnDependencies,
      createJitFn,
      fn: undefined,
    });
  }
  void init;

  // #### REPLACE HERE ####
}
