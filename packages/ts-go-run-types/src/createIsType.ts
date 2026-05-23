import {initCache as initIsTypeCache} from './caches/isTypeCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';

/** Validator function returned by `createIsType<T>()`. Same shape as
 *  mion's `IsTypeFn` in run-types/src/types.ts. **/
export type IsTypeFn = (value: unknown) => boolean;

/** Subset of mion's RunTypeOptions
 *  (mion-run-types:packages/run-types/src/types.ts:110-127) that
 *  affects atomic-type isType validation. Currently only `noLiterals`
 *  is plumbed end-to-end; the other fields are typed for forward
 *  compatibility with mion's full surface.
 *
 *  Pass an OBJECT LITERAL at the call site — the Go-side marker
 *  scanner extracts the option values at build time from the literal
 *  AST node and bakes them into the validator's hash. Identifier or
 *  spread expressions are ignored; if you need dynamic options the
 *  v2 plan is to surface a separate factory API. **/
export interface RunTypeOptions {
  /** When true, compiled literal validators degrade to their base-type
   *  check — `literal 'a'` accepts any string, `literal 2` accepts any
   *  finite number, etc. Mirrors mion's literal.ts:56-59 behavior. **/
  noLiterals?: boolean;
  /** When true and the type is an array, the compiled validator skips
   *  the leading `Array.isArray(v)` guard and iterates `v` directly —
   *  trades safety for speed when the caller has already verified the
   *  input is array-like. Mirrors mion's array.ts:emitIsType behavior
   *  under `comp.opts.noIsArrayCheck`. Folded into the validator's hash
   *  at build time so `string[]` and `string[] + {noIsArrayCheck:true}`
   *  resolve to distinct validators. **/
  noIsArrayCheck?: boolean;
  /** Reserved — see mion's RunTypeOptions. Not yet plumbed. **/
  strictTypes?: boolean;
}

// Side-effect: the cache module's `initCache(jitUtils)` registers every
// compiled JitCompiledFn entry via `jitUtils.addToJitCache`. No local
// table is held here — every lookup goes through the jitUtils singleton,
// which is what makes HMR work cleanly (re-evaluating the cache module
// just rewrites entries on the same singleton).
initIsTypeCache(getJitUtils());

// Validator cache keyed by runtype id (the hash injected at compile
// time by vite-plugin-runtypes). Two `createIsType<T>()` calls for the
// same T share one validator instance — both because there's no point
// rebuilding the closure (its body is identical), and because
// reference-equality lets consumers memoize on the returned function.
const validatorCache = new Map<string, IsTypeFn>();

/** Returns a validator for `T`.
 *
 *  Two equivalent call shapes:
 *    - Static  : `createIsType<T>()` — caller supplies `T` explicitly.
 *    - Reflect : `const v: T = …; createIsType(v)` — `T` is inferred
 *                from the value's declared static type. The value itself
 *                is discarded at runtime; only the type checker uses it
 *                to infer `T`. Same dispatch as `reflectRuntypeId`.
 *  Both shapes produce identical validators — the Go-side scanner reads
 *  `T` off the parameter's declared type either way, so the cache hash
 *  matches. Paired tests in `internal/resolver/*_test.go` enforce this.
 *
 *  At compile time `vite-plugin-runtypes` rewrites every call site to
 *  inject the trailing `RuntypeId<T>` hash. The options object (if any)
 *  is read by the Go-side marker scanner at build time and folded into
 *  the hash so `(T, {})` and `(T, {noLiterals: true})` resolve to
 *  distinct validators. The `options` param at runtime is therefore
 *  IGNORED — the hash already encodes the chosen behavior.
 *
 *  Sync — the validator is materialised at cache-init time (when the
 *  isType cache module is evaluated), so there is no async work on the
 *  hot path. This is a divergence from mion's
 *  `createIsTypeFn<T>(opts?): Promise<IsTypeFn>` shape, which was
 *  async because mion may do lazy compilation; our AOT pipeline does
 *  not need it.
 *
 *  Throws when called without the plugin active (no `id` injected) or
 *  when jitUtils doesn't contain an entry for the expected hash —
 *  both indicate the build pipeline didn't wire correctly. **/
