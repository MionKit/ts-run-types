// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// fromBinary cache module. Each entry reads bytes from a DataViewDeserializer.

'use strict';

/** @typedef {import('../jit/types.ts').FromBinaryJitFn} FromBinaryJitFn */

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
    const fn = isNoop ? noopFromBinary : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {FromBinaryJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'fb',
      typeName,
      args: {vλl: 'ret', dεs: 'Des'},
      defaultParamValues: {vλl: undefined, dεs: undefined},
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
  // Noop fallback for collapsed entries — returns the placeholder `ret`.
  function noopFromBinary(ret, Des) {
    void Des;
    return ret;
  }
  void noopFromBinary;

  // #### REPLACE HERE ####
}
