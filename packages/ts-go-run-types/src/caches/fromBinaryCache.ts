// @ts-nocheck
// Hand-authored skeleton for the fromBinary cache module. Served by the
// Go binary via the Vite plugin's `transform()` hook after replacing the
// marker line below with generated `init(…)` calls — one per cached
// RunType the fromBinary emitter supports. See `isTypeCache.ts` for the
// JSDoc conventions used below.

'use strict';

/**
 * @typedef {import('../jit/types.ts').JitCompiledFn<import('../createBinary.ts').FromBinaryFn>} FromBinaryJitFn
 */

/**
 * @typedef {object} FromBinaryInitArgs
 * @property {string} jitFnHash
 * @property {string} typeName
 * @property {string|undefined} code
 * @property {boolean} isNoop
 * @property {ReadonlyArray<string>|undefined} jitDependencies
 * @property {ReadonlyArray<string>|undefined} pureFnDependencies
 * @property {((utl: import('../jit/jitUtils.ts').JITUtils) => import('../createBinary.ts').FromBinaryFn)|undefined} createJitFn
 * @property {string|undefined} alwaysThrowCode  Per-family diag code (FB001 / FB006 / …) on alwaysThrow entries.
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
    const fn = isNoop ? noopFromBinary : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {FromBinaryJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'fb',
      typeName,
      args: {vλl: 'ret', dεs: 'Des'},
      defaultParamValues: {vλl: undefined, dεs: undefined},
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
  // Noop fallback for runtypes whose fromBinary emit collapsed to
  // identity. Returns undefined since no bytes were consumed and the
  // input ret param is undefined.
  function noopFromBinary(ret, Des) {
    void Des;
    return ret;
  }
  void noopFromBinary;

  // #### REPLACE HERE ####
}