export function createIsType<T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>,
): IsTypeFn {
  void val; // runtime-ignored; only used by type-checker to infer T
  void options; // runtime-ignored; baked into id at compile time
  if (id === undefined) {
    throw new Error(
      'createIsType(): no id injected. vite-plugin-runtypes must be active for createIsType to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  // Cache keys are namespaced (`isType_<id>`) so a single runtype id
  // can co-exist with its sibling fn entries (typeErrors, prepareForJson,
  // …) in jitUtils.jitFnsCache without collision. See the Go-side
  // renderEntryWithDeps in internal/caches/jitfn/module.go for where
  // the namespacing is baked into the factory registration.
  const entry = getJitUtils().getJIT('isType_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    // Two cases produce a missing isType entry:
    //   1. The id IS a registered runtype but its emitIsType body
    //      collapsed to a noop (always-true kinds: `any`, `unknown`).
    //      The Go-side renderer skips emitting a factory whose body is
    //      just `return true`, so consumers default to a trivial
    //      passthrough validator here — see
    //      internal/caches/jitfn/istype.go Finalize + module.go
    //      renderEntry's `if isNoop { return "" }` skip.
    //   2. The id is not registered at all — wiring bug. Throw loudly.
    if (getJitUtils().hasRunType(id)) {
      const validator: IsTypeFn = () => true;
      validatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `createIsType(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a validator for that runtype.`
    );
  }
  const validator = entry.fn as IsTypeFn;
  validatorCache.set(id, validator);
  return validator;
}

// Deserialize-path companion cache. `deserializeIsType<T>()` rebuilds
// validators from the serialized `JitCompiledFnData.code` string via
// `new Function('utl', code)(jitUtils)`, exercising the over-the-wire
// reconstruction path that `restoreCreateJitFn` in restoreJitFns.ts
// uses. Cached per-id mirrors `createIsType` behaviour: equivalent T
// shares one fresh-built validator instance.
const deserializedValidatorCache = new Map<string, IsTypeFn>();

/** Like `createIsType<T>()`, but rebuilds the validator from the
 *  serialized `JitCompiledFnData.code` body via `new Function('utl',
 *  code)(jitUtils)` instead of reusing the cache module's already-
 *  materialised `entry.fn`. This is the path a consumer takes after
 *  ingesting a serialized cache over the wire (see
 *  `restoreCompiledJitFns` in `jit/restoreJitFns.ts`); shipping a
 *  thunk in every ValidationCase lets the test suite verify the
 *  serialize → deserialize round-trip produces an equivalent validator.
 *
 *  Same call shapes as `createIsType` (static + reflect) and the same
 *  sync return type — `new Function(…)` is synchronous, the validator
 *  is built and cached on first call. **/
export function deserializeIsType<T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>,
): IsTypeFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeIsType(): no id injected. vite-plugin-runtypes must be active for deserializeIsType to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('isType_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    // Same fallback semantics as createIsType: registered runtypes with
    // no factory (noop-collapsed body) get a trivial passthrough so the
    // deserialize path doesn't trip on `any` / `unknown`.
    if (getJitUtils().hasRunType(id)) {
      const validator: IsTypeFn = () => true;
      deserializedValidatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `deserializeIsType(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a validator for that runtype.`
    );
  }
  const factory = buildFactoryFromCode(entry.code);
  const validator = factory(getJitUtils()) as IsTypeFn;
  deserializedValidatorCache.set(id, validator);
  return validator;
}

// HMR: when the isType cache module re-evaluates (because the plugin's
// handleHotUpdate invalidated it after a user-file change), re-register
// every entry against the live jitUtils. `initCache` is idempotent —
// `addToJitCache` overwrites by jitFnHash — so existing entries are
// safely refreshed and any new ones come online. The `validatorCache`
// here keeps its old entries; new types get new structural ids so the
// cache lookup for any new id misses → a fresh validator is built.
// In a production build `import.meta.hot` is statically undefined and
// Rollup tree-shakes the whole `if (hot)` block out.
type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/isTypeCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
