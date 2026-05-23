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
  PersistedPureFunctionsCache,
  PureFnsDataCache,
  DeserializeClassFn,
  AnyClass,
  SerializableClass,
  PersistedJitFunctionsCache,
  FnsDataCache,
  CompiledPureFunction,
  PureFunction,
  RunType,
  RunTypesCache,
} from './types.ts';
import {restoreCompiledJitFns} from './restoreJitFns.ts';

// Minimal ambient — `console` is universally available at runtime (node + browser)
// but the package's tsconfig sets `types: []` so the global isn't otherwise visible.
declare const console: {warn(...args: any[]): void};

// Module-local caches. Plain objects/Maps — no globalThis singleton trick;
// dual-loading (CJS + ESM) is solved elsewhere in the bundler config.
const jitFnsCache: JitFunctionsCache = {};
/** Flat pure-function cache keyed by "<namespace>::<fnName>". */
const pureFnsCache: PureFunctionsCache = {};
/** Run-type registry keyed by canonical type id. Populated by the runTypes
 *  cache module (the Go binary's emit replaces the marker line with
 *  `jitUtils.addRunType(...)` calls). */
const runTypesCache: RunTypesCache = {};
const deserializeFnsRegistry = new Map<string, DeserializeClassFn<any>>();
const serializableClassRegistry = new Map<string, SerializableClass>();

/** Composes the flat-cache key from a namespace + function name pair.
 *  Both halves of the composite key are required to be non-empty; the
 *  helper centralises the `::` separator so callers don't repeat it. **/
export function pureFnKey(namespace: string, fnName: string): string {
  return namespace + '::' + fnName;
}

/**
 * Interface defining the shape of jitUtils
 *
 * !! Important: this needs to be defined as a type for reflection to work correctly
 * !! we can not use  typeof jitUtils
 */
export interface JITUtils {
  /** optimized function to convert an string into a json string wrapped in double quotes */
  addToJitCache(comp: JitCompiledFn): void;
  removeFromJitCache(comp: JitCompiledFn): void;
  getJIT(jitFnHash: string): JitCompiledFn | undefined;
  getJitFn(jitFnHash: string): (...args: any[]) => any;
  hasJitFn(jitFnHash: string): boolean;
  /** Adds a compiled pure function. `key` is the composite `"namespace::fnName"`. */
  addPureFn(key: string, compiledFn: CompiledPureFunction): CompiledPureFunction;
  usePureFn(key: string): PureFunction;
  getPureFn(key: string): PureFunction | undefined;
  getCompiledPureFn(key: string): CompiledPureFunction | undefined;
  hasPureFn(key: string): boolean;
  /** Find a pure function across all namespaces. Returns the compiled function or undefined. */
  findCompiledPureFn(fnName: string): CompiledPureFunction | undefined;
  /** Add (or overwrite) a run-type entry keyed by canonical id. Returns the stored entry. */
  addRunType(id: string, runType: RunType): RunType;
  removeRunType(id: string): void;
  getRunType(id: string): RunType | undefined;
  /** Look up a run-type by id; throws when missing. Use when absence is a bug. */
  useRunType(id: string): RunType;
  hasRunType(id: string): boolean;
  setSerializableClass<C extends SerializableClass>(cls: C): void;
  useSerializeClass(className: string): SerializableClass;
  getSerializeClass(className: string): SerializableClass | undefined;
  setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>): void;
  useDeserializeFn(className: string): DeserializeClassFn<any>;
  getDeserializeFn(className: string): DeserializeClassFn<any> | undefined;
}

/** Cycle guard for lazy fn materialization. When entry A's createJitFn
 *  closure invokes `utl.getJIT('B')`, that call materializes B; B's
 *  createJitFn may invoke `utl.getJIT('A')`, which would re-enter
 *  materializeJitFn for A while A's createJitFn is still running. The
 *  marker short-circuits that re-entry: getJIT still returns A's entry
 *  (with `fn` undefined for now), but the inner closure B is building
 *  only captures the entry REFERENCE — A.fn is read later, at
 *  validator-call time, by which point Phase 2's outer call has
 *  finished and A.fn is set. **/
const materializing = new Set<string>();

