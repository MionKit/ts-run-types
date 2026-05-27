// @ts-nocheck
// Hand-authored skeleton for the isType cache module. Served by the Go
// binary via the Vite plugin's `transform()` hook after replacing the
// marker line below with generated `init(…)` calls — one per cached
// RunType the isType emitter supports.
//
// `init` closes over `jitUtils` from the surrounding `initCache`
// parameter and registers each compiled JitCompiledFn via
// `jitUtils.addToJitCache(entry)`. There is no module-local table — the
// jitUtils singleton is the only owner of the cached entries, which
// makes HMR work without stale references.
//
// The file is intentionally `@ts-nocheck`'d (the Go renderer splices
// generated JS into the body and we want the served output to parse
// identically through Vite and through `new Function`). The JSDoc
// `@typedef`s below pull the cache-entry shape from
// `../jit/types.ts` — the canonical source for every cache module — so
// readers get hover-typing without turning checking back on.

'use strict';

/** @typedef {import('../jit/types.ts').IsTypeJitFn} IsTypeJitFn */

export function initCache(jitUtils) {
  // Register every entry on the shared jitUtils cache with `fn:
  // undefined`. The fn closure is materialized lazily on first
  // `jitUtils.getJIT(hash)` / `getJitFn(hash)` call — this delays
  // `createJitFn(jitUtils)` until ALL cache modules across every JIT
  // family (isType / typeErrors / prepareForJson / restoreFromJson +
  // pureFns) have registered their entries. Without the delay, an
  // entry materialised here could call `utl.getJIT('rj_X')` for a
  // restoreFromJson dependency that hasn't been registered yet,
  // capturing `undefined` instead of the canonical entry reference.
  //
  // Noop entries use the short-form init: `init(jitFnHash, typeName,
  // undefined, true)`. The Go renderer emits ONLY those four args for
  // noop factories — code, jitDependencies, pureFnDependencies, and
  // createJitFn are all undefined. We materialise `fn` immediately as
  // the family-specific identity (`() => true` for isType), so
  // consumers can read `entry.fn` without any further dispatch.
  //
  // For alwaysThrow entries the Go renderer additionally passes
  // alwaysThrowCode (8th arg) + alwaysThrowSite (9th arg); the JS side
  // swaps createJitFn for `jitUtils.alwaysThrowFactory(code, site)` so
  // the first materialisation throws `[code] message (at site)`.
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
    const fn = isNoop ? noopIsType : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {IsTypeJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'it',
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
  function noopIsType() {
    return true;
  }
  void noopIsType;

  // #### REPLACE HERE ####
}
