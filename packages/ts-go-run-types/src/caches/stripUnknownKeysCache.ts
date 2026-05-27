// @ts-nocheck
// Hand-authored skeleton for the stripUnknownKeys cache module. Served
// by the Go binary via the Vite plugin's `transform()` hook after
// replacing the marker line below with generated `init(…)` calls —
// one per cached RunType the StripUnknownKeys emitter supports.
//
// Mirrors `prepareForJsonCache.ts` shape with the `fnID: 'suk'` tag.
// Every JitCompiledFn entry the stripUnknownKeys emitter produces
// takes a single value, deletes properties not declared in the schema
// (in place), and returns the value. See `isTypeCache.ts` for the
// JSDoc conventions used below.

'use strict';

/**
 * @typedef {import('../jit/types.ts').JitCompiledFn<import('../createJitFunctions.ts').StripUnknownKeysFn>} StripUnknownKeysJitFn
 */

/**
 * @typedef {object} StripUnknownKeysInitArgs
 * @property {string} jitFnHash
 * @property {string} typeName
 * @property {string|undefined} code
 * @property {boolean} isNoop
 * @property {ReadonlyArray<string>|undefined} jitDependencies
 * @property {ReadonlyArray<string>|undefined} pureFnDependencies
 * @property {((utl: import('../jit/jitUtils.ts').JITUtils) => import('../createJitFunctions.ts').StripUnknownKeysFn)|undefined} createJitFn
 * @property {string|undefined} alwaysThrowCode  Per-family diag code (SUK…) on alwaysThrow entries.
 * @property {string|undefined} alwaysThrowSite  `file:line:col` appended to the runtime throw's message.
 */

export function initCache(jitUtils) {
  // Pure-fn key consts referenced by emitted factory bodies.
  const k_getUnknownKeysFromArray = 'mion::getUnknownKeysFromArray';

  // Register every entry on the shared jitUtils cache with `fn:
  // undefined`. Noop entries pre-populate fn with the family-specific
  // identity (`(v) => v` — atomic shapes can't carry unknown keys, so
  // strip is a passthrough).
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
    const fn = isNoop ? noopStripUnknownKeys : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {StripUnknownKeysJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'suk',
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
  void k_getUnknownKeysFromArray;
  function noopStripUnknownKeys(v) {
    return v;
  }
  void noopStripUnknownKeys;

  // #### REPLACE HERE ####
}
