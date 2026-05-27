// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// stringifyJson cache module. Single-pass JSON serialiser: walks the TYPE and
// builds the JSON string directly (no mutation of `v`, extras stripped by
// construction). Noop entries degrade to `JSON.stringify(v)` since there is
// no identity shape for atomic kinds.

'use strict';

/** @typedef {import('../jit/types.ts').StringifyJsonJitFn} StringifyJsonJitFn */

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
    const fn = isNoop ? noopStringifyJson : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {StringifyJsonJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'sj',
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
  function noopStringifyJson(v) {
    return JSON.stringify(v);
  }
  void noopStringifyJson;

  // #### REPLACE HERE ####
}
