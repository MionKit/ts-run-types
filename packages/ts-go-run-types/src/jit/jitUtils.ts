/* ########
 * 2024 mion
 * Author: Ma-jerez

 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
  JitCompiledFn,
  JitFunctionsCache,
  PureFunctionsCache,
  DeserializeClassFn,
  AnyClass,
  SerializableClass,
  CompiledPureFunction,
  PureFunction,
  RunType,
  RunTypesCache,
  AnyFn,
} from './types.ts';
import {alwaysThrowFactory as alwaysThrowFactoryImpl} from './diagnosticCatalog.ts';
import type {CompTimeArgs} from '../markers.ts';

/** Builds a fresh factory closure from a serialized code body via
 *  `new Function('utl', code)`. Forces strict mode. **/
export function buildFactoryFromCode(code: string): (utl: JITUtils) => (...args: any[]) => any {
  return new Function('utl', `'use strict'; ${code}`) as (utl: JITUtils) => (...args: any[]) => any;
}

// `console` is universally available at runtime but the package's tsconfig
// sets `types: []` so the global isn't otherwise visible.
declare const console: {warn(...args: any[]): void};

const jitFnsCache: JitFunctionsCache = {};
const pureFnsCache: PureFunctionsCache = {};
const runTypesCache: RunTypesCache = {};
const deserializeFnsRegistry = new Map<string, DeserializeClassFn<any>>();
const serializableClassRegistry = new Map<string, SerializableClass>();

/** Composite key for the pure-fn cache: `<namespace>::<fnName>`. **/
export function pureFnKey(namespace: string, fnName: string): string {
  return namespace + '::' + fnName;
}

/**
 * Shape of jitUtils. Must be defined as a type — `typeof jitUtils` breaks
 * reflection.
 */
export interface JITUtils {
  addToJitCache(comp: JitCompiledFn): void;
  removeFromJitCache(comp: JitCompiledFn): void;
  getJIT(jitFnHash: string): JitCompiledFn | undefined;
  getJitFn(jitFnHash: string): (...args: any[]) => any;
  hasJitFn(jitFnHash: string): boolean;
  /** Add a compiled pure function. `key` is the composite `"namespace::fnName"`. */
  addPureFn(key: string, compiledFn: CompiledPureFunction): CompiledPureFunction;
  usePureFn(key: CompTimeArgs<string>): PureFunction;
  getPureFn(key: CompTimeArgs<string>): PureFunction | undefined;
  getCompiledPureFn(key: CompTimeArgs<string>): CompiledPureFunction | undefined;
  hasPureFn(key: CompTimeArgs<string>): boolean;
  /** Find a pure function across all namespaces. */
  findCompiledPureFn(fnName: CompTimeArgs<string>): CompiledPureFunction | undefined;
  /** Add or overwrite a run-type entry. */
  addRunType(id: string, runType: RunType): RunType;
  removeRunType(id: string): void;
  getRunType(id: string): RunType | undefined;
  /** Throws when missing. Use when absence is a bug. */
  useRunType(id: string): RunType;
  hasRunType(id: string): boolean;
  setSerializableClass<C extends SerializableClass>(cls: C): void;
  useSerializeClass(className: string): SerializableClass;
  getSerializeClass(className: string): SerializableClass | undefined;
  setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>): void;
  useDeserializeFn(className: string): DeserializeClassFn<any>;
  getDeserializeFn(className: string): DeserializeClassFn<any> | undefined;
  /**
   * Build a throwing-factory for an alwaysThrow cache entry. Throws
   * `[code] message (at file:line:col)` on invocation (suffix omitted when
   * no provenance is known). See docs/UNSUPPORTED-KINDS.md.
   */
  alwaysThrowFactory(code: string, siteHint?: string): () => never;
}

