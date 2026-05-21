// @ts-nocheck
// Hand-authored skeleton for the isType cache module. Served by the Go
// binary as `virtual:runtypes-isType` after replacing the marker line
// below with generated `factory(jitUtils, …)` calls.
//
// Mirrors today's `install(utl)` body. The shared `factory` function
// builds each JitCompiledFn entry against the supplied `jitUtils`,
// stores it locally, and registers it via `jitUtils.addToJitCache(entry)`
// so other code paths (mion's createJitFunction) can resolve dependencies
// through the same singleton.

'use strict';

const cache = {};
let isInitialised = false;

function factory(jitUtils, jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
  const fn = createJitFn(jitUtils);
  const entry = {
    jitFnHash,
    fnID: 'isType',
    typeName,
    args: {vλl: 'v'},
    defaultParamValues: {vλl: undefined},
    code,
    isNoop,
    jitDependencies,
    pureFnDependencies,
    createJitFn,
    fn,
  };
  cache[jitFnHash] = entry;
  jitUtils.addToJitCache(entry);
}

export function initCache(jitUtils) {
  if (isInitialised) return cache;
  isInitialised = true;

  // #### REPLACE HERE ####

  return cache;
}
