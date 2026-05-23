// @ts-nocheck
// Hand-authored skeleton for the unknownKeyErrors cache module. Served
// by the Go binary via the Vite plugin's `transform()` hook after
// replacing the marker line below with generated `init(…)` calls —
// one per cached RunType the UnknownKeyErrors emitter supports.
//
// Mirrors `getTypeErrorsCache.ts` exactly with the `fnID: 'uke'` tag.
// Every JitCompiledFn entry produces a (v, pth=[], er=[]) validator
// that appends one RunTypeError of expected='never' per unknown key.

'use strict';

export function initCache(jitUtils) {
  // Module-local pure-fn key consts. The Go emitter references these
  // by short name in `pureFnDependencies` and inside each createJitFn
  // closure so the literal "mion::<fnName>" only appears once per
  // cache (here) instead of once per factory call.
  const k_nRT = 'mion::newRunTypeErr';
  const k_getUnknownKeysFromArray = 'mion::getUnknownKeysFromArray';
  // Used by the Map/Set emit to wrap the runtime entry key into a
  // JSON-safe path segment (mion::safeIterableKey). Mirrors the
  // declaration in getTypeErrorsCache.ts.
  const k_sIK = 'mion::safeIterableKey';

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
    const fn = isNoop ? noopUnknownKeyErrors : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    jitUtils.addToJitCache({
      jitFnHash,
      fnID: 'uke',
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
    });
  }
  void init;
  void k_nRT;
  void k_getUnknownKeysFromArray;
  void k_sIK;
  function noopUnknownKeyErrors(_v, _pth, er) {
    return er || [];
  }
  void noopUnknownKeyErrors;

  // #### REPLACE HERE ####
}
