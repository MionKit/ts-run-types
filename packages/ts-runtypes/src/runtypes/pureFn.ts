/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompiledPureFunction, PureFunctionFactory} from './types.ts';
import {getRTUtils} from './rtUtils.ts';
import {initFromTuple, isEntryTuple, type EntryTuple} from './entryTuple.ts';
import type {CompTimeArgs, InjectPureFnHash, PureFunction as PureFunctionMarker} from '../markers.ts';

/**
 * Combined pure-fn identifier — the single `"<namespace>::<functionName>"`
 * string a `registerPureFnFactory` call site supplies. The internal cache
 * key is this string verbatim; the namespace / function-name split is purely
 * for readability (it is the value returned RunType-side). The template
 * literal type permits empty halves, so the non-empty `>=2` chars-per-half
 * rule is enforced at runtime (see the throw guard below).
 */
export type PureFnId = `${string}::${string}`;

/**
 * Registers / looks up the `CompiledPureFunction` for `pureFnId` (a single
 * `"<namespace>::<functionName>"` string). The contract is encoded in the
 * parameter brands (`CompTimeArgs` + `PureFunction`), so the Go scanner
 * discovers calls via the brands — renaming or reordering parameters does
 * NOT break extraction.
 *
 * The Vite plugin rewrites the factory argument to the pure fn's entry-module
 * tuple (imported at the top of the file), so calling this at module load IS
 * the registration: the tuple's dep closure (other pure fns it calls) loads
 * and registers with it. A plain factory function is the dev-tool override
 * path — it requires the entry to already exist and hot-swaps its closure.
 */
export function registerPureFnFactory(
  pureFnId: CompTimeArgs<PureFnId>,
  createPureFn: PureFunctionMarker<PureFunctionFactory> | null
): CompiledPureFunction {
  const sep = pureFnId.indexOf('::');
  if (sep < 2 || sep > pureFnId.length - 4) {
    throw new Error(
      `[ts-runtypes] registerPureFnFactory: invalid id "${pureFnId}". ` +
        `Expected a "<namespace>::<functionName>" string where each half is ` +
        `at least 2 characters (e.g. "app::slugify").`
    );
  }
  const key = pureFnId;
  const namespace = pureFnId.slice(0, sep);
  const functionID = pureFnId.slice(sep + 2);
  if (isEntryTuple(createPureFn)) {
    initFromTuple(createPureFn as EntryTuple);
    const registered = getRTUtils().getCompiledPureFn(key);
    if (registered) return registered;
    // Fall through to the no-entry error below — a tuple that doesn't
    // register its own key is an emitter bug worth surfacing loudly.
  }
  const existing = getRTUtils().getCompiledPureFn(key);
  if (!existing) {
    if (typeof createPureFn === 'function') {
      // No-plugin (or extraction-skipped) fallback: the factory body is
      // right here — register it directly. Build-time metadata (bodyHash,
      // stripped code, static dep extraction) is plugin-only; runtime
      // behaviour is identical because createPureFn IS the body.
      const compiled: CompiledPureFunction = {
        namespace,
        fnName: functionID,
        bodyHash: '',
        paramNames: [],
        code: '',
        pureFnDependencies: [],
        createPureFn,
        fn: undefined,
      };
      return getRTUtils().addPureFn(key, compiled);
    }
    throw new Error(
      `[ts-runtypes] registerPureFnFactory: no cache entry for "${key}". ` +
        `The Vite plugin must process this file before runtime — check that ` +
        `the plugin is installed and the dev server has restarted after ` +
        `recent edits.`
    );
  }
  if (createPureFn && !isEntryTuple(createPureFn)) {
    // Manual override — dev-tool only. The build rewrite injects the tuple.
    existing.createPureFn = createPureFn;
    existing.fn = undefined;
  }
  return existing;
}

/**
 * Anonymous, content-addressed pure-fn registration — the marker-driven twin of
 * `registerPureFnFactory`. Instead of a developer-supplied `"<ns>::<name>"`
 * literal, the identity rides the injected `hash?: InjectPureFnHash<F>` marker,
 * which the plugin fills with `"rt::<fnHash>"` (a content hash of the factory
 * BODY). Because the identity is injected in the callee signature, the primitive
 * is WRAPPABLE: a library can forward the markers from its own
 * `registerXPureFn<F>(fn, hash?)` and the plugin injects at that wrapper's call
 * sites — no computed-key CTA003 / forwarded-factory PFN001.
 *
 * The `fn` argument carries the same `PureFunction` marker as
 * `registerPureFnFactory`'s factory, so the plugin runs the purity checks
 * (PFExxx), extracts the body into the pure-fn cache under the derived
 * `rt::<fnHash>` key, and rewrites the argument to that entry-module tuple. At
 * runtime this call registers the tuple (and its dep closure) and returns the
 * compiled entry.
 *
 * Requires the plugin — the content hash can only be computed at build time, so
 * a missing `hash` throws (there is no literal-id fallback, unlike the named
 * lane). Two structurally-identical bodies inject the SAME `rt::<fnHash>`
 * (content-addressed dedup); different bodies get different hashes.
 */
export function registerAnonymousPureFn<F extends PureFunctionFactory>(
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
  const key = hash;
  if (isEntryTuple(fn)) {
    initFromTuple(fn as EntryTuple);
    const registered = getRTUtils().getCompiledPureFn(key);
    if (registered) return registered;
    // Fall through to the no-entry error below — a tuple that doesn't
    // register its own key is an emitter bug worth surfacing loudly.
  }
  const existing = getRTUtils().getCompiledPureFn(key);
  if (!existing) {
    if (typeof fn === 'function') {
      // No-plugin-tuple fallback (dev-tool override): the factory body is right
      // here — register it directly under the injected key. Build-time metadata
      // (bodyHash, stripped code, static dep extraction) is plugin-only; runtime
      // behaviour is identical because fn IS the factory.
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
        createPureFn: fn as PureFunctionFactory,
        fn: undefined,
      };
      return getRTUtils().addPureFn(key, compiled);
    }
    throw new Error(
      `[ts-runtypes] registerAnonymousPureFn: no cache entry for "${key}". ` +
        `The Vite plugin must process this file before runtime — check that ` +
        `the plugin is installed and the dev server has restarted after ` +
        `recent edits.`
    );
  }
  if (fn && !isEntryTuple(fn)) {
    // Manual override — dev-tool only. The build rewrite injects the tuple.
    existing.createPureFn = fn as PureFunctionFactory;
    existing.fn = undefined;
  }
  return existing;
}
