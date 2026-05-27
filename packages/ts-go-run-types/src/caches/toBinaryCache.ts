// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// toBinary cache module. Each entry writes bytes into a DataViewSerializer.

'use strict';

/** @typedef {import('../jit/types.ts').ToBinaryJitFn} ToBinaryJitFn */

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
    const fn = isNoop ? noopToBinary : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {ToBinaryJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'tb',
      typeName,
      args: {vλl: 'v', sεr: 'Ser'},
      defaultParamValues: {vλl: undefined, sεr: undefined},
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
  // Noop fallback for collapsed entries (e.g. `any` / `unknown`). Returns
  // the serializer untouched so callers can still chain `.getBuffer()`.
  function noopToBinary(v, Ser) {
    void v;
    return Ser;
  }
  void noopToBinary;

  // #### REPLACE HERE ####
}
