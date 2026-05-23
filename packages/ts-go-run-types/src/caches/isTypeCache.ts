// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// ----------------------------------------------------------------------------
// This file is hand-authored, but the Go binary embeds it verbatim (via
// `//go:embed` in `caches/skeletons.go`) and splices generated `init(…)` calls
// into the `#### REPLACE HERE ####` marker. Any change to the `init(…)`
// parameter order/names, the cache-entry shape passed to `addToJitCache`, or
// the `k_<alias>` pure-fn key constants MUST be matched on the Go side under
// `internal/compiled/typefns/` (renderer + alias table in `purefn_aliases.go`).
// Drift surfaces as a runtime shape mismatch. See docs/UNSUPPORTED-KINDS.md.
//
// `@ts-nocheck`'d so the served output parses identically through Vite and
// through `new Function`. The JSDoc `@typedef`s below pull the cache-entry
// shape from `../jit/types.ts` for hover-typing.

'use strict';

/** @typedef {import('../jit/types.ts').IsTypeJitFn} IsTypeJitFn */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
  // Entries register with `fn: undefined`; the closure is materialized lazily
  // on first `getJIT(hash)`. This delays `createJitFn(jitUtils)` until ALL
  // cache modules have registered, so cross-cache `utl.getJIT('other')`
  // lookups inside a closure resolve to entries that exist.
  //
  // Wire shape:
  //   - Normal: full init(jitFnHash, typeName, code, isNoop=false, deps, deps,
  //     createJitFn=undefined, undefined, undefined). `createJitFn` is
  //     undefined by default; `materializeJitFn` rebuilds via
  //     `new Function('utl', code)`. The `--emit-create-jit-fn` flag (Vite
  //     plugin's `emitCreateJitFn: true`) opts back into eager closure
  //     emission for runtimes that disallow dynamic code construction.
  //   - Noop: short-form `init(jitFnHash, typeName, undefined, true)`. `fn` is
  //     pre-populated with the family identity (`() => true` for isType).
  //   - alwaysThrow: additionally passes `alwaysThrowCode` + `alwaysThrowSite`;
  //     `createJitFn` is replaced with `alwaysThrowFactory(code, site)` so the
  //     first materialisation throws `[code] message (at site)`.
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
