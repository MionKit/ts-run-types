// @ts-nocheck
// Hand-authored skeleton for the stripUnknownKeys cache module. Served
// by the Go binary via the Vite plugin's `transform()` hook after
// replacing the marker line below with generated `init(…)` calls —
// one per cached RunType the StripUnknownKeys emitter supports.
//
// Mirrors `prepareForJsonCache.ts` shape with the `fnID: 'suk'` tag.
// Every JitCompiledFn entry the stripUnknownKeys emitter produces
// takes a single value, deletes properties not declared in the schema
// (in place), and returns the value.

'use strict';

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
    jitUtils.addToJitCache({
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
    });
  }
  void init;
  void k_getUnknownKeysFromArray;
  function noopStripUnknownKeys(v) {
    return v;
  }
  void noopStripUnknownKeys;

  // #### REPLACE HERE ####
}
