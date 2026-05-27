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

/** @typedef {import('../jit/types.ts').CompiledPureFunction} CompiledPureFunction */

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
