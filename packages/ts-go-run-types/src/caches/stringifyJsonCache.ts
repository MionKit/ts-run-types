// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// Hand-authored skeleton for the stringifyJson cache module. Served by
// the Go binary via the Vite plugin's `transform()` hook after replacing
// the marker line below with generated `init(…)` calls — one per
// cached RunType the StringifyJson emitter supports.
//
// stringifyJson is mion's single-pass JSON serialiser: it walks the
// TYPE and builds the JSON string directly, rather than transforming
// `v` in place (the prepareForJson + JSON.stringify shape). Extras are
// stripped by construction — declared members only ever reach the
// output. No mutation of `v`.
//
// Mirrors `prepareForJsonCache.ts` except for the `fnID: 'sj'` tag
// and the noop identity: there is no "true noop" for stringifyJson
// because the input is a value and the output is a string. For
// atomic-noop kinds where the emit collapses (any / unknown / string /
// object / regexp), the runtime fallback is `JSON.stringify(v)` —
// keeps parity with the per-kind explicit emits. See `isTypeCache.ts`
// for the JSDoc conventions.

'use strict';

/** @typedef {import('../jit/types.ts').StringifyJsonJitFn} StringifyJsonJitFn */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
  // Register every entry on the shared jitUtils cache with `fn:
  // undefined`. The fn closure is materialized lazily on first
  // `jitUtils.getJIT(hash)` / `getJitFn(hash)` call — see
  // isTypeCache.ts for the rationale.
  //
  // Noop entries use the short-form init: only jitFnHash, typeName,
  // and isNoop=true reach this call. fn is set immediately to
  // noopStringifyJson (JSON.stringify-of-v) — there is no identity
  // shape for stringifyJson, so atomic noops degrade to the
  // canonical JSON.stringify fallback.
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
