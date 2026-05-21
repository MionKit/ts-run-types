/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initCache as initPureFnsCache} from '../caches/pureFnsCache.ts';
import type {CompiledPureFunction, PureFunctionFactory} from './types.ts';
import {getJitUtils, pureFnKey} from './jitUtils.ts';

// Side-effect: the pureFns cache module's `initCache(jitUtils)`
// registers every `CompiledPureFunction` entry (full record:
// bodyHash, paramNames, code, pureFnDependencies, createPureFn) via
// `jitUtils.addPureFn(key, entry)`. The cache module is the canonical
// runtime home of every pure-fn body; the user's source's
// `registerPureFnFactory(ns, fn, factory)` call is rewritten by the
// Vite plugin to pass `null` as the factory argument.
initPureFnsCache(getJitUtils());

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  WARNING: the Go binary's AST walker keys its pure-fn cache on the           ║
// ║  string-literal arguments at arg-0 (namespace) and arg-1 (functionID), and   ║
// ║  extracts {paramNames, code, bodyHash, pureFnDependencies} from the inline   ║
// ║  factory at arg-2 — then rewrites the factory argument to `null` in the      ║
// ║  user's source. Do NOT rename this function, change parameter order, or      ║
// ║  replace the factory with a non-traceable reference — the extractor emits    ║
// ║  a PFE9xxx diagnostic (shown in the editor's Problems panel) when it can't   ║
// ║  resolve any arg to a local literal/function.                                ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/**
 * Looks up the `CompiledPureFunction` the Go binary registered for
 * (namespace, functionID) via the pureFns cache module. The build-step
 * rewrite passes `null` as the factory argument, so the cache lookup
 * is the only side-effect at runtime; the factory body lives in the
 * cache module, not in this file.
 *
 * Pass a non-null factory to override `createPureFn` at runtime — used
 * by tests and dev-tools that hot-replace a pure function without
 * rebuilding the cache module. Production code passes `null`.
 */
export function registerPureFnFactory(
  namespace: string,
  functionID: string,
  createPureFn: PureFunctionFactory | null
): CompiledPureFunction {
  const key = pureFnKey(namespace, functionID);
  const existing = getJitUtils().getCompiledPureFn(key);
  if (!existing) {
    throw new Error(
      `[ts-go-run-types] registerPureFnFactory: no cache entry for "${key}". ` +
        `The Vite plugin must process this file before runtime — check that ` +
        `the plugin is installed and the dev server has restarted after ` +
        `recent edits.`
    );
  }
  if (createPureFn) {
    // Manual override path: tests / hot-replace. The build-step
    // rewrite always passes `null`, so this branch is dev-tool only.
    existing.createPureFn = createPureFn;
    existing.fn = undefined;
  }
  return existing;
}

// HMR: when the pureFns cache module re-evaluates after a user-file
// change, re-register every entry against the live jitUtils so future
// `registerPureFnFactory` lookups see updated metadata. `initCache` is
// idempotent — `addPureFn` overwrites by composite key. Production
// builds strip the whole block at bundle time.
type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('../caches/pureFnsCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
