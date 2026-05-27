// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// stripUnknownKeys cache module. Each entry deletes undeclared properties
// in place and returns the value.

'use strict';

/** @typedef {import('../jit/types.ts').StripUnknownKeysJitFn} StripUnknownKeysJitFn */

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
    const fn = isNoop ? noopStripUnknownKeys : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {StripUnknownKeysJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'suk',
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
  function noopStripUnknownKeys(v) {
    return v;
  }
  void noopStripUnknownKeys;

  // #### REPLACE HERE ####
}
