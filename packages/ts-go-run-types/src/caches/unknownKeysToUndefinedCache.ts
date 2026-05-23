// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// unknownKeysToUndefined cache module. Each entry sets unknown properties to
// `undefined` (vs `strip`, which deletes them).

'use strict';

/** @typedef {import('../jit/types.ts').UnknownKeysToUndefinedJitFn} UnknownKeysToUndefinedJitFn */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
  const k_gUKFA = 'mion::getUnknownKeysFromArray';

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
    const fn = isNoop ? noopUnknownKeysToUndefined : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {UnknownKeysToUndefinedJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'uku',
      typeName,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
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
  void k_gUKFA;
  function noopUnknownKeysToUndefined(v) {
    return v;
  }
  void noopUnknownKeysToUndefined;

  // #### REPLACE HERE ####
}
