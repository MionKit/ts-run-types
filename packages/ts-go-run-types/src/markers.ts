// Marker primitives — the type-level brands the Go binary scanner
// recognizes at call sites. Three markers in the family:
//
//   • `InjectRuntypeId<T>` — the only *injectable* marker. A function whose
//     trailing parameter is `id?: InjectRuntypeId<T>` opts into compile-
//     time type-id injection by `vite-plugin-runtypes`; every call site
//     has the resolved hash id written into that slot at build time.
//
//   • `CompTimeArgs<T>` — (Phase 2) brands an argument as "must be a
//     literal at the call site, or a module-scope `const` whose
//     initializer is itself entirely literal". Pure static check; no
//     injection.
//
//   • `PureFunction<F>` — (Phase 3) brands a function-typed argument as
//     "literal function definition AND passes purity rules". Reuses the
//     existing `purefns.CheckPurity` validation. Pure static check.
//
// Wrappers around `getRuntypeId` / `reflectRuntypeId` are supported —
// declare the same trailing parameter on the wrapper and the
// transformer treats it identically.

/**
 * Sentinel marker. The `T` is a phantom type parameter used only by the
 * checker / transformer; at runtime an `InjectRuntypeId<T>` is just a
 * short alphanumeric hash string assigned by the build step.
 *
 * The brand prevents stringly-typed APIs from accidentally satisfying the
 * marker. Without it, any `string` would be assignable to
 * `InjectRuntypeId<X>`, which would defeat the type-safety story for
 * callers reading ids back.
 */
export type InjectRuntypeId<T> = string & {
  readonly __mionInjectRuntypeIdBrand?: T;
};

// `any` poisons every downstream cache entry — the marker compiles into a
// noop validator that returns true / serializer that returns the value
// unchanged. The reflection form is the typical entry point for that
// failure mode (`reflectRuntypeId(JSON.parse(s))` where `JSON.parse`
// returns `any`). Rejecting `any` at the type level forces the caller to
// annotate the value or the type parameter explicitly — the resulting
// `never` collapses the marker call and the downstream `createXxx<T>`
// calls so the user sees the error at the marker site, not at runtime.
//
// Pattern: `0 extends 1 & T` is true ONLY when T is `any` (the
// intersection short-circuits to `any` and `0 extends any` is true; for
// any other T the intersection is the more specific type and 0 does not
// extend it). The branded `RejectAny` tuple lets the TypeScript error
// message at the call site read as a sentence rather than a structural
// mismatch.
type IsAny<T> = 0 extends 1 & T ? true : false;
type RejectAny<T> =
  IsAny<T> extends true ? ['ts-go-run-types error: `T` is `any` — annotate the value or type argument explicitly.'] : T;

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
 *
 * Passing `any` as `T` is rejected at the type level — `getRuntypeId<any>()`
 * is almost always a mistake (the resulting cache entry is a noop validator
 * that returns true for every input). Annotate explicitly with a concrete
 * type instead.
 */
export function getRuntypeId<T>(id?: InjectRuntypeId<T>): InjectRuntypeId<RejectAny<T>> {
  if (id === undefined) {
    throw new Error('getRuntypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id as InjectRuntypeId<RejectAny<T>>;
}

/**
 * Reflection marker. Use when you have a runtime value and want `T`
 * inferred from it: `reflectRuntypeId(user)`. The vite plugin rewrites the
 * call to `reflectRuntypeId(user, "<hash>")`.
 *
 * Same runtime contract as `getRuntypeId`: throws if the transformer is
 * not active. The `value` is purely for type inference and is ignored at
 * runtime.
 *
 * Passing a value whose inferred type is `any` (typical sources:
 * `JSON.parse`, untyped library returns, `as any` casts) is rejected at
 * the type level — the inferred validator would accept every input. Cast
 * or annotate the value to a concrete shape first.
 */
export function reflectRuntypeId<T>(_value: RejectAny<T>, id?: InjectRuntypeId<T>): InjectRuntypeId<RejectAny<T>> {
  if (id === undefined) {
    throw new Error('reflectRuntypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id as InjectRuntypeId<RejectAny<T>>;
}
