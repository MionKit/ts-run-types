// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// hasUnknownKeys cache module. `(v, opts)` arg shape; each entry returns
// boolean — whether `v` has any property not declared in the schema.

'use strict';

/** @typedef {import('../jit/types.ts').HasUnknownKeysJitFn} HasUnknownKeysJitFn */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
  // Pure-fn key consts referenced by emitted factory bodies. Mirror the
  // Go-side alias table at internal/compiled/typefns/purefn_aliases.go.
  const k_hUKFA = 'mion::hasUnknownKeysFromArray';
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
    const fn = isNoop ? noopHasUnknownKeys : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {HasUnknownKeysJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'huk',
      typeName,
      args: {vλl: 'v', θpts: 'opts'},
      defaultParamValues: {vλl: undefined, θpts: {}},
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
  void k_hUKFA;
  void k_gUKFA;
  function noopHasUnknownKeys() {
    return false;
  }
  void noopHasUnknownKeys;

  // #### REPLACE HERE ####
}
