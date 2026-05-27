// @ts-nocheck
// Hand-authored skeleton for the toBinary cache module. Served by the Go
// binary via the Vite plugin's `transform()` hook after replacing the
// marker line below with generated `init(…)` calls — one per cached
// RunType the toBinary emitter supports.
//
// `init` closes over `jitUtils` from the surrounding `initCache`
// parameter and registers each compiled JitCompiledFn via
// `jitUtils.addToJitCache(entry)`.

'use strict';

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
    jitUtils.addToJitCache({
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
    });
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
