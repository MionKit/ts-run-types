// Per-branch correctness + instantiation-budget test for `DataOnly<T>`.
//
// Each `it` compiles a representative snippet for ONE branch of the mapping
// (src/runtypes/types.ts) through the real TypeScript compiler (see
// dataonlyHarness.ts) and asserts two things:
//   1. it type-checks cleanly — the projection is what we expect (the snippet's
//      `Expect<Equal<…>>` assertions fail to compile otherwise);
//   2. the NET instantiation count (case minus the constant empty-snippet
//      baseline) stays under an absolute budget — a recursion / exponential
//      blowup in that branch spikes the number and reds the test long before it
//      trips the hard TS2589 cap. The numbers are also per-branch data for
//      tuning an individual arm of the mapping.
//
// Each budget IS the branch's current net instantiation count — a one-way
// RATCHET that may only ever be lowered.
//
// ──────────────────── UPDATING A BUDGET — READ THIS ────────────────────
// Budgets are NOT auto-derived; you update them BY HAND. The test prints
// `net=… budget=…` for every branch on each run. After ANY change to DataOnly
// (src/runtypes/types.ts) or to a snippet here, re-run this suite and compare
// each printed `net` to its budget:
//
//   • net WENT DOWN  → you made the branch cheaper. Set its budget to the new
//                      (lower) net to lock the win in.
//   • net UNCHANGED  → nothing to do.
//   • net WENT UP    → a cost regression. Do NOT raise the budget to make the
//                      test pass — that silently defeats the guard. Fix DataOnly
//                      so the net returns to (or below) the current budget.
//
// A budget may ONLY ever be set LOWER than its current value, never higher. (A
// genuinely unavoidable increase — e.g. a deliberate new capability in the
// mapping — is a reviewed exception to call out explicitly in the PR, not the
// default path.) Counts are deterministic because `typescript` is exact-pinned;
// a TS version bump is the one event that re-baselines every branch.

import {describe, it, expect} from 'vitest';
import {measureDataOnly} from './dataonlyHarness.ts';

/** Compile `snippet`, assert it type-checks AND its net instantiation count is
 *  within `budget`. Returns the net count (handy when tuning). **/
