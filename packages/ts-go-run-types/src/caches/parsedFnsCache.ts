// @ts-nocheck
// Hand-authored skeleton for the parsedFns cache module. Served by the
// Go binary as `virtual:runtypes-parsed-fns` after replacing the marker
// line below with generated `factory(jitUtils, …)` calls.
//
// Cache values are pure data (bodyHash + paramNames + code) consumed by
// `registerPureFnFactory`. `jitUtils` is part of the shared cache shape
// but unused here.

'use strict';

const cache = {};
let isInitialised = false;

function factory(_jitUtils, key, bodyHash, paramNames, code) {
  cache[key] = {bodyHash, paramNames, code};
}

export function initCache(jitUtils) {
  if (isInitialised) return cache;
  isInitialised = true;

  // #### REPLACE HERE ####

  return cache;
}
