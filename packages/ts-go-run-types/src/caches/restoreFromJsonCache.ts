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
  // Register every entry on the shared jitUtils cache with `fn:
  // undefined`. The fn closure is materialized lazily on first
  // `jitUtils.getJIT(hash)` / `getJitFn(hash)` call — see
  // isTypeCache.ts for the rationale.
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    jitUtils.addToJitCache({
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
    });
  }
  void init;

  // #### REPLACE HERE ####
}
