// @ts-nocheck
// Hand-authored skeleton for the prepareForJsonSafePreserve cache
// module — clone+preserve variant of prepareForJsonSafeCache.
//
// Same wire-output shape as prepareForJsonSafe (Date → ISO string,
// bigint → decimal string, etc.) but every cloned object literal is
// emitted as `{...v, declared: <transformed>}` so undeclared keys
// survive the clone. Use case: the encoder's `strategy: 'clone',
// stripExtras: false` combination.

'use strict';

export function initCache(jitUtils) {
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn, alwaysThrowCode) {
    const fn = isNoop ? noopPrepareForJsonSafePreserve : undefined;
    const resolvedCreateJitFn = alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode) : createJitFn;
    jitUtils.addToJitCache({
      jitFnHash,
      fnID: 'pjsp',
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
  function noopPrepareForJsonSafePreserve(v) {
    return v;
  }
  void noopPrepareForJsonSafePreserve;

  // #### REPLACE HERE ####
}
