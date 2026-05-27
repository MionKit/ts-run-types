// @ts-nocheck
// Hand-authored skeleton for the pureFns cache module. Served by the
// Go binary via the Vite plugin's `transform()` hook after replacing
// the marker line below with generated `factory(…)` calls — one per
// extracted `registerPureFnFactory` call site.
//
// `factory` builds a full `CompiledPureFunction` record (all of
// bodyHash, paramNames, code, pureFnDependencies, createPureFn) and
// pushes it into the shared jitUtils pure-fn cache via
// `addPureFn(key, compiled)`. The factory argument carries the
// createPureFn closure itself — an inline `function(utl){…}` whose
// body is the same `code` string. The cache module IS the canonical
// runtime home of each pure-fn body; the user's source no longer
// duplicates it (the plugin rewrites the user's
// `registerPureFnFactory(ns, fn, factory)` so the third argument
// becomes `null` — the runtime call returns the entry registered
// here).

'use strict';

/**
 * Cache entry produced by every `factory(…)` call below.
 *
 * @typedef {import('../jit/types.ts').CompiledPureFunction} PureFnEntry
 */

/**
 * Positional args the Go renderer passes to `factory(…)`.
 *
 * @typedef {object} PureFnFactoryArgs
 * @property {string} key                                "<namespace>::<fnName>" composite key — split inside `factory` to populate the two fields.
 * @property {string} bodyHash                           Hash of the function body for version validation.
 * @property {ReadonlyArray<string>} paramNames          Parameter names of the pure function.
 * @property {string} code                               JS source body — same string baked into `createPureFn` below.
 * @property {ReadonlyArray<string>|undefined} pureFnDependencies  Other pure-fn keys this body reaches via `utl.getPureFn(…)`.
 * @property {import('../jit/types.ts').PureFunctionFactory} createPureFn  Lazy factory: `(utl) => (...args) => unknown` — invoked on first lookup.
 */

export function initCache(jitUtils) {
  /**
   * Registers one CompiledPureFunction entry on the shared jitUtils
   * cache. The factory closure is invoked lazily on first
   * `getPureFn(key)` call — same delayed-materialise contract as the
   * JIT-family caches (see `isTypeCache.ts`), so cross-cache pure-fn
   * dependencies always resolve to canonical entries.
   */
  function factory(key, bodyHash, paramNames, code, pureFnDependencies, createPureFn) {
    const sep = key.indexOf('::');
    /** @type {PureFnEntry} */
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