const jitUtils: JITUtils = {
  addToJitCache(comp: JitCompiledFn) {
    jitFnsCache[comp.jitFnHash] = comp;
  },
  removeFromJitCache(comp: JitCompiledFn) {
    if (!jitFnsCache[comp.jitFnHash]) return;
    (jitFnsCache[comp.jitFnHash] as any) = undefined;
  },
  getJIT(jitFnHash: string): JitCompiledFn | undefined {
    const entry = jitFnsCache[jitFnHash];
    if (!entry) return undefined;
    materializeJitFn(entry);
    return entry;
  },
  getJitFn(jitFnHash: string): (...args: any[]) => any {
    const entry = jitFnsCache[jitFnHash];
    if (!entry) throw new Error(`Jit function not found for jitFnHash ${jitFnHash}`);
    materializeJitFn(entry);
    return entry.fn;
  },
  hasJitFn(jitFnHash: string) {
    return !!jitFnsCache[jitFnHash];
  },

  addPureFn(key: string, compiledFn: CompiledPureFunction): CompiledPureFunction {
    if (!key) throw new Error('Pure function key must be a non-empty "namespace::fnName" string');
    const existing = pureFnsCache[key];
    if (existing) {
      // Version conflict — body changed; replace and warn.
      if (existing.bodyHash && compiledFn.bodyHash && existing.bodyHash !== compiledFn.bodyHash) {
        console.warn(
          `Pure function ${key} body hash mismatch. ` +
            `Existing: ${existing.bodyHash}, New: ${compiledFn.bodyHash}. ` +
            `Replacing with new version.`
        );
        pureFnsCache[key] = compiledFn;
        return compiledFn;
      }
      return existing;
    }
    pureFnsCache[key] = compiledFn;
    return compiledFn;
  },
  usePureFn(key: string): PureFunction {
    const compiled = pureFnsCache[key];
    if (!compiled) throw new Error(`Pure function not found for key "${key}"`);
    initPureFunction(compiled);
    return compiled.fn;
  },
  getPureFn(key: string): PureFunction | undefined {
    const compiled = pureFnsCache[key];
    if (!compiled) return;
    initPureFunction(compiled);
    return compiled.fn;
  },
  getCompiledPureFn(key: string): CompiledPureFunction | undefined {
    return pureFnsCache[key];
  },
  hasPureFn(key: string): boolean {
    return !!pureFnsCache[key];
  },
  findCompiledPureFn(fnName: string): CompiledPureFunction | undefined {
    const suffix = '::' + fnName;
    for (const key of Object.keys(pureFnsCache)) {
      if (key === fnName || key.endsWith(suffix)) return pureFnsCache[key];
    }
    return undefined;
  },
  addRunType(id: string, runType: RunType): RunType {
    if (!id) throw new Error('Run-type id must be a non-empty string');
    runTypesCache[id] = runType;
    return runType;
  },
  removeRunType(id: string) {
    if (!runTypesCache[id]) return;
    (runTypesCache[id] as any) = undefined;
  },
  getRunType(id: string): RunType | undefined {
    return runTypesCache[id];
  },
  useRunType(id: string): RunType {
    const rt = runTypesCache[id];
    if (!rt) throw new Error(`Run-type not found for id "${id}"`);
    return rt;
  },
  hasRunType(id: string): boolean {
    return !!runTypesCache[id];
  },
  setSerializableClass<C extends SerializableClass>(cls: C) {
    const className = cls.name;
    const existingClass = serializableClassRegistry.get(className);
    if (existingClass && existingClass !== cls) throw new Error(`Deserializable Class ${className} already registered`);
    serializableClassRegistry.set(className, cls);
  },
  useSerializeClass(className: string): SerializableClass {
    const cls = serializableClassRegistry.get(className);
    if (!cls) throw new Error(`Serializable class with name ${className} not found, be sure to register it first`);
    return cls;
  },
  getSerializeClass(className: string): SerializableClass | undefined {
    return serializableClassRegistry.get(className);
  },
  setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>) {
    const className = cls.name;
    const fn = deserializeFnsRegistry.get(className);
    if (fn && fn !== deserializeFn) throw new Error(`Deserialize function for class ${className} already exists`);
    if (fn) return;
    deserializeFnsRegistry.set(className, deserializeFn);
  },
  useDeserializeFn(className: string): DeserializeClassFn<any> {
    const fn = deserializeFnsRegistry.get(className);
    if (!fn) throw new Error(`Deserialize function for class ${className} not found, be sure to register it first`);
    return fn;
  },
  getDeserializeFn(className: string): DeserializeClassFn<any> | undefined {
    return deserializeFnsRegistry.get(className);
  },
  alwaysThrowFactory(code: string, siteHint?: string): () => never {
    return alwaysThrowFactoryImpl(code, siteHint);
  },
};

