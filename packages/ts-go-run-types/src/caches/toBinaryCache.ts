// @ts-nocheck
// Hand-authored skeleton for the toBinary cache module. Served by the Go
// binary via the Vite plugin's `transform()` hook after replacing the
// marker line below with generated `init(…)` calls — one per cached
// RunType the toBinary emitter supports.
//
// `init` closes over `jitUtils` from the surrounding `initCache`
// parameter and registers each compiled JitCompiledFn via
// `jitUtils.addToJitCache(entry)`. See `isTypeCache.ts` for the JSDoc
// conventions used below.

'use strict';

/**
 * @typedef {import('../jit/types.ts').JitCompiledFn<import('../createBinary.ts').ToBinaryFn>} ToBinaryJitFn
 */

/**
 * @typedef {object} ToBinaryInitArgs
 * @property {string} jitFnHash
 * @property {string} typeName
 * @property {string|undefined} code
 * @property {boolean} isNoop
 * @property {ReadonlyArray<string>|undefined} jitDependencies
 * @property {ReadonlyArray<string>|undefined} pureFnDependencies
 * @property {((utl: import('../jit/jitUtils.ts').JITUtils) => import('../createBinary.ts').ToBinaryFn)|undefined} createJitFn
 * @property {string|undefined} alwaysThrowCode  Per-family diag code (TB001 / TB006 / …) on alwaysThrow entries.
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
  // Noop fallback for runtypes whose toBinary emit collapsed to identity
  // (e.g. `any` / `unknown` where bytes can't be derived from the type).
  // Returns the serializer untouched so callers can still chain
  // `.getBuffer()`.
  function noopToBinary(v, Ser) {
    void v;
    return Ser;
  }
  void noopToBinary;

  // #### REPLACE HERE ####
}
