// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// typeErrors cache module. Three-arg shape (vλl / pλth / εrr); each entry
// accumulates errors into `er` and returns it.

'use strict';

/** @typedef {import('../jit/types.ts').GetTypeErrorsJitFn} GetTypeErrorsJitFn */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
  // Pure-fn key consts referenced by emitted factory bodies. Mirror the
  // Go-side alias table at internal/compiled/typefns/purefn_aliases.go.
  const k_nRT = 'mion::newRunTypeErr';
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
