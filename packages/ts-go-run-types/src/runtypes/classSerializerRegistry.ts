/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Custom (de)serializer registry for user-defined classes, keyed by class
// name. The JSON (pj / pjs / rj / sj) and binary (tb / fb) families
// consult this registry for plain user classes (KindClass + SubKindNone):
// when a serializer is registered for the class name the emitted factory
// routes through it instead of the structural object emit; when none is
// registered the families fall back to the structural shape and the Go
// compiler emits a build-time CLS001 Warning pointing the user here.
//
// Contract (locked by review — see docs/audit for T7):
//   - serialize(instance) returns JSON-ready data (a plain JS value). The
//     pipeline then stringifies / encodes that data.
//   - deserialize(data) receives the parsed JSON-ready value and returns
//     the reconstructed instance.
//
// Builtins (Date / Map / Set / RegExp / nonSerializable) are NOT routed
// through this registry — those arms are handled structurally by the
// emitters and are not overridable. validate / getValidationErrors are unaffected:
// they always validate the class by its structural shape.

/** Custom serializer/deserializer pair for one user-defined class. */
export interface ClassSerializer<T = any> {
  /** Turn an instance into JSON-ready data (a plain JS value). The
   *  pipeline stringifies / binary-encodes the returned value. */
  serialize(instance: T): unknown;
  /** Rebuild the instance from the parsed JSON-ready value produced by
   *  serialize (after the wire round-trip). */
  deserialize(data: unknown): T;
}

// Module-level registry. One ClassSerializer per class name. Last
// registration wins (re-registering the same name overwrites — keeps
// HMR + per-test register/clear cycles simple).
const classSerializers = new Map<string, ClassSerializer>();

/** Register a custom serializer/deserializer for a user-defined class,
 *  keyed by the class name (matches the emitted `utl.getClassSerializer(name)`
 *  lookup). Overwrites any prior registration for the same name. */
export function registerClassSerializer<T>(className: string, handler: ClassSerializer<T>): void {
  if (!className) throw new Error('registerClassSerializer: className must be a non-empty string');
  classSerializers.set(className, handler as ClassSerializer);
}

/** Internal lookup used by emitted factory bodies via
 *  `utl.getClassSerializer(<name>)`. Returns undefined when no serializer
 *  is registered for the name (the factory then uses the structural
 *  fallback). */
export function getClassSerializer(className: string): ClassSerializer | undefined {
  return classSerializers.get(className);
}

/** Remove a single registered serializer (test isolation helper). */
export function unregisterClassSerializer(className: string): void {
  classSerializers.delete(className);
}

/** Clear the whole registry (test isolation helper). */
export function clearClassSerializers(): void {
  classSerializers.clear();
}
