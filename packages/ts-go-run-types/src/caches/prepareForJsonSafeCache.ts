// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// Hand-authored skeleton for the prepareForJsonSafe cache module.
// Sibling of prepareForJsonCache.ts that produces a NON-mutating
// JSON-serializable form: instead of overwriting properties on `v`,
// each emitted factory builds a new value containing only the
// declared keys (extras are stripped) and the transformed leaves
// (Date → ISO string, bigint → decimal string, etc.). Pairs with
// `createRestoreFromJson` on the decode side because the wire shape
// is identical to `prepareForJson + JSON.stringify`.
//
// Consumers opt in via createPrepareForJsonSafe; the non-safe cache
// stays untouched. See `isTypeCache.ts` for the JSDoc conventions.

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
