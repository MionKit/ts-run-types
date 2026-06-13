/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CompiledPureFunction, PureFunctionFactory} from './types.ts';
import {getRTUtils, pureFnKey} from './rtUtils.ts';
import {initFromTuple, isEntryTuple, type EntryTuple} from './entryTuple.ts';
import type {CompTimeArgs, PureFunction as PureFunctionMarker} from '../markers.ts';

/**
 * Registers / looks up the `CompiledPureFunction` for (namespace, functionID).
 * The contract is encoded in the parameter brands (`CompTimeArgs` +
 * `PureFunction`), so the Go scanner discovers calls via the brands —
 * renaming or reordering parameters does NOT break extraction.
 *
 * The Vite plugin rewrites the factory argument to the pure fn's entry-module
 * tuple (imported at the top of the file), so calling this at module load IS
 * the registration: the tuple's dep closure (other pure fns it calls) loads
 * and registers with it. A plain factory function is the dev-tool override
 * path — it requires the entry to already exist and hot-swaps its closure.
 */
export function registerPureFnFactory(
  namespace: CompTimeArgs<string>,
  functionID: CompTimeArgs<string>,
  createPureFn: PureFunctionMarker<PureFunctionFactory> | null
): CompiledPureFunction {
  const key = pureFnKey(namespace, functionID);
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
