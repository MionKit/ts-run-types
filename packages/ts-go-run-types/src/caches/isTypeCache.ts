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
// `@typedef` and `@param` blocks below document the contract for
// readers without turning checking back on.

'use strict';

/**
 * Cache entry produced by every `init(…)` call below.
 *
 * @typedef {import('../jit/types.ts').JitCompiledFn<import('../createJitFunctions.ts').IsTypeFn>} IsTypeJitFn
 */

/**
 * Argument tuple passed by the Go renderer to each generated `init(…)`
 * call site. Three positional shapes the renderer emits:
 *   - Normal:       all 7 leading slots populated, alwaysThrow* undefined.
 *   - Noop:         (jitFnHash, typeName, undefined, true) — trailing slots
 *                   omitted; the JS side fills `fn` with `noopIsType`.
 *   - AlwaysThrow:  (jitFnHash, typeName, undefined, false, undefined,
 *                   undefined, undefined, alwaysThrowCode, alwaysThrowSite).
 *
 * @typedef {object} IsTypeInitArgs
 * @property {string} jitFnHash
 * @property {string} typeName
 * @property {string|undefined} code
 * @property {boolean} isNoop
 * @property {ReadonlyArray<string>|undefined} jitDependencies
 * @property {ReadonlyArray<string>|undefined} pureFnDependencies
 * @property {((utl: import('../jit/jitUtils.ts').JITUtils) => import('../createJitFunctions.ts').IsTypeFn)|undefined} createJitFn
 * @property {string|undefined} alwaysThrowCode  Per-family diag code (IT001 / IT002 / …) on alwaysThrow entries.
 * @property {string|undefined} alwaysThrowSite  `file:line:col` appended to the runtime throw's message.
 */

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
