/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompiledPureFunction, PureFunction as PureFn, PureFunctionFactory as PureFnFactory} from './types.ts';
import {getRTUtils} from './rtUtils.ts';
import {initFromTuple, isEntryTuple, type EntryTuple} from './entryTuple.ts';
import type {
  CompTimeArgs,
  InjectPureFnHash,
  PureFunction as PureFunctionMarker,
  PureFunctionFactory as PureFunctionFactoryMarker,
} from '../markers.ts';

/**
 * Combined pure-fn identifier — the single `"<namespace>::<functionName>"`
 * string a named-lane registrar supplies. The internal cache key is this string
 * verbatim; the namespace / function-name split is purely for readability (it is
 * the value returned RunType-side). The template literal type permits empty
 * halves, so the non-empty `>=2` chars-per-half rule is enforced at runtime (see
 * the throw guard below).
 */
export type PureFnId = `${string}::${string}`;

/**
 * The pure-fn surface is TWO-laned (named vs anonymous) × TWO-formed (factory vs
 * direct). Every form ends up as the same runtime `CompiledPureFunction` — the
 * cache always stores a factory `(utl) => fn` for lazy materialisation. The only
 * difference is the AUTHORING shape the marker declares:
 *
 *   - FACTORY (`PureFunctionFactory<F>` marker): the argument IS the factory,
 *     emitted as-is, so it can do one-time setup + `utl` composition.
 *   - DIRECT (`PureFunction<F>` marker): the argument IS the pure fn; the
 *     compiler wraps it into `() => fn`, so `serverMapFrom(t => t.id)` works.
 *
 * The wrap difference is a BUILD-TIME concern (the Go extractor synthesises the
 * factory for the direct form); at runtime the plugin has already rewritten the
 * argument to its entry-module tuple, so all four registrars share the same core
 * below. `wrap` only matters on the no-plugin fallback path, where the argument
 * is the live function rather than a tuple.
 */
function assertValidPureFnId(caller: string, pureFnId: string): void {
  const sep = pureFnId.indexOf('::');
  if (sep < 2 || sep > pureFnId.length - 4) {
    throw new Error(
      `[ts-runtypes] ${caller}: invalid id "${pureFnId}". ` +
        `Expected a "<namespace>::<functionName>" string where each half is ` +
        `at least 2 characters (e.g. "app::slugify").`
    );
  }
}

/** Wrap a live function into the factory the cache stores: the direct form
 *  returns the pure fn from a zero-arg factory (`() => fn`); the factory form
 *  is already a factory and rides through unchanged. */
function asFactory(fn: PureFn | PureFnFactory, wrap: boolean): PureFnFactory {
  return wrap ? () => fn as PureFn : (fn as PureFnFactory);
}

/**
 * Shared registration core for all four registrars. `arg` is the plugin-rewritten
 * entry-module tuple in the normal case (calling this at module load IS the
 * registration — the tuple's dep closure loads and registers with it); a live
 * function is the no-plugin / dev-tool override path, where `wrap` decides whether
 * it is the pure fn (wrap) or the factory (no wrap).
 */
function registerCore(caller: string, key: string, arg: unknown, wrap: boolean): CompiledPureFunction {
  if (isEntryTuple(arg)) {
    initFromTuple(arg as EntryTuple);
    const registered = getRTUtils().getCompiledPureFn(key);
    if (registered) return registered;
    // Fall through to the no-entry error below — a tuple that doesn't
    // register its own key is an emitter bug worth surfacing loudly.
  }
  const existing = getRTUtils().getCompiledPureFn(key);
  if (!existing) {
    if (typeof arg === 'function') {
      // No-plugin (or extraction-skipped) fallback: the function is right here —
      // register it directly. Build-time metadata (bodyHash, stripped code, static
      // dep extraction) is plugin-only; runtime behaviour is identical because the
      // function IS the body (wrapped into a factory for the direct form).
      const sep = key.indexOf('::');
      const namespace = sep >= 0 ? key.slice(0, sep) : key;
      const functionID = sep >= 0 ? key.slice(sep + 2) : '';
      const compiled: CompiledPureFunction = {
        namespace,
        fnName: functionID,
        bodyHash: '',
        paramNames: [],
        code: '',
        pureFnDependencies: [],
        createPureFn: asFactory(arg as PureFn | PureFnFactory, wrap),
        fn: undefined,
      };
      return getRTUtils().addPureFn(key, compiled);
    }
    throw new Error(
      `[ts-runtypes] ${caller}: no cache entry for "${key}". ` +
        `The Vite plugin must process this file before runtime — check that ` +
        `the plugin is installed and the dev server has restarted after ` +
        `recent edits.`
    );
  }
  if (arg && !isEntryTuple(arg)) {
    // Manual override — dev-tool only. The build rewrite injects the tuple.
    existing.createPureFn = asFactory(arg as PureFn | PureFnFactory, wrap);
    existing.fn = undefined;
  }
  return existing;
}

