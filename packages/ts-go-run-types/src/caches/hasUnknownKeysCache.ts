// @ts-nocheck
// Hand-authored skeleton for the hasUnknownKeys cache module. Served by
// the Go binary via the Vite plugin's `transform()` hook after replacing
// the marker line below with generated `init(…)` calls — one per
// cached RunType the HasUnknownKeys emitter supports.
//
// Mirrors `isTypeCache.ts` exactly except for the `(v, opts)` arg shape
// and the `fnID: 'huk'` tag — every JitCompiledFn entry the
// hasUnknownKeys emitter produces takes (value, optionsBag) and returns
// a boolean indicating whether the value has any property not declared
// in the schema. Ported from mion's emitHasUnknownKeys on
// InterfaceRunType / ArrayRunType / IndexSignatureRunType / etc.

'use strict';

export function initCache(jitUtils) {
  // Pure-fn key consts referenced by emitted factory bodies. Names
  // mirror the Go-side alias table at
  // internal/compiled/typefns/purefn_aliases.go.
  const k_hasUnknownKeysFromArray = 'mion::hasUnknownKeysFromArray';
  const k_getUnknownKeysFromArray = 'mion::getUnknownKeysFromArray';
  // Register every entry on the shared jitUtils cache with `fn:
  // undefined`. The fn closure is materialized lazily on first
  // `jitUtils.getJIT(hash)` / `getJitFn(hash)` call — see
  // isTypeCache.ts for the rationale.
  //
  // Noop entries use the short-form init: only jitFnHash, typeName, and
  // isNoop=true reach this call. fn is set immediately to the family-
  // specific identity (`() => false` for hasUnknownKeys — atomic shapes
  // can't carry unknown keys), letting consumers skip the lazy-
  // materialize path entirely.
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
    jitUtils.addToJitCache({
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
    });
  }
  void init;
  void k_hasUnknownKeysFromArray;
  void k_getUnknownKeysFromArray;
  function noopHasUnknownKeys() {
    return false;
  }
  void noopHasUnknownKeys;

  // #### REPLACE HERE ####
}
