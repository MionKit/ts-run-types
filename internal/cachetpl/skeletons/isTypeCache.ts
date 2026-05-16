// @ts-nocheck
// Hand-authored skeleton for the isType cache module. Served by the Go
// binary via the Vite plugin's `transform()` hook after replacing the
// marker line below with generated `factory(…)` calls — one per cached
// RunType the isType emitter supports.
//
// `factory` closes over `jitUtils` from the surrounding `initCache`
// parameter and registers each compiled JitCompiledFn via
// `jitUtils.addToJitCache(entry)`. There is no module-local table — the
// jitUtils singleton is the only owner of the cached entries, which
// makes HMR work without stale references.

'use strict';

export function initCache(jitUtils) {
  function factory(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    const fn = createJitFn(jitUtils);
    const entry = {
      jitFnHash,
      fnID: 'isType',
      typeName,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
      code,
      isNoop,
      jitDependencies,
      pureFnDependencies,
      createJitFn,
      fn,
    };
    jitUtils.addToJitCache(entry);
  }
  void factory;

  // #### REPLACE HERE ####
}
