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
  //
  // Noop entries use the short-form init: only jitFnHash, typeName,
  // and isNoop=true reach this call. fn is set immediately to the
  // family-specific identity (`(v) => v` for restoreFromJson), letting
  // consumers skip the lazy-materialize path entirely.
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    const fn = isNoop ? noopRestoreFromJson : undefined;
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
      fn,
    });
  }
  void init;
  function noopRestoreFromJson(v) {
    return v;
  }
  void noopRestoreFromJson;

  // #### REPLACE HERE ####
}
