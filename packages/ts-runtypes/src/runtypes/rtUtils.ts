/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez

 * License: UNLICENSED - proprietary, see LICENSE
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
import {getClassSerializer as getClassSerializerImpl} from './classSerializerRegistry.ts';
import type {ClassSerializer} from './classSerializerRegistry.ts';
import type {CompTimeArgs} from '../markers.ts';

/**
 * Shape of rtUtils. Must be defined as a type — `typeof rtUtils` breaks
 * reflection.
 */
export type RTUtils = typeof rtUtils;

/** Runtime guard for the value-first SCHEMA overload shared by every
 *  `createXxx` factory (`createValidate(rt)`, `createJsonEncoder(rt)`,
 *  `createStripUnknownKeys(rt)`, …): a value-first RunType schema carries both
 *  a string `id` and a `kind`. Plain reflected values (the value/static form)
 *  don't carry `kind`, so they fall through to the plugin-injected id. **/
export function isRunTypeSchema(val: unknown): val is RunType {
  return typeof val === 'object' && val !== null && typeof (val as RunType).id === 'string' && 'kind' in val;
}

const rtFnsCache: TypesFunctionsCache = {};
const pureFnsCache: PureFunctionsCache = {};
const runTypesCache: RunTypesCache = {};
const deserializeFnsRegistry = new Map<string, DeserializeClassFn<any>>();
const serializableClassRegistry = new Map<string, SerializableClass>();