export function getJitUtils(): JITUtils {
  return jitUtils;
}

/** Returns the JIT and pure-function caches. DO NOT MODIFY — the returned
 *  objects are the originals used by JIT functions. */
export function getJitFnCaches() {
  return {
    jitFnsCache: jitFnsCache as Readonly<JitFunctionsCache>,
    pureFnsCache: pureFnsCache as Readonly<PureFunctionsCache>,
  };
}

/** Lazily materialize a pure function's `.fn` via its `createPureFn` closure. */
function initPureFunction(compiled: CompiledPureFunction): asserts compiled is Required<CompiledPureFunction> {
  if (compiled.fn) return;
  compiled.fn = compiled.createPureFn(jitUtils);
}

/** Look up the JIT entry at `<prefix>_<id>`. Returns the entry's `fn`,
 *  the identity fallback when the runtype is registered but its factory
 *  collapsed to a noop, or throws. **/
export function lookupJitFn<F extends AnyFn>(callerName: string, prefix: string, id: string, identityFn: F): F {
  const utils = getJitUtils();
  const entry = utils.getJIT(prefix + '_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as F;
  if (utils.hasRunType(id)) return identityFn;
  throw new Error(
    `${callerName}(): no JitCompiledFn entry for "${prefix}_${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

/** Cycle guard. When entry A's createJitFn invokes `getJIT('B')` and B's
 *  createJitFn invokes `getJIT('A')`, the second call would re-enter
 *  materializeJitFn for A while A is still materializing. The marker
 *  short-circuits that re-entry — getJIT still returns A's entry (with
 *  `fn` undefined for now); the inner closure captures the entry reference
 *  and reads `A.fn` later at call time, by which point it's set. **/
const materializing = new Set<string>();

/** Lazily populate an entry's `createJitFn` + `fn`. Cache modules register
 *  entries without eager materialization so cross-cache `getJIT()` lookups
 *  inside a closure resolve to entries that already exist.
 *
 *  Emit modes:
 *  - Inline-factory mode (`--emit-create-jit-fn`): `entry.createJitFn` is
 *    the embedded `function(utl){…}` closure — invoke it.
 *  - Default: `entry.createJitFn` is undefined; rebuild from `entry.code`
 *    via `new Function('utl', code)`, cache on the entry.
 *
 *  Noop entries skip via the `entry.fn` guard (cache modules pre-populate
 *  `fn` with the family-specific identity at register time).
 *
 *  alwaysThrow entries: `entry.createJitFn` is the throwing closure from
 *  `alwaysThrowFactory(code, site)`; it ignores `utl` and throws. **/
function materializeJitFn(entry: JitCompiledFn): void {
  if (entry.fn) return;
  if (materializing.has(entry.jitFnHash)) return;
  if (!entry.createJitFn && !entry.code) return;
  materializing.add(entry.jitFnHash);
  try {
    if (!entry.createJitFn) {
      (entry as {createJitFn: JitCompiledFn['createJitFn']}).createJitFn = buildFactoryFromCode(
        entry.code
      ) as JitCompiledFn['createJitFn'];
    }
    entry.fn = entry.createJitFn(jitUtils);
  } finally {
    materializing.delete(entry.jitFnHash);
  }
}
