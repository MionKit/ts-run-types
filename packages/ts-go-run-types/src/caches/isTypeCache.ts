// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// ----------------------------------------------------------------------------
// This file is hand-authored, but the Go binary embeds it verbatim (via
// `//go:embed` in `caches/skeletons.go`) and splices generated `init(…)` calls
// into the `#### REPLACE HERE ####` marker. Any change to the `init(…)`
// parameter order/names, the cache-entry shape passed to `addToRTCache`, or
// the `k_<alias>` pure-fn key constants MUST be matched on the Go side under
// `internal/compiled/typefns/` (renderer + alias table in `purefn_aliases.go`).
// Drift surfaces as a runtime shape mismatch. See docs/UNSUPPORTED-KINDS.md.
//
// `@ts-nocheck`'d so the served output parses identically through Vite and
// through `new Function`. The JSDoc `@typedef`s below pull the cache-entry
// shape from `../runtypes/types.ts` for hover-typing.

'use strict';

/** @typedef {import('../runtypes/types.ts').IsTypeRTFn} IsTypeRTFn */

/** @param {import('../runtypes/rtUtils.ts').RTUtils} rtUtils */
export function initCache(rtUtils) {
  // Entries register with `fn: undefined`; the closure is materialized lazily
  // on first `getRT(hash)`. This delays `createRTFn(rtUtils)` until ALL
  // cache modules have registered, so cross-cache `utl.getRT('other')`
  // lookups inside a closure resolve to entries that exist.
  //
  // Wire shape:
  //   - Normal: full init(rtFnHash, typeName, code, isNoop=false, deps, deps,
  //     createRTFn=undefined, undefined, undefined). `createRTFn` is
  //     undefined by default; `materializeRTFn` rebuilds via
  //     `new Function('utl', code)`. The `--emit-create-rt-fn` flag (Vite
  //     plugin's `emitCreateRTFn: true`) opts back into eager closure
  //     emission for runtimes that disallow dynamic code construction.
  //   - Noop: short-form `init(rtFnHash, typeName, undefined, true)`. `fn` is
  //     pre-populated with the family identity (`() => true` for isType).
  //   - alwaysThrow: additionally passes `alwaysThrowCode` + `alwaysThrowSite`;
  //     `createRTFn` is replaced with `alwaysThrowFactory(code, site)` so the
  //     first materialisation throws `[code] message (at site)`.
  function init(
    rtFnHash,
    typeName,
    code,
    isNoop,
    rtDependencies,
    pureFnDependencies,
    createRTFn,
    alwaysThrowCode,
    alwaysThrowSite
  ) {
    const fn = isNoop ? noopIsType : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {IsTypeRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'it',
      typeName,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
      code,
      isNoop,
      rtDependencies,
      pureFnDependencies,
      createRTFn: resolvedCreateRTFn,
      fn,
      alwaysThrowCode,
      alwaysThrowSite,
    };
    rtUtils.addToRTCache(entry);
  }
  void init;
  function noopIsType() {
    return true;
  }
  void noopIsType;

  // #### REPLACE HERE ####
}
