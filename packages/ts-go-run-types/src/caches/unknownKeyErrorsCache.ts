// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// unknownKeyErrors cache module. Each entry appends one RunTypeError
// (`expected: 'never'`) per unknown key.

'use strict';

/** @typedef {import('../jit/types.ts').UnknownKeyErrorsJitFn} UnknownKeyErrorsJitFn */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
  // Pure-fn key consts referenced by emitted factory bodies.
  const k_nRT = 'mion::newRunTypeErr';
  const k_gUKFA = 'mion::getUnknownKeysFromArray';
  // Wraps the runtime entry key into a JSON-safe path segment for Map/Set emit.
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
    /** @type {UnknownKeyErrorsJitFn} */
    const entry = {
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
      alwaysThrowSite,
    };
    jitUtils.addToJitCache(entry);
  }
  void init;
  void k_nRT;
  void k_gUKFA;
  void k_sIK;
  function noopUnknownKeyErrors(_v, _pth, er) {
    return er || [];
  }
  void noopUnknownKeyErrors;

  // #### REPLACE HERE ####
}
