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

import type {RunType} from './runtypes/types.ts';

/**
 * Sentinel marker. `T` is a phantom type parameter used only by the checker /
 * transformer; at runtime an `InjectRunTypeId<T>` is just a short alphanumeric
 * hash string. The brand prevents stringly-typed APIs from accidentally
 * satisfying the marker.
 */
export type InjectRunTypeId<T> = string & {
  readonly __mionInjectRunTypeIdBrand?: T;
};

// `any` poisons every downstream cache entry — the marker compiles into a noop
// validator. Rejecting `any` at the type level forces callers to annotate the
// value or type parameter explicitly, surfacing the error at the marker site
// instead of at runtime.
//
// Pattern: `0 extends 1 & T` is true ONLY when T is `any`.
type IsAny<T> = 0 extends 1 & T ? true : false;
// Exported so the value-first builders (`runType` / `reflectRunType` in
// define/reflect.ts) reject `any` at the type level the same way `getRunTypeId`
// / `reflectRunTypeId` do — one source of truth for the rejection brand.
export type RejectAny<T> =
  IsAny<T> extends true ? ['ts-go-run-types error: `T` is `any` — annotate the value or type argument explicitly.'] : T;

/**
 * Static marker. Use with an explicit type and no runtime value:
 * `getRunTypeId<User>()`. Throws if the transformer is not active —
 * the id can only be computed at build time.
 *
 * Rejects `T = any` at the type level since the resulting cache entry would
 * accept every input.
 */
export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<RejectAny<T>> {
  if (id === undefined) {
    throw new Error('getRunTypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id as InjectRunTypeId<RejectAny<T>>;
}

/**
 * Reflection marker. Use when `T` should be inferred from a runtime value:
 * `reflectRunTypeId(user)`. The `value` is only used for type inference and
 * is ignored at runtime. Throws if the transformer is not active.
 *
 * Rejects inferred-`any` (typical sources: `JSON.parse`, untyped library
 * returns, `as any` casts) at the type level.
 */
export function reflectRunTypeId<T>(_value: RejectAny<T>, id?: InjectRunTypeId<T>): InjectRunTypeId<RejectAny<T>> {
  if (id === undefined) {
    throw new Error('reflectRunTypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id as InjectRunTypeId<RejectAny<T>>;
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
 * Schema-reference marker. Brands a `createXFor` parameter as "this argument is
 * a `RunType` schema whose structural id must be resolvable at build time": the
 * Go scanner traces it back to the value-first builder call that created it and
 * records a demand so that builder's factories get emitted (demand-driven
 * emission). It is a PURE alias of `RunType<T>` — no phantom brand — because
 * detection rides on the alias symbol name alone and `RunType<T>` never
 * distributes over a union (so the alias always survives). The referenced schema
 * must be a builder call or a module-scope `const` bound to one; a dynamic
 * reference (`cond ? a : b`, a loop) can't be resolved at build time and
 * produces an `MKR006` diagnostic. Runtime shape is just `RunType<T>`, so the
 * value still carries `.id`.
 */
export type CompTimeRunType<T> = RunType<T>;

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
