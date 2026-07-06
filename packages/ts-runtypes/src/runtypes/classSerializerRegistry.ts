/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Custom (de)serializer registry for user-defined classes. The JSON (pj /
// pjs / rj / sj) and binary (tb / fb) families consult this registry for
// plain user classes (KindClass + SubKindNone): the emitted factory looks
// the entry up by class name through `utl.getClassSerializer(name)` and,
// when present, routes reconstruction (and optionally serialization)
// through it instead of the structural object emit. When no entry is
// registered the families fall back to the structural shape and the Go
// compiler emits a build-time CLS001 Warning pointing the user here.
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
// `classID` (`<namespace>::<ClassName>`) is stored on every entry but is not
// yet written to the wire: it is reserved for the future `rt$classID` JSON
// union discriminant (Phase 1b, see docs/partially/class-serializer-optional-serialize.md).
// Reconstruction today is positional — the compiler knows which class a given
// position holds and looks the entry up by name at that position.

import type {DataOnly} from './dataOnly.ts';

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
 *  `.deserialize` / `.classID` / `.cls` off it. */
export interface ClassSerializerEntry<T = any> {
  /** The class constructor — used to instantiate on the auto-instantiate path. */
  cls: AnyClass<T>;
  /** Globally-unique identity `<namespace>::<ClassName>`. Reserved for the
   *  future `rt$classID` JSON union discriminant; not yet written to the wire. */
  classID: string;
  serialize?: (instance: T) => unknown;
  deserialize?: (data: DataOnly<T>) => T;
}

// Module-level registry, keyed by BARE class name (`cls.name`) so it matches
// the emitted `utl.getClassSerializer(name)` lookup — the compiler keys off
// `rt.TypeName` and needs no namespace. Last registration wins (re-registering
// the same name overwrites — keeps HMR + per-test register/clear cycles simple).
const classSerializers = new Map<string, ClassSerializerEntry>();

// Zero-arg constructor: everything optional. The client literally just hands
// over the class.
export function registerClassSerializer<T>(
  namespace: string,
  cls: SerializableClass<T>,
  handler?: ClassSerializerHandler<T>
): void;
// Non-empty constructor: `deserialize` is REQUIRED (auto `new cls()` is unavailable).
export function registerClassSerializer<T>(
  namespace: string,
  cls: AnyClass<T>,
  handler: ClassSerializerHandler<T> & {deserialize(data: DataOnly<T>): T}
): void;
/** Register a custom (de)serializer for a user-defined class. `namespace` is
 *  a short owner string (mirroring the `"namespace::fnName"` pure-fn key
 *  convention) that makes the on-wire `classID` globally unique; `cls` is the
 *  class itself, giving the runtime the constructor to instantiate and its
 *  name (no more hand-typed strings). Overwrites any prior registration for
 *  the same class name. */
export function registerClassSerializer<T>(namespace: string, cls: AnyClass<T>, handler?: ClassSerializerHandler<T>): void {
  if (!namespace) throw new Error('registerClassSerializer: namespace must be a non-empty string');
  if (typeof cls !== 'function' || !cls.name) {
    throw new Error('registerClassSerializer: cls must be a named class (an anonymous class cannot be routed)');
  }
  classSerializers.set(cls.name, {
    cls,
    classID: namespace + '::' + cls.name,
    serialize: handler?.serialize as ((instance: any) => unknown) | undefined,
    deserialize: handler?.deserialize as ((data: any) => any) | undefined,
  });
}

/** Internal lookup used by emitted factory bodies via
 *  `utl.getClassSerializer(<name>)`. Returns undefined when no entry is
 *  registered for the class name (the factory then uses the structural
 *  fallback). */
export function getClassSerializer(className: string): ClassSerializerEntry | undefined {
  return classSerializers.get(className);
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
    throw new Error(
      `[CLS002] Cannot reconstruct class "${entry.classID}": the automatic \`new ${entry.cls.name}()\` failed, ` +
        `so its constructor needs arguments. Register a \`deserialize\` handler: ` +
        `registerClassSerializer('<namespace>', ${entry.cls.name}, {deserialize: (data) => new ${entry.cls.name}(/* … */)}). ` +
        `Original error: ${original}`
    );
  }
}

/** Remove a single registered serializer (test isolation helper). Accepts the
 *  class or its bare name. */
export function unregisterClassSerializer(cls: AnyClass | string): void {
  classSerializers.delete(typeof cls === 'string' ? cls : cls.name);
}

/** Clear the whole registry (test isolation helper). */
export function clearClassSerializers(): void {
  classSerializers.clear();
}
