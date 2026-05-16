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

export {
  flattenUnionDiscriminators,
  type DiscriminatorPropLike,
  type DiscriminatorUnionLike,
  type FlattenedDiscriminator,
} from './unionDiscriminator.ts';
