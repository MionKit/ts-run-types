/* ########
 * 2024 mion
 * Author: Ma-jerez

 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
  CompiledTypeFn,
  TypesFunctionsCache,
  PureFunctionsCache,
  DeserializeClassFn,
  AnyClass,
  SerializableClass,
  CompiledPureFunction,
  PureFunction,
  RunType,
  RunTypesCache,
  AnyFn,
  InitializedTypeFn,
  Mutable,
} from './types.ts';
import {alwaysThrowFactory as alwaysThrowFactoryImpl} from './diagnosticCatalog.ts';
import type {CompTimeArgs} from '../markers.ts';

/**
 * Shape of jitUtils. Must be defined as a type — `typeof jitUtils` breaks
 * reflection.
 */
export type JITUtils = typeof jitUtils;

const jitFnsCache: TypesFunctionsCache = {};
const pureFnsCache: PureFunctionsCache = {};
const runTypesCache: RunTypesCache = {};
const deserializeFnsRegistry = new Map<string, DeserializeClassFn<any>>();
const serializableClassRegistry = new Map<string, SerializableClass>();

const jitUtils = {
  addToJitCache(comp: CompiledTypeFn) {
    jitFnsCache[comp.jitFnHash] = comp;
  },
  removeFromJitCache(comp: CompiledTypeFn) {
    if (!jitFnsCache[comp.jitFnHash]) return;
    (jitFnsCache[comp.jitFnHash] as any) = undefined;
  },
  getJIT(jitFnHash: string): InitializedTypeFn | undefined {
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
  // The `CompTimeArgs<string>` brand on the next five lookup methods is
  // load-bearing. The Go-side pure-fn dep extractor
  // (internal/compiled/purefns/deps.go) walks every `registerPureFnFactory`
  // body and, for each `<utl>.<method>(<literalKey>)` call where `<method>`
  // is branded `CompTimeArgs<string>`, records `<literalKey>` as a static
  // dependency on the enclosing pure-fn's entry. The brand both (a)
  // declares the literal-only precondition in the type signature and (b)
  // tells the Go scanner which methods participate in dep extraction
  // without a hard-coded method-name allowlist. Dropping the brand
  // silently disables dep extraction and leaves `pureFnDependencies` empty.
  usePureFn(key: CompTimeArgs<string>): PureFunction {
    const compiled = pureFnsCache[key];
    if (!compiled) throw new Error(`Pure function not found for key "${key}"`);
    initPureFunction(compiled);
    return compiled.fn;
  },
  getPureFn(key: CompTimeArgs<string>): PureFunction | undefined {
    const compiled = pureFnsCache[key];
    if (!compiled) return;
    initPureFunction(compiled);
    return compiled.fn;
  },
  getCompiledPureFn(key: CompTimeArgs<string>): CompiledPureFunction | undefined {
    return pureFnsCache[key];
  },
  hasPureFn(key: CompTimeArgs<string>): boolean {
    return !!pureFnsCache[key];
  },
  findCompiledPureFn(fnName: CompTimeArgs<string>): CompiledPureFunction | undefined {
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
    jitFnsCache: jitFnsCache as Readonly<TypesFunctionsCache>,
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
  const entry = utils.getJIT(prefix + '_' + id) as CompiledTypeFn | undefined;
  if (entry) return entry.fn as F;
  if (utils.hasRunType(id)) return identityFn;
  throw new Error(
    `${callerName}(): no JitCompiledFn entry for "${prefix}_${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

/** Composite key for the pure-fn cache: `<namespace>::<fnName>`. **/
export function pureFnKey(namespace: string, fnName: string): string {
  return namespace + '::' + fnName;
}

/** Builds a fresh factory closure from a serialized code body via
 *  `new Function('utl', code)`. Forces strict mode. **/
export function buildFactoryFromCode(code: string): (utl: JITUtils) => (...args: any[]) => any {
  return new Function('utl', `'use strict'; ${code}`) as (utl: JITUtils) => (...args: any[]) => any;
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
function materializeJitFn(entry: CompiledTypeFn): asserts entry is InitializedTypeFn {
  if (entry.fn) return;
  if (materializing.has(entry.jitFnHash)) return;
  if (!entry.createJitFn && !entry.code) return;
  materializing.add(entry.jitFnHash);
  try {
    if (!entry.createJitFn) (entry as Mutable<CompiledTypeFn>).createJitFn = buildFactoryFromCode(entry.code);
    (entry as Mutable<CompiledTypeFn>).fn = (entry as InitializedTypeFn).createJitFn(jitUtils);
  } finally {
    materializing.delete(entry.jitFnHash);
  }
}
