// Marker primitives — the type-level brands the Go binary scanner recognizes
// at call sites:
//   • `InjectRunTypeId<T>` — the only *injectable* marker. The trailing
//     `id?: InjectRunTypeId<T>` parameter is filled in at build time with the
//     resolved hash id by `runtypes-devtools`.
//   • `CompTimeArgs<T>` — brands an argument as "must be a literal at the
//     call site, or a module-scope `const` whose initializer is itself
//     entirely literal". Static check only, no injection.
//   • `PureFunction<F>` — brands a function-typed argument as "literal AND
//     passes purity rules". Static check only.
//
// Wrappers around `getRunTypeId` are supported — declare the same trailing
// parameter on the wrapper and the transformer treats it identically.

import {entryTupleKey, initFromTuple, isEntryTuple} from './runtypes/entryTuple.ts';

/**
 * Sentinel marker. `T` is a phantom type parameter used only by the checker /
 * transformer; at runtime an `InjectRunTypeId<T>` is just a short alphanumeric
 * hash string. The brand prevents stringly-typed APIs from accidentally
 * satisfying the marker.
 */
export type InjectRunTypeId<T> = string & {
  readonly __rtInjectRunTypeIdBrand?: T;
};

/**
 * Trailing-slot injection marker for the `createX` factories. Like
 * `InjectRunTypeId<T>` the transformer fills the `id?` parameter at build time,
 * but `InjectTypeFnArgs` carries one or more `Fn` type arguments naming the
 * function families (`'val'`, `'verr'`, `'jsonEncoder'`, …) the site needs for
 * `T`. The Go backend emits only the demanded function caches and the runtime
 * resolves the precise factories without recomputing a key.
 *
 * SINGLE function (the common case) — `InjectTypeFnArgs<T, 'val'>`: the injected
 * value is the family's entry-module tuple, resolved by the one `createX`.
 *
 * MULTIPLE functions — `InjectTypeFnArgs<T, 'val', 'verr'>`: the site needs
 * several compiled fns for the same `T` (e.g. `createStandardSchema` wants the
 * cheap boolean validator AND `getValidationErrors`). The injected value is an
 * ARRAY of entry-module tuples, ONE per named family in declaration order, and
 * the factory destructures it positionally. This keeps a single trailing marker
 * (one injection slot) rather than several markers.
 *
 * The declared type mirrors `InjectRunTypeId`'s `string & {brand}` shape (rather
 * than a tuple type) so the Go marker scanner resolves the alias + its type
 * arguments the same way it does for `InjectRunTypeId` — a tuple-intersection
 * alias does not reliably preserve `T`/`Fn` on the resolved type. `T` and the
 * `Fn` keys are phantom; the runtime value is the injected (array of) tuples.
 * Up to three `Fn` keys are supported today; add more optional parameters if a
 * future factory needs more.
 */
export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {
  readonly __rtInjectTypeFnArgsBrand?: T;
  readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3];
};

// NOTE: `any` is intentionally PERMITTED — there is no type-level `any` guard.
// `getRunTypeId<any>()` resolves a normal id; the runtime fn is a noop validator
// (accepts everything) and a best-effort serializer that emits a build-time
// diagnostic — the same treatment every other best-effort case gets. A
// type-level rejection would contradict that runtime behaviour, and can't be
// enforced anyway: the brand above is phantom (optional) and `any` is
// universally assignable, so it could never fire at a call site.

/**
 * Type-id marker. Returns the stable structural id of `T`. One function, two
 * call shapes — the optional value-first parameter mirrors every `createX`
 * factory:
 *
 *   - STATIC — bring the type, no value: `getRunTypeId<User>()`.
 *   - REFLECTION — let `T` be inferred from a runtime value:
 *     `getRunTypeId(user)`. The value is read only for its type; at runtime it
 *     is ignored, so nothing leaks into the output.
 *
 * Throws if the transformer is not active — the id can only be computed at
 * build time. The plugin injects the runtype's entry-module tuple at the
 * trailing `id` slot; the call registers the type (and its transitive children)
 * into rtUtils and returns the id string, so the public contract — "returns the
 * type id" — is unchanged.
 *
 * `T = any` is allowed (explicit `getRunTypeId<any>()`, or inferred from
 * `JSON.parse` / untyped library returns / `as any`): it resolves a normal id
 * whose runtime fn is a noop validator / best-effort serializer (with a
 * build-time diagnostic).
 */
export function getRunTypeId<T>(_value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T> {
  if (isEntryTuple(id)) {
    initFromTuple(id);
    return entryTupleKey(id) as InjectRunTypeId<T>;
  }
  if (id === undefined) {
    throw new Error('getRunTypeId(): no id injected. runtypes-devtools must be active.');
  }
  return id as InjectRunTypeId<T>;
}

/**
 * Compile-time-args marker. Brands a parameter so the Go scanner enforces
 * that the matching argument is *fully literal* — at the call site or via a
 * module-scope `const` whose initializer is itself entirely literal. No
 * spread, no calls, no property access, no template substitution, no ternary.
 * Violations produce `CTA0xx` diagnostics.
 *
 * It is the IDENTITY `T` (the value flows through unwrapped, and the marker
 * adds zero type-check cost). It deliberately carries NO phantom brand
 * property: intersecting one onto a TUPLE parameter — the old
 * `T & {__rtCompTimeArgsBrand?: never}` used by `tuple`/`union`/`func` —
 * cost ~700 TS instantiations per call (the array-literal-vs-tuple-intersection
 * check; see docs/value-first-typecheck-cost.md). The Go scanner therefore
 * detects this marker SYNTACTICALLY, off the parameter's `CompTimeArgs<…>` type
 * annotation, instead of off a brand property on the resolved type.
 */
export type CompTimeArgs<T> = T;

/**
 * Compile-time fn-args marker. Like `CompTimeArgs<T>` it brands a parameter so
 * the Go scanner enforces the argument is *fully literal* (`CTA0xx`), but it
 * ALSO marks this as the parameter whose literal value selects the `createX`
 * function variant — the `ValidateOptions` bag for `createValidate` /
 * `createGetValidationErrors`, the strategy for `createJsonEncoder` /
 * `createJsonDecoder`. The scanner reads it to compute the injected fn hash
 * (see `InjectTypeFnArgs`). Phantom intersection; the value flows through
 * unwrapped.
 */
export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};

/**
 * Pure-function marker. Brands a function-typed parameter so the Go scanner
 * enforces that the matching argument is *both* an inline function definition
 * *and* passes the purity rules (no `this`, no `await`/`yield`, no dynamic
 * `import`, no eval/Function, no outer-scope captures, no forbidden hosts).
 *
 * Strictly stronger than `CompTimeArgs<F>` when F is a function. Inline-shape
 * violations → `PFN001`; purity violations → `PFE9006`–`PFE9011`.
 */
export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
