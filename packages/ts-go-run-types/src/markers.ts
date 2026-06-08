// Marker primitives — the type-level brands the Go binary scanner recognizes
// at call sites:
//   • `InjectRunTypeId<T>` — the only *injectable* marker. The trailing
//     `id?: InjectRunTypeId<T>` parameter is filled in at build time with the
//     resolved hash id by `vite-plugin-runtypes`.
//   • `CompTimeArgs<T>` — brands an argument as "must be a literal at the
//     call site, or a module-scope `const` whose initializer is itself
//     entirely literal". Static check only, no injection.
//   • `PureFunction<F>` — brands a function-typed argument as "literal AND
//     passes purity rules". Static check only.
//
// Wrappers around `getRunTypeId` / `reflectRunTypeId` are supported — declare
// the same trailing parameter on the wrapper and the transformer treats it
// identically.

/**
 * Sentinel marker. `T` is a phantom type parameter used only by the checker /
 * transformer; at runtime an `InjectRunTypeId<T>` is just a short alphanumeric
 * hash string. The brand prevents stringly-typed APIs from accidentally
 * satisfying the marker.
 */
export type InjectRunTypeId<T> = string & {
  readonly __mionInjectRunTypeIdBrand?: T;
};

/**
 * Trailing-slot injection marker for the `createX` factories. Like
 * `InjectRunTypeId<T>` the transformer fills the `id?` parameter at build time,
 * but `InjectTypeFnArgs` carries a second type argument `Fn` naming the function
 * family (`'it'`, `'te'`, `'jsonEncoder'`, …). The injected value is a
 * `[typeId, fnId]` tuple, so the Go backend emits only the demanded function
 * cache and the runtime resolves the precise factory without recomputing a key.
 *
 * The declared type mirrors `InjectRunTypeId`'s `string & {brand}` shape (rather
 * than a tuple type) so the Go marker scanner resolves the alias + its two type
 * arguments the same way it does for `InjectRunTypeId` — a tuple-intersection
 * alias does not reliably preserve `T`/`Fn` on the resolved type. `T`/`Fn` are
 * phantom; the runtime value is a two-string array injected post-typecheck.
 */
export type InjectTypeFnArgs<T, Fn extends string> = string & {
  readonly __mionInjectTypeFnArgsBrand?: T;
  readonly __mionInjectTypeFnArgsFn?: Fn;
};

// NOTE: `any` is intentionally PERMITTED — there is no type-level `any` guard.
// `getRunTypeId<any>()` resolves a normal id; the runtime fn is a noop validator
// (accepts everything) and a best-effort serializer that emits a build-time
// diagnostic — the same treatment every other best-effort case gets. A
// type-level rejection would contradict that runtime behaviour, and can't be
// enforced anyway: the brand above is phantom (optional) and `any` is
// universally assignable, so it could never fire at a call site.

/**
 * Static marker. Use with an explicit type and no runtime value:
 * `getRunTypeId<User>()`. Throws if the transformer is not active —
 * the id can only be computed at build time.
 *
 * `T = any` is allowed: it resolves a normal id whose runtime fn is a noop
 * validator / best-effort serializer (with a build-time diagnostic).
 */
export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (id === undefined) {
    throw new Error('getRunTypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id as InjectRunTypeId<T>;
}

/**
 * Reflection marker. Use when `T` should be inferred from a runtime value:
 * `reflectRunTypeId(user)`. The `value` is only used for type inference and
 * is ignored at runtime. Throws if the transformer is not active.
 *
 * Inferred-`any` (typical sources: `JSON.parse`, untyped library returns,
 * `as any` casts) is allowed — see the note above `getRunTypeId`.
 */
export function reflectRunTypeId<T>(_value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (id === undefined) {
    throw new Error('reflectRunTypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id as InjectRunTypeId<T>;
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
