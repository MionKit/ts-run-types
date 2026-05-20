/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {parsedFns} from 'virtual:runtypes-parsed-fns';
import type {CompiledPureFunction, PureFunctionFactory} from './types.ts';
import {getJitUtils, type JITUtils} from './jitUtils.ts';

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  WARNING: the Go binary's AST walker keys its parsed-fn cache on the         ║
// ║  string-literal arguments at arg-0 (namespace) and arg-1 (functionID), and   ║
// ║  extracts {paramNames, code, bodyHash} from the inline factory at arg-2.     ║
// ║  Do NOT rename this function, change parameter order, or replace the         ║
// ║  factory with a non-traceable reference — the extractor emits a PFE9xxx     ║
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
  const key = `${namespace}::${functionID}`;
  const parsedFn = parsedFns[key];
  if (!parsedFn) {
    throw new Error(
      `registerPureFnFactory: no parsed-fn data for "${key}". ` +
        `vite-plugin-runtypes (via the Go binary) must process the source file containing this call.`
    );
  }

  const existing = getJitUtils().getCompiledPureFn(namespace, functionID);
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

  getJitUtils().addPureFn(namespace, compiled);
  return compiled;
}

/** Creates a proxy of jitUtils that records all pure function accesses (getPureFn, usePureFn, etc.) */
function createDependencyTrackingProxy(): {proxy: JITUtils; getDependencies: () => Set<string>} {
  const dependencies = new Set<string>();
  const realUtils = getJitUtils();

  const noopFn = () => () => {};

  const proxy = new Proxy(realUtils, {
    get(target, prop, receiver) {
      if (prop === 'getPureFn' || prop === 'usePureFn') {
        return (ns: string, fnName: string) => {
          dependencies.add(fnName);
          // Return a noop function so the factory can execute without errors
          const real = target.getPureFn(ns, fnName);
          return real ?? noopFn;
        };
      }
      if (prop === 'getCompiledPureFn') {
        return (ns: string, fnName: string) => {
          dependencies.add(fnName);
          return target.getCompiledPureFn(ns, fnName);
        };
      }
      if (prop === 'hasPureFn') {
        return (ns: string, fnName: string) => {
          dependencies.add(fnName);
          return target.hasPureFn(ns, fnName);
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
