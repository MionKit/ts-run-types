// @ts-nocheck
// Hand-authored skeleton for the prepareForJsonSafePreserve cache
// module — clone+preserve variant of prepareForJsonSafeCache.
//
// Same wire-output shape as prepareForJsonSafe (Date → ISO string,
// bigint → decimal string, etc.) but every cloned object literal is
// emitted as `{...v, declared: <transformed>}` so undeclared keys
// survive the clone. Use case: the encoder's `strategy: 'clone',
// stripExtras: false` combination. See `isTypeCache.ts` for the JSDoc
// conventions.

'use strict';

/**
 * @typedef {import('../jit/types.ts').JitCompiledFn<import('../createJitFunctions.ts').PrepareForJsonFn>} PrepareForJsonSafePreserveJitFn
 */

/**
 * @typedef {object} PrepareForJsonSafePreserveInitArgs
 * @property {string} jitFnHash
 * @property {string} typeName
 * @property {string|undefined} code
 * @property {boolean} isNoop
 * @property {ReadonlyArray<string>|undefined} jitDependencies
 * @property {ReadonlyArray<string>|undefined} pureFnDependencies
 * @property {((utl: import('../jit/jitUtils.ts').JITUtils) => import('../createJitFunctions.ts').PrepareForJsonFn)|undefined} createJitFn
 * @property {string|undefined} alwaysThrowCode  Per-family diag code (PJP001 / PJP005 / …) on alwaysThrow entries.
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
    const fn = isNoop ? noopPrepareForJsonSafePreserve : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {PrepareForJsonSafePreserveJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'pjsp',
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
  function noopPrepareForJsonSafePreserve(v) {
    return v;
  }
  void noopPrepareForJsonSafePreserve;

  // #### REPLACE HERE ####
}
