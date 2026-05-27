// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// prepareForJson cache module. Each entry transforms a value into a
// JSON-serializable form. Paired with `restoreFromJsonCache.ts` — round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))` deep-equals v.

'use strict';

/** @typedef {import('../jit/types.ts').PrepareForJsonJitFn} PrepareForJsonJitFn */

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
    const fn = isNoop ? noopPrepareForJson : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {PrepareForJsonJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'pj',
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
  function noopPrepareForJson(v) {
    return v;
  }
  void noopPrepareForJson;

  // #### REPLACE HERE ####
}