const rtUtils = {
  addToRTCache(comp: CompiledTypeFn) {
    rtFnsCache[comp.rtFnHash] = comp;
  },
  removeFromRTCache(comp: CompiledTypeFn) {
    if (!rtFnsCache[comp.rtFnHash]) return;
    (rtFnsCache[comp.rtFnHash] as any) = undefined;
  },
  getRT(rtFnHash: string): InitializedTypeFn | undefined {
    const entry = rtFnsCache[rtFnHash];
    if (!entry) return undefined;
    materializeRTFn(entry);
    return entry;
  },
  getRTFn(rtFnHash: string): (...args: any[]) => any {
    const entry = rtFnsCache[rtFnHash];
    if (!entry) throw new Error(`RT function not found for rtFnHash ${rtFnHash}`);
    materializeRTFn(entry);
    return entry.fn;
  },
  hasRTFn(rtFnHash: string) {
    return !!rtFnsCache[rtFnHash];
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
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  usePureFn(key: CompTimeArgs<string>): PureFunction {
    const compiled = pureFnsCache[key];
    if (!compiled) throw new Error(`Pure function not found for key "${key}"`);
    initPureFunction(compiled);
    return compiled.fn;
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  getPureFn(key: CompTimeArgs<string>): PureFunction | undefined {
    const compiled = pureFnsCache[key];
    if (!compiled) return;
    initPureFunction(compiled);
    return compiled.fn;
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  getCompiledPureFn(key: CompTimeArgs<string>): CompiledPureFunction | undefined {
    return pureFnsCache[key];
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
  hasPureFn(key: CompTimeArgs<string>): boolean {
    return !!pureFnsCache[key];
  },
  // CompTimeArgs ensures dependencies are tracked inside pure functions
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
  // Custom user-class (de)serializer lookup. Emitted factory bodies for
  // plain user classes (KindClass + SubKindNone) call this; a registered
  // handler routes (de)serialization through it, otherwise the factory
  // uses its structural fallback. See classSerializerRegistry.ts.
  getClassSerializer(className: string): ClassSerializer | undefined {
    return getClassSerializerImpl(className);
  },
};

export function getRTUtils(): RTUtils {
  return rtUtils;
}

/** Returns the RT and pure-function caches. DO NOT MODIFY — the returned
 *  objects are the originals used by RT functions. */
export function getRTFnCaches() {
  return {
    rtFnsCache: rtFnsCache as Readonly<TypesFunctionsCache>,
    pureFnsCache: pureFnsCache as Readonly<PureFunctionsCache>,
  };
}

/** Lazily materialize a pure function's `.fn` via its `createPureFn` closure. */
function initPureFunction(compiled: CompiledPureFunction): asserts compiled is Required<CompiledPureFunction> {
  if (compiled.fn) return;
  compiled.fn = compiled.createPureFn(rtUtils);
}

/** Canonical cache key for an RT entry — `<prefix>_<id>`. The variant
 *  axis (e.g. `valNA`) is pre-computed into the injected `fnId` at scan
 *  time and passed in as `prefix`, so this is a plain concatenation. **/
export function buildVariantKey(prefix: string, id: string): string {
  return prefix + '_' + id;
}

/** Look up the RT entry at `<prefix>_<id>`. Returns the entry's `fn`,
 *  the identity fallback when the runtype is registered but its factory
 *  collapsed to a noop, or throws. The Go emitter always materialises a
 *  factory for every (typeid, fnId) pair observed at a call site, so a
 *  miss on the key with a registered runtype means the call site uses a
 *  variant the build never saw — surfaced as the identity fallback so
 *  the call site keeps working with a coarse validator. **/
export function lookupRTFn<F extends AnyFn>(callerName: string, prefix: string, id: string, identityFn: F): F {
  const utils = getRTUtils();
  const key = buildVariantKey(prefix, id);
  const entry = utils.getRT(key) as CompiledTypeFn | undefined;
  if (entry) return entry.fn as F;
  if (utils.hasRunType(id)) return identityFn;
  throw new Error(
    `${callerName}(): no RTCompiledFn entry for "${key}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

/** Composite key for the pure-fn cache: `<namespace>::<fnName>`. **/
export function pureFnKey(namespace: string, fnName: string): string {
  return namespace + '::' + fnName;
}

/** Builds a fresh factory closure from a serialized code body via
 *  `new Function('utl', code)`. Forces strict mode. **/
export function buildFactoryFromCode(code: string): (utl: RTUtils) => (...args: any[]) => any {
  return new Function('utl', `'use strict'; ${code}`) as (utl: RTUtils) => (...args: any[]) => any;
}

/** Returns the entry's factory body `code`. Present verbatim in `code`/`both`
 *  emit modes; in `functions` mode (code omitted, live factory shipped) it is
 *  derived from `createRTFn.toString()` — the factory prints as
 *  `function g_<hash>(utl){<body>}`, so the body is the slice between the first
 *  `{` and the last `}`. Memoized onto the entry so the derivation runs once.
 *  Empty string when neither code nor factory exists (never, in practice). **/
export function entryCode(entry: CompiledTypeFn): string {
  if (entry.code !== undefined) return entry.code;
  if (entry.createRTFn) {
    const src = entry.createRTFn.toString();
    const open = src.indexOf('{');
    const close = src.lastIndexOf('}');
    const derived = open >= 0 && close > open ? src.slice(open + 1, close) : '';
    (entry as Mutable<CompiledTypeFn>).code = derived;
    return derived;
  }
  return '';
}

/** Cycle guard. When entry A's createRTFn invokes `getRT('B')` and B's
 *  createRTFn invokes `getRT('A')`, the second call would re-enter
 *  materializeRTFn for A while A is still materializing. The marker
 *  short-circuits that re-entry — getRT still returns A's entry (with
 *  `fn` undefined for now); the inner closure captures the entry reference
 *  and reads `A.fn` later at call time, by which point it's set. **/
const materializing = new Set<string>();

/** Lazily populate an entry's `createRTFn` + `fn`. Cache modules register
 *  entries without eager materialization so cross-cache `getRT()` lookups
 *  inside a closure resolve to entries that already exist.
 *
 *  Emit modes:
 *  - functions/both (`--emit-mode functions|both`): `entry.createRTFn` is
 *    the embedded `function(utl){…}` closure — invoke it.
 *  - code (default): `entry.createRTFn` is undefined; rebuild from `entry.code`
 *    via `new Function('utl', code)`, cache on the entry.
 *
 *  Noop entries skip via the `entry.fn` guard (cache modules pre-populate
 *  `fn` with the family-specific identity at register time).
 *
 *  alwaysThrow entries: `entry.createRTFn` is the throwing closure from
 *  `alwaysThrowFactory(code, site)`; it ignores `utl` and throws. **/
function materializeRTFn(entry: CompiledTypeFn): asserts entry is InitializedTypeFn {
  if (entry.fn) return;
  if (materializing.has(entry.rtFnHash)) return;
  if (!entry.createRTFn && !entry.code) return;
  materializing.add(entry.rtFnHash);
  try {
    // `functions` mode ships createRTFn directly; otherwise rebuild it from the
    // code string (entryCode === entry.code here, since createRTFn is absent).
    if (!entry.createRTFn) (entry as Mutable<CompiledTypeFn>).createRTFn = buildFactoryFromCode(entryCode(entry));
    (entry as Mutable<CompiledTypeFn>).fn = (entry as InitializedTypeFn).createRTFn(rtUtils);
  } finally {
    materializing.delete(entry.rtFnHash);
  }
}
