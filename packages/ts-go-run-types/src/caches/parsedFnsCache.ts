// @ts-nocheck
// Hand-authored skeleton for the parsedFns cache module. Served by the
// Go binary via the Vite plugin's `transform()` hook after replacing
// the marker line below with generated `factory(…)` calls — one per
// extracted `registerPureFnFactory` call site.
//
// `factory` closes over `jitUtils` and pushes the entry into the shared
// jitUtils parsedFn registry via `addParsedFn(key, data)`. There is no
// module-local table — every consumer (currently `registerPureFnFactory`
// inside @mionjs/ts-go-run-types) reads back through
// `jitUtils.getParsedFn(key)`.

'use strict';

export function initCache(jitUtils) {
  function factory(key, bodyHash, paramNames, code) {
    jitUtils.addParsedFn(key, {bodyHash, paramNames, code});
  }
  void factory;

  // #### REPLACE HERE ####
}
