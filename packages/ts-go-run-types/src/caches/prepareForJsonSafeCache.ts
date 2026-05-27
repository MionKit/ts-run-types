// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// prepareForJsonSafe cache module. Non-mutating sibling of prepareForJson:
// builds a new value with only declared keys (extras stripped) and
// transformed leaves. Wire shape matches `prepareForJson + JSON.stringify`,
// so it pairs with `createRestoreFromJson` on the decode side.

'use strict';

/** @typedef {import('../jit/types.ts').PrepareForJsonSafeJitFn} PrepareForJsonSafeJitFn */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
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
    const fn = isNoop ? noopPrepareForJsonSafe : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {PrepareForJsonSafeJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'pjs',
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
  function noopPrepareForJsonSafe(v) {
    return v;
  }
  void noopPrepareForJsonSafe;

  // #### REPLACE HERE ####
}