function check(snippet: string, budget: number): number {
  const r = measureDataOnly(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  // eslint-disable-next-line no-console
  console.log(`    net=${String(r.netInstantiations).padStart(5)}  budget=${budget}`);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible DataOnly recursion/cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

describe('DataOnly<T> — per-branch correctness + instantiation budget', () => {
  it('atomics & broad kinds kept, symbol stripped', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<string>, string>>;
      type _02 = Expect<Equal<DataOnly<number>, number>>;
      type _03 = Expect<Equal<DataOnly<boolean>, boolean>>;
      type _04 = Expect<Equal<DataOnly<bigint>, bigint>>;
      type _05 = Expect<Equal<DataOnly<null>, null>>;
      type _06 = Expect<Equal<DataOnly<undefined>, undefined>>;
      type _07 = Expect<Equal<DataOnly<'lit'>, 'lit'>>;
      type _08 = Expect<Equal<DataOnly<42>, 42>>;
      type _09 = Expect<Equal<DataOnly<any>, any>>;
      type _10 = Expect<Equal<DataOnly<unknown>, unknown>>;
      type _11 = Expect<Equal<DataOnly<never>, never>>;
      type _12 = Expect<Equal<DataOnly<void>, void>>;
      type _13 = Expect<Equal<DataOnly<object>, object>>;
      type _14 = Expect<Equal<DataOnly<symbol>, never>>;
      `,
      551
    );
  });

  it('native host types kept verbatim', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<Date>, Date>>;
      type _02 = Expect<Equal<DataOnly<RegExp>, RegExp>>;
      type _03 = Expect<Equal<DataOnly<Uint8Array>, Uint8Array>>;
      type _04 = Expect<Equal<DataOnly<Int8Array>, Int8Array>>;
      type _05 = Expect<Equal<DataOnly<Float64Array>, Float64Array>>;
      type _06 = Expect<Equal<DataOnly<ArrayBuffer>, ArrayBuffer>>;
      type _07 = Expect<Equal<DataOnly<DataView>, DataView>>;
      type _08 = Expect<Equal<DataOnly<URL>, URL>>;
      `,
      2251
    );
  });

  it('Temporal kept verbatim (via DataOnlyNativeExtra augmentation)', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<Temporal.Instant>, Temporal.Instant>>;
      type _02 = Expect<Equal<DataOnly<Temporal.ZonedDateTime>, Temporal.ZonedDateTime>>;
      type _03 = Expect<Equal<DataOnly<Temporal.PlainDate>, Temporal.PlainDate>>;
      type _04 = Expect<Equal<DataOnly<Temporal.Duration>, Temporal.Duration>>;
      type _05 = Expect<Equal<DataOnly<{at: Temporal.Instant; name: string}>, {at: Temporal.Instant; name: string}>>;
      `,
      357
    );
  });

  it('functions & constructors stripped to never', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<() => void>, never>>;
      type _02 = Expect<Equal<DataOnly<(a: string, b: number) => boolean>, never>>;
      type _03 = Expect<Equal<DataOnly<new (x: number) => Date>, never>>;
      type _04 = Expect<Equal<DataOnly<abstract new () => Date>, never>>;
      `,
      83
    );
  });

  it('Promise / thenables stripped to never', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<Promise<string>>, never>>;
      type _02 = Expect<Equal<DataOnly<Promise<void>>, never>>;
      type _03 = Expect<Equal<DataOnly<Promise<{a: string}>>, never>>;
      type _04 = Expect<Equal<DataOnly<{then: (...a: never[]) => unknown}>, never>>;
      `,
      84
    );
  });

  it('Map / Set kept verbatim (no element recursion)', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<Map<string, number>>, Map<string, number>>>;
      type _02 = Expect<Equal<DataOnly<Set<string>>, Set<string>>>;
      type _03 = Expect<Equal<DataOnly<ReadonlyMap<string, number>>, ReadonlyMap<string, number>>>;
      type _04 = Expect<Equal<DataOnly<Map<string, () => void>>, Map<string, () => void>>>;
      `,
      815
    );
  });

  it('arrays — homomorphic, element projected', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<string[]>, string[]>>;
      type _02 = Expect<Equal<DataOnly<number[][]>, number[][]>>;
      type _03 = Expect<Equal<DataOnly<readonly string[]>, string[]>>;
      type _04 = Expect<Equal<DataOnly<(() => void)[]>, never[]>>;
      type _05 = Expect<Equal<DataOnly<{a: string; fn: () => void}[]>, {a: string}[]>>;
      `,
      746
    );
  });

  it('tuples — slots projected in place, modifiers & Parameters<Fn> preserved', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<[string, number]>, [string, number]>>;
      type _02 = Expect<Equal<DataOnly<readonly [string, number]>, [string, number]>>;
      type _03 = Expect<Equal<DataOnly<[a?: string, b?: number]>, [a?: string, b?: number]>>;
      type _04 = Expect<Equal<DataOnly<[name: string, age: number]>, [string, number]>>;
      type _05 = Expect<Equal<DataOnly<[string, () => void]>, [string, never]>>;
      type _06 = Expect<Equal<DataOnly<[]>, []>>;
      type _07 = Expect<Equal<DataOnly<Parameters<(a: string, b: number) => void>>, [a: string, b: number]>>;
      `,
      2642
    );
  });

  it('objects — drop methods / symbol keys / never-valued, keep modifiers', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<{a: string; b: number}>, {a: string; b: number}>>;
      type _02 = Expect<Equal<DataOnly<{a: string; fn: () => void}>, {a: string}>>;
      type _03 = Expect<Equal<DataOnly<{a: string; greet(): string}>, {a: string}>>;
      type _04 = Expect<Equal<DataOnly<{a: string; s: symbol}>, {a: string}>>;
      type _05 = Expect<Equal<DataOnly<{readonly a: string; b?: number}>, {readonly a: string; b?: number}>>;
      type _06 = Expect<Equal<DataOnly<{outer: {inner: string; fn: () => void}}>, {outer: {inner: string}}>>;
      type _07 = Expect<Equal<DataOnly<{p: Promise<string>; a: number}>, {a: number}>>;
      `,
      1043
    );
  });

  it('unions — non-data arms dropped', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<string | (() => void)>, string>>;
      type _02 = Expect<Equal<DataOnly<string | symbol>, string>>;
      type _03 = Expect<Equal<DataOnly<number | Promise<number>>, number>>;
      type _04 = Expect<Equal<DataOnly<string | number>, string | number>>;
      type _05 = Expect<Equal<DataOnly<{a: string} | {b: number}>, {a: string} | {b: number}>>;
      `,
      384
    );
  });

  it('intersections — merged, non-data members dropped', () => {
    check(
      `
      type _01 = Expect<Equal<DataOnly<{a: string} & {b: number}>, {a: string; b: number}>>;
      type _02 = Expect<Equal<DataOnly<{a: string} & {fn: () => void}>, {a: string}>>;
      `,
      346
    );
  });

  it('circular — self-referential linked list', () => {
    check(
      `
      interface LinkedList { value: number; next?: LinkedList }
      type _01 = Expect<Assignable<DataOnly<LinkedList>, LinkedList>>;
      type _02 = Expect<Assignable<LinkedList, DataOnly<LinkedList>>>;
      type _03 = Expect<Equal<DataOnly<LinkedList>['value'], number>>;
      `,
      639
    );
  });

  it('circular — mutually recursive cross-reference', () => {
    check(
      `
      interface NodeA { x: string; b?: NodeB }
      interface NodeB { y: number; a?: NodeA }
      type _01 = Expect<Equal<DataOnly<NodeA>['x'], string>>;
      type _02 = Expect<Equal<DataOnly<NodeB>['y'], number>>;
      type _03 = Expect<Assignable<DataOnly<NodeA>, NodeA>>;
      `,
      1178
    );
  });

  it('circular — tree (recursive via array) drops a member at every level', () => {
    check(
      `
      interface Tree { name: string; onClick: () => void; children: Tree[] }
      type _01 = Expect<Equal<keyof DataOnly<Tree>, 'name' | 'children'>>;
      type _02 = Expect<Equal<DataOnly<Tree>['children'], DataOnly<Tree>[]>>;
      `,
      871
    );
  });

  it('circular — root-level recursive tuple (the old TS2589 case)', () => {
    check(
      `
      type TupleCircular = [number, string, TupleCircular?];
      type _01 = Expect<Equal<DataOnly<TupleCircular>[0], number>>;
      type _02 = Expect<Assignable<DataOnly<TupleCircular>, readonly unknown[]>>;
      `,
      836
    );
  });

  it('circular — recursive JSON value (union + index signature + array)', () => {
    check(
      `
      type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
      type _01 = Expect<Assignable<DataOnly<Json>, Json>>;
      type _02 = Expect<Assignable<Json, DataOnly<Json>>>;
      `,
      1558
    );
  });

  it('circular — deep nesting + back-refs + stripped members + native + Map', () => {
    check(
      `
      interface Deep {
        id: string;
        fn: () => void;
        token: symbol;
        pending: Promise<number>;
        when: Date;
        child?: Deep;
        bag: { inner?: Deep; cb: () => void; count: number; index: Map<string, Deep> };
      }
      type _01 = Expect<Equal<keyof DataOnly<Deep>, 'id' | 'when' | 'child' | 'bag'>>;
      type _02 = Expect<Equal<keyof DataOnly<Deep>['bag'], 'inner' | 'count' | 'index'>>;
      type _03 = Expect<Equal<DataOnly<Deep>['when'], Date>>;
      type _04 = Expect<Equal<DataOnly<Deep>['bag']['index'], Map<string, Deep>>>;
      `,
      2034
    );
  });
});
