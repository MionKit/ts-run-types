// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// pureFns cache module. Each `factory(…)` call builds a full
// `CompiledPureFunction` and registers it via `addPureFn(key, compiled)`.
// This module is the canonical runtime home of each pure-fn body; the Vite
// plugin rewrites user `registerPureFnFactory(ns, fn, factory)` calls so the
// third argument becomes `null` (the runtime call returns the entry registered
// here).

'use strict';

/** @typedef {import('../jit/types.ts').CompiledPureFunction} CompiledPureFunction */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
  function factory(key, bodyHash, paramNames, code, pureFnDependencies, createPureFn) {
    const sep = key.indexOf('::');
    /** @type {CompiledPureFunction} */
    const entry = {
      namespace: sep >= 0 ? key.slice(0, sep) : '',
      fnName: sep >= 0 ? key.slice(sep + 2) : key,
      bodyHash,
      paramNames,
      code,
      pureFnDependencies,
      createPureFn,
      fn: undefined,
    };
    jitUtils.addPureFn(key, entry);
  }
  void factory;

  // #### REPLACE HERE ####
}
