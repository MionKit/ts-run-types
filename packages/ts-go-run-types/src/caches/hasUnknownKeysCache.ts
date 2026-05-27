// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// hasUnknownKeys cache module. `(v, opts)` arg shape; each entry returns
// boolean — whether `v` has any property not declared in the schema.

'use strict';

/** @typedef {import('../rt/types.ts').HasUnknownKeysRTFn} HasUnknownKeysRTFn */

/** @param {import('../rt/rtUtils.ts').RTUtils} rtUtils */
export function initCache(rtUtils) {
  // Pure-fn key consts referenced by emitted factory bodies. Mirror the
  // Go-side alias table at internal/compiled/typefns/purefn_aliases.go.
  const k_hUKFA = 'mion::hasUnknownKeysFromArray';
  const k_gUKFA = 'mion::getUnknownKeysFromArray';
  function init(
    rtFnHash,
    typeName,
    code,
    isNoop,
    rtDependencies,
    pureFnDependencies,
    createRTFn,
    alwaysThrowCode,
    alwaysThrowSite
  ) {
    const fn = isNoop ? noopHasUnknownKeys : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {HasUnknownKeysRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'huk',
      typeName,
      args: {vλl: 'v', θpts: 'opts'},
      defaultParamValues: {vλl: undefined, θpts: {}},
      code,
      isNoop,
      rtDependencies,
      pureFnDependencies,
      createRTFn: resolvedCreateRTFn,
      fn,
      alwaysThrowCode,
      alwaysThrowSite,
    };
    rtUtils.addToRTCache(entry);
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
