// @ts-nocheck
// Hand-authored skeleton for the typeErrors cache module. Served by
// the Go binary via the Vite plugin's `transform()` hook after replacing
// the marker line below with generated `init(…)` calls — one per
// cached RunType the TypeErrors emitter supports.
//
// Mirrors `isTypeCache.ts` exactly except for the three-arg shape
// (vλl / pλth / εrr) and the `fnID: 'te'` tag — every JitCompiledFn
// entry the typeErrors emitter produces accumulates errors into `er`
// and returns it. See `isTypeCache.ts` for the JSDoc conventions.

'use strict';

/** @typedef {import('../jit/types.ts').GetTypeErrorsJitFn} GetTypeErrorsJitFn */

export function initCache(jitUtils) {
  // Module-local pure-fn key consts. The Go emitter references these
  // by short name in `pureFnDependencies` and inside each createJitFn
  // closure so the literal "mion::<fnName>" only appears once per cache
  // (here) instead of once per factory call. Names mirror the Go-side
  // alias table at internal/compiled/typefns/purefn_aliases.go — keep both
  // sides in sync when adding a new pure-fn the typeErrors emitter
  // calls.
  const k_nRT = 'mion::newRunTypeErr';
  const k_sIK = 'mion::safeIterableKey';
  // Register every entry on the shared jitUtils cache with `fn:
  // undefined`. The fn closure is materialized lazily on first
  // `jitUtils.getJIT(hash)` / `getJitFn(hash)` call — see
  // isTypeCache.ts for the rationale.
  //
  // Noop entries use the short-form init: only jitFnHash, typeName,
  // and isNoop=true reach this call. fn is set immediately to the
  // family-specific identity (`(v, pth, er) => er` — typeErrors
  // returns the accumulated error array unchanged), letting consumers
  // skip the lazy-materialize path entirely.
  //
  // For alwaysThrow entries the renderer additionally passes
  // alwaysThrowCode + alwaysThrowSite; see isTypeCache.ts for the
  // shared wire-format contract.
  function init(
    jitFnHash,
    typeName,
    code,
    isNoop,
    jitDependencies,
    pureFnDependencies,
    createJitFn,
    alwaysThrowCode,
    alwaysThrowSite
  ) {
    const fn = isNoop ? noopTypeErrors : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {GetTypeErrorsJitFn} */
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
      createJitFn: resolvedCreateJitFn,
      fn,
      alwaysThrowCode,
      alwaysThrowSite,
    };
    jitUtils.addToJitCache(entry);
  }
  void init;
  void k_nRT;
  void k_sIK;
  function noopTypeErrors(_v, _pth, er) {
    return er || [];
  }
  void noopTypeErrors;

  // #### REPLACE HERE ####
}
