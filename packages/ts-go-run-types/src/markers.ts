// Marker primitives — the type-level brands the Go binary scanner recognizes
// at call sites:
//   • `InjectRuntypeId<T>` — the only *injectable* marker. The trailing
//     `id?: InjectRuntypeId<T>` parameter is filled in at build time with the
//     resolved hash id by `vite-plugin-runtypes`.
//   • `CompTimeArgs<T>` — brands an argument as "must be a literal at the
//     call site, or a module-scope `const` whose initializer is itself
//     entirely literal". Static check only, no injection.
//   • `PureFunction<F>` — brands a function-typed argument as "literal AND
//     passes purity rules". Static check only.
//
// Wrappers around `getRuntypeId` / `reflectRuntypeId` are supported — declare
// the same trailing parameter on the wrapper and the transformer treats it
// identically.

/**
 * Sentinel marker. `T` is a phantom type parameter used only by the checker /
 * transformer; at runtime an `InjectRuntypeId<T>` is just a short alphanumeric
 * hash string. The brand prevents stringly-typed APIs from accidentally
 * satisfying the marker.
 */
export type InjectRuntypeId<T> = string & {
  readonly __mionInjectRuntypeIdBrand?: T;
};

// `any` poisons every downstream cache entry — the marker compiles into a noop
// validator. Rejecting `any` at the type level forces callers to annotate the
// value or type parameter explicitly, surfacing the error at the marker site
// instead of at runtime.
//
// Pattern: `0 extends 1 & T` is true ONLY when T is `any`.
type IsAny<T> = 0 extends 1 & T ? true : false;
type RejectAny<T> =
  IsAny<T> extends true ? ['ts-go-run-types error: `T` is `any` — annotate the value or type argument explicitly.'] : T;

/**
 * Static marker. Use with an explicit type and no runtime value:
 * `getRuntypeId<User>()`. Throws if the transformer is not active —
 * the id can only be computed at build time.
 *
 * Rejects `T = any` at the type level since the resulting cache entry would
 * accept every input.
 */
export function getRuntypeId<T>(id?: InjectRuntypeId<T>): InjectRuntypeId<RejectAny<T>> {
  if (id === undefined) {
    throw new Error('getRuntypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id as InjectRuntypeId<RejectAny<T>>;
}

/**
 * Reflection marker. Use when `T` should be inferred from a runtime value:
 * `reflectRuntypeId(user)`. The `value` is only used for type inference and
 * is ignored at runtime. Throws if the transformer is not active.
 *
 * Rejects inferred-`any` (typical sources: `JSON.parse`, untyped library
 * returns, `as any` casts) at the type level.
 */
export function reflectRuntypeId<T>(_value: RejectAny<T>, id?: InjectRuntypeId<T>): InjectRuntypeId<RejectAny<T>> {
  if (id === undefined) {
    throw new Error('reflectRuntypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id as InjectRuntypeId<RejectAny<T>>;
}

/**
 * Compile-time-args marker. Brands a parameter so the Go scanner enforces
 * that the matching argument is *fully literal* — at the call site or via a
 * module-scope `const` whose initializer is itself entirely literal. No
 * spread, no calls, no property access, no template substitution, no ternary.
 * The brand is a phantom intersection, so the value flows through unwrapped.
 * Violations produce `CTA0xx` diagnostics.
 */
export type CompTimeArgs<T> = T & {readonly __mionCompTimeArgsBrand?: never};

/**
 * Pure-function marker. Brands a function-typed parameter so the Go scanner
 * enforces that the matching argument is *both* an inline function definition
 * *and* passes the purity rules (no `this`, no `await`/`yield`, no dynamic
 * `import`, no eval/Function, no outer-scope captures, no forbidden hosts).
 *
 * Strictly stronger than `CompTimeArgs<F>` when F is a function. Inline-shape
 * violations → `PFN001`; purity violations → `PFE9006`–`PFE9011`.
 */
export type PureFunction<F> = F & {readonly __mionPureFunctionBrand?: never};
