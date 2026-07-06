/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Custom (de)serializer registry for user-defined classes. The JSON (pj /
// pjs / rj / sj) and binary (tb / fb) families consult this registry for
// plain user classes (KindClass + SubKindNone): the emitted factory looks
// the entry up by the class's structural type id through
// `utl.getClassSerializer(<id>)` and, when present, routes reconstruction
// (and optionally serialization) through it instead of the structural object
// emit. When no entry is registered the families fall back to the structural
// shape and the Go compiler emits a build-time CLS001 Warning pointing here.
//
// A plain object / interface is pure data: everything it carries survives
// JSON and comes back the same. A class instance is not — its prototype
// (methods, getters, setters) is behaviour, its constructor runs arbitrary
// logic, and it may hold values that cannot be serialised at all. So the
// wire only ever carries the DATA PROJECTION of an instance; turning that
// data back into a live object is a *code* problem the build tool cannot
// solve on its own. That is the whole reason this registry exists: the app
// hands the runtime the class (a constructor to instantiate) and, when a
// bare `new Cls()` + copy is not safe, a `deserialize` function.
//
// Both handler halves are OPTIONAL:
//   - `serialize?` omitted  -> structural encode (identical to an interface
//     of the same shape). The pipeline stringifies / binary-encodes the
//     declared props.
//   - `deserialize?` omitted -> `Object.assign(new cls(), decodedData)`.
//     Safe only for a zero-arg constructor; the overloads enforce that at
//     compile time (SerializableClass = `new () => T`). At runtime, if the
//     bare `new cls()` throws, `deserializeClass` surfaces CLS002.
//
// Builtins (Date / Map / Set / RegExp / nonSerializable) are NOT routed
// through this registry — those arms are handled structurally by the
// emitters and are not overridable. validate / getValidationErrors are
// unaffected: they always validate the class by its structural shape.
//
// The registry is keyed by the class's structural TYPE ID (not its name): the
// `registerClassSerializer` call carries a trailing injected `id?:
// InjectRunTypeId<T>` slot (T inferred from the `new () => T` constructor
// param), so the key is build-time-stable and matches the class node's `rt.ID`
// the emitter bakes into `utl.getClassSerializer(<id>)`. Name keying would break
// under class-name minification (`cls.name` mangled, but the emitted lookup is a
// literal id) and collide same-name / different-shape classes. Reconstruction is
// positional — the compiler knows which class a given position holds and looks
// the entry up by that position's type id.

import type {DataOnly} from './dataOnly.ts';
import type {InjectRunTypeId} from '../markers.ts';
import {isEntryTuple, initFromTuple, entryTupleKey, type EntryTuple} from './entryTuple.ts';

/** Any class constructor. */
export interface AnyClass<T = any> {
  new (...args: any[]): T;
}

/** A class with a ZERO-ARG constructor — safe to reconstruct with a bare
 *  `new cls()` followed by a property copy, so `deserialize` is optional. */
export interface SerializableClass<T = any> {
  new (): T;
}

/** The auto-instantiate decode contract: given the data-only projection a
 *  structural decode produced, return a live instance. */
export type DeserializeClassFn<C> = (deserialized: DataOnly<C>) => C;

/** Optional custom (de)serializer pair for one user-defined class. Both
 *  halves are optional; the type-system overloads on `registerClassSerializer`
 *  make `deserialize` mandatory for classes whose constructor takes args. */
export interface ClassSerializerHandler<T> {
  /** Optional. Omit to serialize structurally (like any interface). When
   *  provided, the user owns the wire shape (on the JSON path, keep it to the
   *  declared object properties — see the custom-wire-shape follow-up). */
  serialize?(instance: T): unknown;
  /** Optional for a zero-arg class (default: `Object.assign(new cls(), data)`).
   *  Receives the data-only projection a structural decode produced (methods
   *  already gone) and returns a real instance. */
  deserialize?(data: DataOnly<T>): T;
}

/** A stored registry entry. The emitted factory bodies read `.serialize` /
 *  `.deserialize` / `.cls` off it. */
export interface ClassSerializerEntry<T = any> {
  /** The class constructor — used to instantiate on the auto-instantiate path
   *  and as the `v instanceof cls` identity check in a union. */
  cls: AnyClass<T>;
  serialize?: (instance: T) => unknown;
  deserialize?: (data: DataOnly<T>) => T;
}

// Module-level registry, keyed by the class's structural TYPE ID (the injected
// InjectRunTypeId slot), so it matches the emitted `utl.getClassSerializer(<id>)`
// lookup exactly (the emitter keys off `rt.ID`). A reverse `cls → key` map backs
// `unregisterClassSerializer(cls)` and registration introspection without needing
// the id re-injected. Last registration wins.
const classSerializers = new Map<string, ClassSerializerEntry>();
const classToKey = new Map<AnyClass, string>();

// Extract the registry key (the class's structural type id) from the injected
// trailing `id` slot. The plugin injects the entry-module tuple (like
// getRunTypeId); a wrapper / manual call may pass the bare id string. Without a
// plugin there is no injected id, so registration can't be keyed — throw, since
// the emitted codecs (which the plugin produces) could never match it anyway.
function classSerializerKey(id: InjectRunTypeId<unknown> | undefined, cls: AnyClass): string {
  if (isEntryTuple(id)) {
    initFromTuple(id as EntryTuple);
    return entryTupleKey(id as EntryTuple);
  }
  if (typeof id === 'string' && id.length > 0) return id;
  throw new Error(
    `[ts-runtypes] registerClassSerializer(${cls.name || '<anonymous>'}): no type id injected. ` +
      `The ts-runtypes-devtools plugin must process the registration file so the class's ` +
      `type id can be injected (the registry is keyed by type id, not name).`
  );
}

// Zero-arg constructor: everything optional. The client literally just hands
// over the class.
export function registerClassSerializer<T>(
  cls: SerializableClass<T>,
  handler?: ClassSerializerHandler<T>,
  id?: InjectRunTypeId<T>
): void;
// Non-empty constructor: `deserialize` is REQUIRED (auto `new cls()` is unavailable).
export function registerClassSerializer<T>(
  cls: AnyClass<T>,
  handler: ClassSerializerHandler<T> & {deserialize(data: DataOnly<T>): T},
  id?: InjectRunTypeId<T>
): void;
/** Register a custom (de)serializer for a user-defined class. Pass the class
 *  itself; the runtime gets its constructor (to instantiate) and the plugin
 *  injects the trailing `id` (the class's type id) that keys the registry.
 *  Overwrites any prior registration for the same class. */
export function registerClassSerializer<T>(cls: AnyClass<T>, handler?: ClassSerializerHandler<T>, id?: InjectRunTypeId<T>): void {
  if (typeof cls !== 'function') throw new Error('registerClassSerializer: cls must be a class constructor');
  const key = classSerializerKey(id, cls);
  const prior = classToKey.get(cls);
  if (prior && prior !== key) classSerializers.delete(prior);
  classSerializers.set(key, {
    cls,
    serialize: handler?.serialize as ((instance: any) => unknown) | undefined,
    deserialize: handler?.deserialize as ((data: any) => any) | undefined,
  });
  classToKey.set(cls, key);
}

/** Internal lookup used by emitted factory bodies via
 *  `utl.getClassSerializer(<typeId>)`. Returns undefined when no entry is
 *  registered for that type id (the factory then uses the structural fallback). */
export function getClassSerializer(typeId: string): ClassSerializerEntry | undefined {
  return classSerializers.get(typeId);
}

/** Test / introspection helper: is a serializer registered for this class? */
export function isClassSerializerRegistered(cls: AnyClass): boolean {
  return classToKey.has(cls);
}

/** Reconstruct a live instance from decoded data. Used by emitted decode
 *  bodies via `utl.deserializeClass(cs, data)`. Prefers the registered
 *  `deserialize`; otherwise auto-instantiates a zero-arg class and copies the
 *  decoded props over. Surfaces CLS002 with a clear, actionable message when
 *  the bare `new cls()` throws (constructor needs args, no `deserialize`
 *  registered) rather than a raw constructor stack. */
export function deserializeClass<T>(entry: ClassSerializerEntry<T>, data: DataOnly<T>): T {
  if (entry.deserialize) return entry.deserialize(data);
  try {
    return Object.assign(new entry.cls() as object, data) as T;
  } catch (err) {
    const original = err instanceof Error ? err.message : String(err);
    const name = entry.cls.name || '<anonymous>';
    throw new Error(
      `[CLS002] Cannot reconstruct class "${name}": the automatic \`new ${name}()\` failed, ` +
        `so its constructor needs arguments. Register a \`deserialize\` handler: ` +
        `registerClassSerializer(${name}, {deserialize: (data) => new ${name}(/* … */)}). ` +
        `Original error: ${original}`
    );
  }
}

/** Remove a single registered serializer by class reference (test isolation
 *  helper). Uses the reverse map, so no injected id is needed. */
export function unregisterClassSerializer(cls: AnyClass): void {
  const key = classToKey.get(cls);
  if (key === undefined) return;
  classSerializers.delete(key);
  classToKey.delete(cls);
}

/** Clear the whole registry (test isolation helper). */
export function clearClassSerializers(): void {
  classSerializers.clear();
  classToKey.clear();
}
