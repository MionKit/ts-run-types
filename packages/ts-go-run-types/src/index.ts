// @mionjs/ts-go-run-types — the sentinel-marker primitives that opt a function
// into compile-time type-id injection by `vite-plugin-runtypes`.
//
// Any generic function whose trailing parameter is `id?: RuntypeId<T>` is
// scanned by the Go binary; every call site has the resolved hash id
// injected into that slot at build time. Users can wrap either helper
// below freely — declare the same trailing parameter on the wrapper and
// the transformer treats it identically.

/**
 * Sentinel marker. The `T` is a phantom type parameter used only by the
 * checker / transformer; at runtime a `RuntypeId<T>` is just a short
 * alphanumeric hash string assigned by the build step.
 *
 * The brand prevents stringly-typed APIs from accidentally satisfying the
 * marker. Without it, any `string` would be assignable to `RuntypeId<X>`,
 * which would defeat the type-safety story for callers reading ids back.
 */
export type RuntypeId<T> = string & {
  readonly __mionRuntypeBrand?: T;
};

/**
 * Static marker. Use when you have an explicit type and no runtime value:
 * `getRuntypeId<User>()`. The vite plugin rewrites the call to
 * `getRuntypeId<User>("<hash>")` — injecting the build-time-resolved id at
 * the trailing slot.
 *
 * Calling without the transformer active (i.e. without
 * `vite-plugin-runtypes` in the chain) throws: the helper depends on the
 * id being injected at compile time and has no way to compute one at
 * runtime in plain JS.
 */
export function getRuntypeId<T>(id?: RuntypeId<T>): RuntypeId<T> {
  if (id === undefined) {
    throw new Error('getRuntypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id;
}

/**
 * Reflection marker. Use when you have a runtime value and want `T`
 * inferred from it: `reflectRuntypeId(user)`. The vite plugin rewrites the
 * call to `reflectRuntypeId(user, "<hash>")`.
 *
 * Same runtime contract as `getRuntypeId`: throws if the transformer is
 * not active. The `value` is purely for type inference and is ignored at
 * runtime.
 */
export function reflectRuntypeId<T>(_value: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (id === undefined) {
    throw new Error('reflectRuntypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id;
}

// Cache lookup. The plugin emits a virtual module containing the
// fully-knotted reflection-shape Type graph keyed by hash id. Consumers use
// `getMeta(id)` to read metadata for a given id.
//
// The lookup is resolved lazily so this package can be imported without a
// hard dependency on the virtual cache module — useful for testing /
// library code that wants the marker type without pulling in the runtime.
let runtypeMetaResolver: ((id: RuntypeId<unknown>) => unknown | undefined) | undefined;

/**
 * Install the cache resolver. The vite-plugin-runtypes virtual module
 * calls this on first import so subsequent `getMeta(id)` calls hit the
 * cache. Library consumers should not call this directly.
 */
export function __setRuntypeMetaResolver(fn: (id: RuntypeId<unknown>) => unknown | undefined): void {
  runtypeMetaResolver = fn;
}

/**
 * Look up the reflection-shape Type metadata for a given id. Returns
 * `undefined` if the cache has not been wired up (no plugin active) or if
 * the id is unknown to the cache.
 */
export function getMeta(id: RuntypeId<unknown>): unknown | undefined {
  if (runtypeMetaResolver === undefined) return undefined;
  return runtypeMetaResolver(id);
}
