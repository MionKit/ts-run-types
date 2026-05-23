/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initCache as initPureFnsCache} from '../caches/pureFnsCache.ts';
import type {CompiledPureFunction, PureFunctionFactory} from './types.ts';
import {getRTUtils, pureFnKey} from './rtUtils.ts';
import type {CompTimeArgs, PureFunction as PureFunctionMarker} from '../markers.ts';

// Populate the pure-fn cache. The cache module is the canonical runtime home
// of every pure-fn body; the user's `registerPureFnFactory(ns, fn, factory)`
// call is rewritten by the Vite plugin to pass `null` as the factory argument.
initPureFnsCache(getRTUtils());

/**
 * Looks up the `CompiledPureFunction` the Go binary registered for
 * (namespace, functionID). The contract is encoded in the parameter brands
 * (`CompTimeArgs` + `PureFunction`), so the Go scanner discovers calls via
 * the brands — renaming or reordering parameters does NOT break extraction.
 *
 * Pass a non-null factory to override `createPureFn` at runtime — used by
 * tests and dev-tools for hot-replace. Production code passes `null`.
 */
export function registerPureFnFactory(
  namespace: CompTimeArgs<string>,
  functionID: CompTimeArgs<string>,
  createPureFn: PureFunctionMarker<PureFunctionFactory> | null
): CompiledPureFunction {
  const key = pureFnKey(namespace, functionID);
  const existing = getRTUtils().getCompiledPureFn(key);
  if (!existing) {
    throw new Error(
      `[ts-go-run-types] registerPureFnFactory: no cache entry for "${key}". ` +
        `The Vite plugin must process this file before runtime — check that ` +
        `the plugin is installed and the dev server has restarted after ` +
        `recent edits.`
    );
  }
  if (createPureFn) {
    // Manual override — dev-tool only. The build rewrite always passes null.
    existing.createPureFn = createPureFn;
    existing.fn = undefined;
  }
  return existing;
}

// HMR: re-register every entry against the live rtUtils on cache reload.
type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('../caches/pureFnsCache.ts', (newMod) => {
    newMod?.initCache?.(getRTUtils());
  });
}
