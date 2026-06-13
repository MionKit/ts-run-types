// `MockData<T>` — the realistic sample-value enrichment map for a type: per-field
// pools / ranges / element + length / overrides that feed the existing
// `createMockType<T>()` generator (see docs/AI_ENRICHMENT.md). The AI supplies
// realistic values; the mechanical generator stays deterministic.
//
// Same construction as `FriendlyNode` (./friendlyType.ts) and `DataOnly<T>`
// (src/runtypes/dataOnly.ts): depth-bounded tuple decrement, NO `infer` on the
// hot path (`T[number]` / `T[K]`), scalar-before-object gates, homomorphic child
// map. The `#region mockdata-extract` block is sliced VERBATIM by
// test/types/enrichmentHarness.ts into the instantiation-budget compile test, so
// it must reference only `lib` types + its own declarations.

// #region mockdata-extract — MockData machinery; sliced verbatim between these
// markers by test/types/enrichmentHarness.ts. Self-contained: `lib` + own decls only.

/** Recursion-budget decrement: `_MockDepth[N]` is `N - 1`. Bounds circular /
 *  mutually-recursive types to a finite instantiation (no TS2589). */
type _MockDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** Recursive mock-data node. Numbers → pool + min/max; strings → pool; Date →
 *  pool + min/max; arrays/tuples → element node (`$items`) + `$length`; objects
 *  → homomorphic optional child map + `$optional` (present-probability for
 *  optional members); other leaves (boolean, bigint, …) → a value pool. */
export type MockNode<T, Depth extends number = 8> = Depth extends 0
  ? {pool?: T[]} // budget spent — keep as a leaf pool
  : T extends readonly unknown[]
    ? {$items?: MockNode<T[number], _MockDepth[Depth]>; $length?: number | [number, number]}
    : T extends number
      ? {pool?: number[]; min?: number; max?: number}
      : T extends string
        ? {pool?: string[]}
        : T extends Date
          ? {pool?: Date[]; min?: Date; max?: Date}
          : T extends RegExp
            ? {pool?: RegExp[]}
            : // boolean / bigint BEFORE the object branch and BEFORE the fallback:
              // `boolean` is `true | false`, so a fallback `{pool?: T[]}` would
              // distribute to `{pool?: true[]} | {pool?: false[]}`. A branch whose
              // result element type is FIXED (`boolean` / `bigint`, not `T`)
              // collapses back to one node on reassembly.
              T extends boolean
              ? {pool?: boolean[]}
              : T extends bigint
                ? {pool?: bigint[]}
                : T extends object
                  ? {[K in keyof T]?: MockNode<T[K], _MockDepth[Depth]>} & {$optional?: number}
                  : {pool?: T[]};

/** The mock-data map for `T`, validated against `T` at scan time — every pool /
 *  range value is checked against the field's type + format (the MD003 rule). */
export type MockData<T> = MockNode<T>;
// #endregion mockdata-extract