/**
 * Named FACTORY registration. `createPureFn` is a factory `(utl) => fn` — emitted
 * as-is, so it can compile one-time setup and compose other pure fns via
 * `utl.usePureFn('ns::id')`. The single `"<namespace>::<functionName>"` id keeps
 * the pure fn build-tracked and referenceable by name. Unchanged: the contract is
 * encoded in the parameter brands (`CompTimeArgs` + `PureFunctionFactory`), so the
 * Go scanner discovers calls via the brands.
 */
export function registerPureFnFactory(
  pureFnId: CompTimeArgs<PureFnId>,
  createPureFn: PureFunctionFactoryMarker<PureFnFactory> | null
): CompiledPureFunction {
  assertValidPureFnId('registerPureFnFactory', pureFnId);
  return registerCore('registerPureFnFactory', pureFnId, createPureFn, false);
}

/**
 * Named DIRECT registration — the ergonomic twin of `registerPureFnFactory`.
 * `fn` is the pure function ITSELF (a single callback); the compiler wraps it
 * into `() => fn`. Use this when the pure fn needs no one-time setup or `utl`
 * composition; reach for `registerPureFnFactory` when it does.
 */
export function registerPureFn(pureFnId: CompTimeArgs<PureFnId>, fn: PureFunctionMarker<PureFn> | null): CompiledPureFunction {
  assertValidPureFnId('registerPureFn', pureFnId);
  return registerCore('registerPureFn', pureFnId, fn, true);
}

/**
 * Anonymous, content-addressed FACTORY registration — the marker-driven,
 * wrappable twin of `registerPureFnFactory`. Instead of a developer-supplied
 * `"<ns>::<name>"` literal, the identity rides the injected `hash?` marker, which
 * the plugin fills with `"rt::<fnHash>"` (a content hash of the factory BODY).
 * Because the identity is injected in the callee signature, the primitive is
 * WRAPPABLE: a library can forward the markers from its own
 * `registerXPureFnFactory<F>(createPureFn, hash?)` and the plugin injects at that
 * wrapper's call sites. `createPureFn` is a factory `(utl) => fn` (emitted as-is).
 *
 * Requires the plugin — the content hash can only be computed at build time, so a
 * missing `hash` throws (no literal-id fallback, unlike the named lane). Two
 * structurally-identical bodies inject the SAME `rt::<fnHash>` (content-addressed
 * dedup); different bodies get different hashes.
 */
export function registerAnonymousPureFnFactory<F extends PureFnFactory>(
  createPureFn: PureFunctionFactoryMarker<F> | null,
  hash?: InjectPureFnHash<F>
): CompiledPureFunction {
  if (hash === undefined) {
    throw new Error(
      `[ts-runtypes] registerAnonymousPureFnFactory: no hash injected. ` +
        `ts-runtypes-devtools must process this file — check that the plugin ` +
        `is installed and the dev server has restarted after recent edits.`
    );
  }
  return registerCore('registerAnonymousPureFnFactory', hash, createPureFn, false);
}

/**
 * Anonymous, content-addressed DIRECT registration — the ergonomic, wrappable
 * primitive most single-callback framework APIs want. `fn` is the pure function
 * ITSELF; the compiler wraps it into `() => fn`, so a library can offer
 * `serverMapFrom(t => t.id)` by forwarding the `PureFunction<F>` +
 * `InjectPureFnHash<F>` markers from its own `serverMapFrom<F>(mapper, hash?)`.
 * Reach for `registerAnonymousPureFnFactory` when the pure fn needs one-time
 * setup or `utl` composition.
 *
 * Requires the plugin (a missing `hash` throws); content-addressed dedup applies.
 */
export function registerAnonymousPureFn<F extends PureFn>(
  fn: PureFunctionMarker<F> | null,
  hash?: InjectPureFnHash<F>
): CompiledPureFunction {
  if (hash === undefined) {
    throw new Error(
      `[ts-runtypes] registerAnonymousPureFn: no hash injected. ` +
        `ts-runtypes-devtools must process this file — check that the plugin ` +
        `is installed and the dev server has restarted after recent edits.`
    );
  }
  return registerCore('registerAnonymousPureFn', hash, fn, true);
}