/** Lazily invoke an entry's `createJitFn(jitUtils)` to populate
 *  `entry.fn`. Cache modules now register entries without eager
 *  materialization — the actual fn closure is built on first
 *  `getJIT(hash)` call. This keeps materialization ordered AFTER every
 *  cache module's `initCache()` has populated its entries, so any
 *  cross-cache `utl.getJIT('other_fn_hash')` lookup inside a closure
 *  resolves to an entry that already exists. **/
function materializeJitFn(entry: JitCompiledFn): void {
  if (entry.fn || !entry.createJitFn) return;
  if (materializing.has(entry.jitFnHash)) return;
  materializing.add(entry.jitFnHash);
  try {
    entry.fn = entry.createJitFn(jitUtils);
  } finally {
    materializing.delete(entry.jitFnHash);
  }
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
      // Validate body hash matches - if not, this is a version conflict
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
    // Cross-namespace lookup: scan the flat keys for one ending in
    // `::<fnName>`. Behaves identically to the old nested walk but
    // without the namespace indirection.
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
};

/**
 * Returns the jitUtils instance.
 * This function provides access to the utilities used by JIT generated functions.
 */
export function getJitUtils(): JITUtils {
  return jitUtils;
}

/**
 * Adds new AOT JIT and pure functions into the respective caches.
 * This function is intended to be used to restore JitFunctions there were serialized to src code (AOT caches)
 */
export function addAOTCaches(aotFnsCache: PersistedJitFunctionsCache, aotPureCache: PersistedPureFunctionsCache) {
  restoreCaches(aotFnsCache, aotPureCache);
}

/**
 * Adds new JIT and pure functions into the respective caches.
 * This function is intended to restore JitFunctions that were serialized and deserialized over the network
 */
export function addSerializedJitCaches(jitDataFnsCache: FnsDataCache, pureFnsDataCache: PureFnsDataCache) {
  restoreCaches(jitDataFnsCache, pureFnsDataCache);
}

function restoreCaches(
  fnsCache: PersistedJitFunctionsCache | FnsDataCache,
  pureCache: PersistedPureFunctionsCache | PureFnsDataCache
) {
  // First load the caches so all entries are available in the global cache
  // This is needed because createJitFn uses jitUtils.getJIT() to resolve dependencies
  for (const key in fnsCache) {
    if (!(key in jitFnsCache)) {
      // it will be transformed into JitCompiledFn by restoreCompiledJitFns()
      // Cloning to avoid mutating the original
      jitFnsCache[key] = {...fnsCache[key]} as JitCompiledFn;
    }
  }
  // Load pure functions with hash validation. Flat map — one composite
  // key per entry.
  for (const key in pureCache) {
    const existing = pureFnsCache[key];
    const incoming = pureCache[key];
    if (existing) {
      if (existing.bodyHash && incoming.bodyHash && existing.bodyHash !== incoming.bodyHash) {
        console.warn(
          `Pure function ${key} cache eviction: ` +
            `bodyHash mismatch (cached: ${existing.bodyHash}, server: ${incoming.bodyHash})`
        );
        pureFnsCache[key] = {...incoming} as CompiledPureFunction;
      }
    } else {
      pureFnsCache[key] = {...incoming} as CompiledPureFunction;
    }
  }
  // Then restore/initialize the functions (invoke createJitFn to set the fn property)
  // Must restore on the global caches so that when createJitFn calls utl.getJIT() or utl.getPureFn()
  // it gets the restored functions with fn property set
  restoreCompiledJitFns(jitFnsCache, pureFnsCache, getJitUtils());
}

/**
 * Returns the jit and pure functions caches.
 * DO NOT MODIFY THE RETURNED OBJECTS AS THEY ARE THE ORIGINAL ONES USED BY THE JIT FUNCTIONS
 */
export function getJitFnCaches() {
  return {
    jitFnsCache: jitFnsCache as Readonly<JitFunctionsCache>,
    pureFnsCache: pureFnsCache as Readonly<PureFunctionsCache>,
  };
}

/** Lazily materialize a pure function's `.fn` by invoking its `createPureFn` closure. */
function initPureFunction(compiled: CompiledPureFunction): asserts compiled is Required<CompiledPureFunction> {
  if (compiled.fn) return;
  compiled.fn = compiled.createPureFn(jitUtils);
}
