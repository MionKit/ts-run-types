// `FriendlyType<T>` — the human-readable enrichment map for a type: a combined
// per-field LABEL + ERROR-MESSAGE mapping, authored once and committed (see
// docs/AI_ENRICHMENT.md). Pure type-level here; `createFriendly` (./createFriendly.ts)
// renders validation errors against it at runtime.
//
// The recursive `FriendlyNode` follows the `DataOnly<T>` construction
// (src/runtypes/dataOnly.ts): depth-bounded via a tuple-decrement budget, NO
// `infer` on the hot path (element/property types reached with `T[number]` /
// `T[K]`), scalar-before-object `extends` gates, and a homomorphic
// `{ [K in keyof T]?: … }` child map that preserves structure for free. The
// `#region friendlytype-extract` block is sliced VERBATIM by
// test/types/enrichHarness.ts into the instantiation-budget compile test, so
// it must reference only `lib` types + its own declarations.

// #region friendlytype-extract — FriendlyType machinery; sliced verbatim between
// these markers by test/types/enrichHarness.ts. Self-contained: `lib` + own decls only.

/** A friendly message template — a plain string with `$[…]` placeholders the
 *  renderer substitutes: `$[label]` (the field's label, or its raw name),
 *  `$[val]` (the failed constraint's bound), `$[path]` (dotted path),
 *  `$[index]` (array element index). */
export type FriendlyTemplate = string;

/** One failed sub-constraint, as handed to a function-form `$errors` handler.
 *  `val` is the violated bound (e.g. `3` for a `minLength: 3` failure). */
export interface FailedConstraint {
  val?: string | number | boolean | bigint;
}

/** The aggregated failed-constraint bag passed to a function-form `$errors`
 *  handler — one entry per failure at the field, keyed by the
 *  `(format.name, formatPath-tail)` discriminator: `type` for the base
 *  type-shape failure, `minLength` / `max` / `pattern` / … for format failures.
 *  Absent keys mean that constraint passed (or the type never declared it). */
export type FailedConstraints = Record<string, FailedConstraint | undefined>;

/** Per-field error rendering. EITHER the pure-data form — a record of templates
 *  keyed by the failed-constraint name (`type` = base failure, `$default` =
 *  fallback, plus any format sub-constraint) — OR an inline function for logic
 *  the data form can't express (joining constraints, pluralization, i18n). The
 *  data form gets compile-time placeholder/constraint validation; a function
 *  body is opaque to the compiler. */
export type ErrorTemplates =
  | ({type?: FriendlyTemplate; $default?: FriendlyTemplate} & {[constraint: string]: FriendlyTemplate | undefined})
  | ((failed: FailedConstraints) => string);

/** Meta keys on every node: a human label + the field's error templates, both
 *  REQUIRED — every node must be addressed (the `@todo`/diagnostic layer enforces
 *  that the VALUES are filled, which TS can't see). `__rt_typeName` is the lone
 *  optional meta: a friendly name for a NAMED type (`PG_User` → `'User'`),
 *  defaulting to the reflected type name. The `__rt_` prefix (not `$`) keeps it
 *  from colliding with a real field key in the homomorphic child map. */
export interface FriendlyMeta {
  $label: string;
  $errors: ErrorTemplates;
  __rt_typeName?: string;
}

/** Scalar / native kinds that carry only meta (no child fields). */
type FriendlyLeaf = string | number | boolean | bigint | null | undefined | Date | RegExp;

/** Recursion-budget decrement: `_FriendlyDepth[N]` is `N - 1` (`[0]` is `never`,
 *  never reached — the `Depth extends 0` guard stops first). Bounds circular /
 *  mutually-recursive types to a finite instantiation (no TS2589). */
type _FriendlyDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Recursive friendly node — structural per solution A (docs/AI_ENRICHMENT.md):
 *  composite kinds reflect their structure, NOT an opaque leaf. Scalars/natives →
 *  meta only; tuples → meta + per-slot homomorphic `$slots` (`{[K in keyof T]}`);
 *  `Map` → meta + `$keys`/`$values`; `Set` → meta + `$values`; arrays → meta +
 *  `$items` (element node, via `T[number]`); objects → meta + a homomorphic
 *  optional child map. Branch order is most-specific-first; `Map`/`Set` gates run
 *  BEFORE the array check (a Map is not an array, but the cheap `Readonly{Map,Set}`
 *  gates keep `infer` off the hot path, mirroring `DataOnly`). NOTE: index
 *  signatures + object-member unions are OUT OF SCOPE here — index-sig objects
 *  still fall through to the homomorphic object map as today. */
export type FriendlyNode<T, Depth extends number = 8> = Depth extends 0
  ? FriendlyMeta // budget spent — keep as a leaf
  : T extends FriendlyLeaf
    ? FriendlyMeta // scalar / native — no children
    : // Map BEFORE the array check: cheap `ReadonlyMap<any, any>` gate filters
      // non-Maps so the `infer K, V` never runs off the hot path (per DataOnly).
      T extends ReadonlyMap<any, any>
      ? T extends ReadonlyMap<infer K, infer V>
        ? FriendlyMeta & {$keys: FriendlyNode<K, _FriendlyDepth[Depth]>; $values: FriendlyNode<V, _FriendlyDepth[Depth]>}
        : FriendlyMeta // unreachable — gate guarantees a Map
      : T extends ReadonlySet<any>
        ? T extends ReadonlySet<infer U>
          ? FriendlyMeta & {$values: FriendlyNode<U, _FriendlyDepth[Depth]>}
          : FriendlyMeta // unreachable — gate guarantees a Set
        : T extends readonly unknown[]
          ? // tuple vs array: a tuple has a literal `length`, an array's `length`
            // is the broad `number`. Tuple → per-slot homomorphic `$slots`
            // (`{[K in keyof tuple]}` yields a tuple type — the intended
            // `$slots: [node, node]`); array → `$items` element node.
            number extends T['length']
            ? FriendlyMeta & {$items: FriendlyNode<T[number], _FriendlyDepth[Depth]>}
            : FriendlyMeta & {$slots: {[K in keyof T]: FriendlyNode<T[K], _FriendlyDepth[Depth]>}}
          : T extends object
            ? FriendlyMeta & {[K in keyof T]-?: FriendlyNode<T[K], _FriendlyDepth[Depth]>}
            : FriendlyMeta;

/** The friendly map for `T` — combined labels + per-field error templates,
 *  validated against `T` at scan time (the `ShapeCheckedArgs<T>` axis). */
export type FriendlyType<T> = FriendlyNode<T>;
// #endregion friendlytype-extract
