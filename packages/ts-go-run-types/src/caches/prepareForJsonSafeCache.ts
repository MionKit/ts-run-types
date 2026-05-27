// @ts-nocheck
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

/**
 * @typedef {import('../jit/types.ts').JitCompiledFn<import('../createJitFunctions.ts').PrepareForJsonFn>} PrepareForJsonSafeJitFn
 */

/**
 * @typedef {object} PrepareForJsonSafeInitArgs
 * @property {string} jitFnHash
 * @property {string} typeName
 * @property {string|undefined} code
 * @property {boolean} isNoop
 * @property {ReadonlyArray<string>|undefined} jitDependencies
 * @property {ReadonlyArray<string>|undefined} pureFnDependencies
 * @property {((utl: import('../jit/jitUtils.ts').JITUtils) => import('../createJitFunctions.ts').PrepareForJsonFn)|undefined} createJitFn
 * @property {string|undefined} alwaysThrowCode  Per-family diag code (PJS001 / PJS005 / …) on alwaysThrow entries.
 * @property {string|undefined} alwaysThrowSite  `file:line:col` appended to the runtime throw's message.
 */

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
