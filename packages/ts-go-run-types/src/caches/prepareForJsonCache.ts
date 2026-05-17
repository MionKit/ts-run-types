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
  // Register every entry on the shared jitUtils cache with `fn:
  // undefined`. The fn closure is materialized lazily on first
  // `jitUtils.getJIT(hash)` / `getJitFn(hash)` call — see
  // isTypeCache.ts for the rationale.
  //
  // Noop entries use the short-form init: only jitFnHash, typeName,
  // and isNoop=true reach this call. fn is set immediately to the
  // family-specific identity (`(v) => v` for prepareForJson), letting
  // consumers skip the lazy-materialize path entirely.
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    const fn = isNoop ? noopPrepareForJson : undefined;
    jitUtils.addToJitCache({
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
      fn,
    });
  }
  void init;
  function noopPrepareForJson(v) {
    return v;
  }
  void noopPrepareForJson;

  // #### REPLACE HERE ####
}
