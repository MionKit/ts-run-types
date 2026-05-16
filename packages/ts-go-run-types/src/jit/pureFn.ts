/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initCache as initParsedFnsCache} from '../caches/parsedFnsCache.ts';
import type {CompiledPureFunction, PureFunctionFactory} from './types.ts';
import {getJitUtils, pureFnKey, type JITUtils} from './jitUtils.ts';

// Side-effect: the parsedFns cache module's `initCache(jitUtils)`
// registers every `{bodyHash, paramNames, code}` entry via
// `jitUtils.addParsedFn(key, data)`. No local table is held here —
// `registerPureFnFactory` reads metadata back through
// `jitUtils.getParsedFn(key)`. Keeps the data inside the long-lived
// singleton so HMR's re-evaluation of the cache module just overwrites
// entries by key without stranding any stale reference.
initParsedFnsCache(getJitUtils());

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  WARNING: the Go binary's AST walker keys its parsed-fn cache on the         ║
// ║  string-literal arguments at arg-0 (namespace) and arg-1 (functionID), and   ║
// ║  extracts {paramNames, code, bodyHash} from the inline factory at arg-2.     ║
// ║  Do NOT rename this function, change parameter order, or replace the         ║
// ║  factory with a non-traceable reference — the extractor emits a PFE9xxx      ║
// ║  diagnostic (shown in the editor's Problems panel) when it can't resolve     ║
// ║  any arg to a local literal/function.                                        ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/**
 * Registers a pure function factory. Looks up pre-parsed factory metadata
 * (bodyHash, paramNames, code) from `virtual:runtypes-parsed-fns`, which the
 * Go binary populates by AST-walking every source file in the program.
 * Idempotent on (namespace, functionID). Auto-detects pure-fn deps by
 * running the factory once with a tracking proxy.
 */
export function registerPureFnFactory(
  namespace: string,
  functionID: string,
  createPureFn: PureFunctionFactory
): CompiledPureFunction {
  const key = pureFnKey(namespace, functionID);
  const parsedFn = getJitUtils().getParsedFn(key);
  if (!parsedFn) {
    throw new Error(
      `registerPureFnFactory: no parsed-fn data for "${key}". ` +
        `vite-plugin-runtypes (via the Go binary) must process the source file containing this call.`
    );
  }

  const existing = getJitUtils().getCompiledPureFn(key);
  if (existing) return existing;

  const compiled: CompiledPureFunction = {
    createPureFn,
    fn: null as any, // resolved after dep tracking
    namespace,
    fnName: functionID,
    bodyHash: parsedFn.bodyHash,
    paramNames: parsedFn.paramNames,
    code: parsedFn.code,
  };

  // Run the factory once with a tracking proxy to auto-detect dependencies.
  const {proxy, getDependencies} = createDependencyTrackingProxy();
  try {
    createPureFn(proxy);
  } catch {
    // Factory may fail if dependencies aren't registered yet, that's ok.
    // We still capture whatever was accessed before the error.
  }
  const detectedDeps = getDependencies();
  for (const dep of detectedDeps) {
    if (dep === functionID) continue;
    if (compiled.pureFnDependencies?.includes(dep)) continue;
    if (!compiled.pureFnDependencies) (compiled as any).pureFnDependencies = [];
    compiled.pureFnDependencies!.push(dep);
  }

  getJitUtils().addPureFn(key, compiled);
  return compiled;
}

// HMR: when the parsedFns cache module re-evaluates after a user-file
// change, re-register every entry against the live jitUtils so future
// `registerPureFnFactory` calls see updated metadata. `initCache` is
// idempotent — `addParsedFn` overwrites by composite key. Production
// builds strip the whole block at bundle time.
type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('../caches/parsedFnsCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}

/** Creates a proxy of jitUtils that records all pure function accesses (getPureFn, usePureFn, etc.) */
function createDependencyTrackingProxy(): {proxy: JITUtils; getDependencies: () => Set<string>} {
  const dependencies = new Set<string>();
  const realUtils = getJitUtils();

  const noopFn = () => () => {};

  // Single-string-key API now: every pureFn method takes one
  // `"namespace::fnName"` key. We strip the namespace prefix off so
  // callers see the same bare `fnName` they used pre-flattening when
  // they inspect dependencies later.
  const recordKey = (key: string): string => {
    const sepIndex = key.indexOf('::');
    return sepIndex >= 0 ? key.slice(sepIndex + 2) : key;
  };

  const proxy = new Proxy(realUtils, {
    get(target, prop, receiver) {
      if (prop === 'getPureFn' || prop === 'usePureFn') {
        return (key: string) => {
          dependencies.add(recordKey(key));
          const real = target.getPureFn(key);
          return real ?? noopFn;
        };
      }
      if (prop === 'getCompiledPureFn') {
        return (key: string) => {
          dependencies.add(recordKey(key));
          return target.getCompiledPureFn(key);
        };
      }
      if (prop === 'hasPureFn') {
        return (key: string) => {
          dependencies.add(recordKey(key));
          return target.hasPureFn(key);
        };
      }
      if (prop === 'findCompiledPureFn') {
        return (fnName: string) => {
          dependencies.add(fnName);
          return target.findCompiledPureFn(fnName);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return {proxy, getDependencies: () => dependencies};
}
