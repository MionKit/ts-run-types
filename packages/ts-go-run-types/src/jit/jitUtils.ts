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
  setSerializableClass<C extends SerializableClass>(cls: C): void;
  useSerializeClass(className: string): SerializableClass;
  getSerializeClass(className: string): SerializableClass | undefined;
  setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>): void;
  useDeserializeFn(className: string): DeserializeClassFn<any>;
  getDeserializeFn(className: string): DeserializeClassFn<any> | undefined;
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
    return jitFnsCache[jitFnHash];
  },
  getJitFn(jitFnHash: string): (...args: any[]) => any {
    const comp = jitFnsCache[jitFnHash];
    if (!comp) throw new Error(`Jit function not found for jitFnHash ${jitFnHash}`);
    return comp.fn;
  },
  hasJitFn(jitFnHash: string) {
    return !!jitFnsCache[jitFnHash]?.fn;
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
