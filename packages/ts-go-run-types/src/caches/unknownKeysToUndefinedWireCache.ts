// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// unknownKeysToUndefinedWire cache module. Decoder-internal sibling of uku.
// Differs only at union nodes: detects the wire wrapper `[idx, value]` at
// runtime and reaches into `v[1]` to apply the merged-allowlist strip on the
// merged object branch (uku is a no-op there to avoid corrupting the wrapper).

'use strict';

/** @typedef {import('../jit/types.ts').UnknownKeysToUndefinedWireJitFn} UnknownKeysToUndefinedWireJitFn */

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
    const fn = isNoop ? noopUnknownKeysToUndefinedWire : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {UnknownKeysToUndefinedWireJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'ukuw',
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
  function noopUnknownKeysToUndefinedWire(v) {
    return v;
  }
  void noopUnknownKeysToUndefinedWire;

  // #### REPLACE HERE ####
}
