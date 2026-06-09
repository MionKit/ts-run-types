// Type-level hardening test for `DataOnly<T>` (see src/runtypes/types.ts).
//
// This file is TYPE-CHECKED — via `tsconfig.test.json` / `pnpm typecheck:test`
// — but NEVER executed by vitest: the `.type-test.ts` suffix sits outside the
// `*.{test,spec}.ts` run glob, so there is no runtime cost and no empty-suite
// error. Every `Expect<…>` forces TS to FULLY evaluate `DataOnly` on the type,
// so a wrong projection is a compile error. The deeply-nested / circular cases
// additionally prove `DataOnly` never trips the instantiation-depth cap
// (TS2589) — if it did, evaluating the assertion would fail to compile.
//
// Temporal types resolve from test/temporal-ambient.d.ts; the "keep Temporal"
// augmentation lives in src/formats/datetime/temporalFormats.ts, which is
// always part of the test program (src/**), so `DataOnly<Temporal.Instant>`
// stays `Temporal.Instant` here.

import type {DataOnly} from '@mionjs/ts-go-run-types';

// ─────────────────────────── assertion helpers ───────────────────────────

/** Strict, bidirectional type equality (the invariant-position trick — it
 *  distinguishes `any` from every other type and `{a}` from `{a; b}`). **/
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
/** One-directional assignability — used for circular shapes where a strict
 *  `Equal` against a hand-written recursive type is brittle. **/
type Assignable<A, B> = A extends B ? true : false;

// ════════════════════════════ atomics / broad ════════════════════════════
type _a01 = Expect<Equal<DataOnly<string>, string>>;
type _a02 = Expect<Equal<DataOnly<number>, number>>;
type _a03 = Expect<Equal<DataOnly<boolean>, boolean>>;
type _a04 = Expect<Equal<DataOnly<bigint>, bigint>>;
type _a05 = Expect<Equal<DataOnly<null>, null>>;
type _a06 = Expect<Equal<DataOnly<undefined>, undefined>>;
type _a07 = Expect<Equal<DataOnly<'literal'>, 'literal'>>;
type _a08 = Expect<Equal<DataOnly<42>, 42>>;
type _a09 = Expect<Equal<DataOnly<true>, true>>;
// any / unknown pass through (the emitter best-effort accepts the broad kinds).
type _a10 = Expect<Equal<DataOnly<any>, any>>;
type _a11 = Expect<Equal<DataOnly<unknown>, unknown>>;
// `never` stays `never`; broad `object` is kept.
type _a12 = Expect<Equal<DataOnly<never>, never>>;
type _a13 = Expect<Equal<DataOnly<void>, void>>;
type _a14 = Expect<Equal<DataOnly<object>, object>>;
// `symbol` is non-data → stripped.
type _a15 = Expect<Equal<DataOnly<symbol>, never>>;
declare const SYM: unique symbol;
type _a16 = Expect<Equal<DataOnly<typeof SYM>, never>>;

// ═══════════════════════════ native (kept verbatim) ═══════════════════════
type _n01 = Expect<Equal<DataOnly<Date>, Date>>;
type _n02 = Expect<Equal<DataOnly<RegExp>, RegExp>>;
type _n04 = Expect<Equal<DataOnly<Uint8Array>, Uint8Array>>;
type _n05 = Expect<Equal<DataOnly<ArrayBuffer>, ArrayBuffer>>;
type _n06 = Expect<Equal<DataOnly<DataView>, DataView>>;
type _n07 = Expect<Equal<DataOnly<Int8Array>, Int8Array>>;
type _n08 = Expect<Equal<DataOnly<Float64Array>, Float64Array>>;
// NOTE: `URL`/`URLSearchParams`/`Blob` are deliberately NOT asserted here — under
// this suite's `types:["node"] + lib:dom` they are doubly-declared (DOM + @types/node)
// and the two declarations don't structurally match across the module boundary, so
// `DataOnly<URL>` projects in THIS program even though a single-declaration consumer
// keeps it. They remain in the runtime `Native` keep-list regardless.

// ═════════════════════ Temporal (kept via augmentation) ═══════════════════
// If the formats/temporal augmentation regresses, these flip to the mangled
// structural projection and the `Equal` assertions fail — so this section
// doubles as the augmentation's regression guard.
type _t01 = Expect<Equal<DataOnly<Temporal.Instant>, Temporal.Instant>>;
type _t02 = Expect<Equal<DataOnly<Temporal.ZonedDateTime>, Temporal.ZonedDateTime>>;
type _t03 = Expect<Equal<DataOnly<Temporal.PlainDate>, Temporal.PlainDate>>;
type _t04 = Expect<Equal<DataOnly<Temporal.PlainTime>, Temporal.PlainTime>>;
type _t05 = Expect<Equal<DataOnly<Temporal.PlainDateTime>, Temporal.PlainDateTime>>;
type _t06 = Expect<Equal<DataOnly<Temporal.PlainYearMonth>, Temporal.PlainYearMonth>>;
type _t07 = Expect<Equal<DataOnly<Temporal.PlainMonthDay>, Temporal.PlainMonthDay>>;
type _t08 = Expect<Equal<DataOnly<Temporal.Duration>, Temporal.Duration>>;
// Temporal nested in an object survives as the kept instance type, not a
// structural projection of its getters/methods.
type _t09 = Expect<Equal<DataOnly<{at: Temporal.Instant; name: string}>, {at: Temporal.Instant; name: string}>>;

// ═══════════════════════ stripped → never (non-data) ══════════════════════
type _s01 = Expect<Equal<DataOnly<() => void>, never>>;
type _s02 = Expect<Equal<DataOnly<(a: string, b: number) => boolean>, never>>;
type _s03 = Expect<Equal<DataOnly<new (x: number) => Date>, never>>;
type _s04 = Expect<Equal<DataOnly<abstract new () => Date>, never>>;
// Promise / thenables are NOT data (isType validates inbound public-API data).
type _s05 = Expect<Equal<DataOnly<Promise<string>>, never>>;
type _s06 = Expect<Equal<DataOnly<Promise<void>>, never>>;
type _s07 = Expect<Equal<DataOnly<Promise<{a: string}>>, never>>;

// ════════════════════════ Map / Set (kept verbatim) ═══════════════════════
// Per design, Map/Set are kept as-is (no element recursion) — their type args
// don't change the validator's structural id in practice.
type _m01 = Expect<Equal<DataOnly<Map<string, number>>, Map<string, number>>>;
type _m02 = Expect<Equal<DataOnly<Set<string>>, Set<string>>>;
type _m03 = Expect<Equal<DataOnly<Map<string, () => void>>, Map<string, () => void>>>;
type _m04 = Expect<Equal<DataOnly<ReadonlyMap<string, number>>, ReadonlyMap<string, number>>>;

// ════════════════════════════════ arrays ═════════════════════════════════
type _r01 = Expect<Equal<DataOnly<string[]>, string[]>>;
type _r02 = Expect<Equal<DataOnly<number[][]>, number[][]>>;
type _r03 = Expect<Equal<DataOnly<readonly string[]>, string[]>>; // `-readonly` strips
type _r04 = Expect<Equal<DataOnly<(() => void)[]>, never[]>>; // element strips per-slot
type _r05 = Expect<Equal<DataOnly<{a: string; fn: () => void}[]>, {a: string}[]>>;

// ════════════════════════════════ tuples ═════════════════════════════════
type _u01 = Expect<Equal<DataOnly<[string, number]>, [string, number]>>;
type _u02 = Expect<Equal<DataOnly<readonly [string, number]>, [string, number]>>; // `-readonly`
type _u03 = Expect<Equal<DataOnly<[a?: string, b?: number]>, [a?: string, b?: number]>>; // optional kept
type _u04 = Expect<Equal<DataOnly<[name: string, age: number]>, [string, number]>>; // labels are immaterial
type _u05 = Expect<Equal<DataOnly<[string, () => void]>, [string, never]>>; // slot strips in place
type _u06 = Expect<Equal<DataOnly<[]>, []>>;
// `Parameters<Fn>` is a tuple — the user's `params<fn>` case.
type _u07 = Expect<Equal<DataOnly<Parameters<(a: string, b: number) => void>>, [a: string, b: number]>>;
// Variadic rest: assert the kept type is at least assignable (homomorphic
// mapping does not perfectly preserve a trailing rest label — documented).
type _u08 = Expect<Assignable<[number, string], DataOnly<[number, ...string[]]>>>;

// ════════════════════════════════ objects ════════════════════════════════
type _o01 = Expect<Equal<DataOnly<{a: string; b: number}>, {a: string; b: number}>>;
type _o02 = Expect<Equal<DataOnly<{a: string; fn: () => void}>, {a: string}>>; // method drops
type _o03 = Expect<Equal<DataOnly<{a: string; greet(): string}>, {a: string}>>; // method-signature drops
type _o04 = Expect<Equal<DataOnly<{a: string; s: symbol}>, {a: string}>>; // symbol-valued prop drops
type _o05 = Expect<Equal<DataOnly<{a: string; [SYM]: number}>, {a: string}>>; // symbol KEY drops
type _o06 = Expect<Equal<DataOnly<{readonly a: string; b?: number}>, {readonly a: string; b?: number}>>; // modifiers kept
type _o07 = Expect<Equal<DataOnly<{outer: {inner: string; fn: () => void}}>, {outer: {inner: string}}>>; // nested drop
type _o08 = Expect<Equal<DataOnly<{p: Promise<string>; a: number}>, {a: number}>>; // promise-valued prop drops

// ════════════════════════════════ unions ═════════════════════════════════
type _x01 = Expect<Equal<DataOnly<string | (() => void)>, string>>; // function arm drops
type _x02 = Expect<Equal<DataOnly<string | symbol>, string>>; // symbol arm drops
type _x03 = Expect<Equal<DataOnly<string | number>, string | number>>;
type _x04 = Expect<Equal<DataOnly<{a: string} | {b: number}>, {a: string} | {b: number}>>;
type _x05 = Expect<Equal<DataOnly<string | null | undefined>, string | null | undefined>>;
type _x06 = Expect<Equal<DataOnly<number | Promise<number>>, number>>; // promise arm drops

// ════════════════════════════ intersections ══════════════════════════════
type _i01 = Expect<Equal<DataOnly<{a: string} & {b: number}>, {a: string; b: number}>>;
type _i02 = Expect<Equal<DataOnly<{a: string} & {fn: () => void}>, {a: string}>>;

// ══════════════ deeply-nested CIRCULAR / cross-referenced types ═══════════
// The headline cases: each instantiation below FORCES `DataOnly` to resolve a
// self- or mutually-referential type. If `DataOnly` blew the recursion cap
// (TS2589) on any of them, this file would not compile.

// (1) Self-referential linked list — all-data, so it round-trips to itself.
interface LinkedList {
  value: number;
  next?: LinkedList;
}
type _c01 = Expect<Assignable<DataOnly<LinkedList>, LinkedList>>;
type _c02 = Expect<Assignable<LinkedList, DataOnly<LinkedList>>>;
type _c03 = Expect<Equal<DataOnly<LinkedList>['value'], number>>;

// (2) Mutually-recursive cross-reference.
interface NodeA {
  x: string;
  b?: NodeB;
}
interface NodeB {
  y: number;
  a?: NodeA;
}
type _c04 = Expect<Equal<DataOnly<NodeA>['x'], string>>;
type _c05 = Expect<Equal<DataOnly<NodeB>['y'], number>>;
type _c06 = Expect<Assignable<DataOnly<NodeA>, NodeA>>;

// (3) Recursive via array + a stripped member that must drop at every level.
interface Tree {
  name: string;
  onClick: () => void; // non-data → dropped
  children: Tree[];
}
type _c07 = Expect<Equal<keyof DataOnly<Tree>, 'name' | 'children'>>;
type _c08 = Expect<Equal<DataOnly<Tree>['children'], DataOnly<Tree>[]>>;

// (4) Root-level RECURSIVE TUPLE — the exact shape that previously hit TS2589.
type TupleCircular = [number, string, TupleCircular?];
type _c09 = Expect<Equal<DataOnly<TupleCircular>[0], number>>;
type _c10 = Expect<Assignable<DataOnly<TupleCircular>, readonly unknown[]>>;

// (5) Recursive JSON value (union + index signature + array, self-referential).
type Json = null | boolean | number | string | Json[] | {[key: string]: Json};
type _c11 = Expect<Assignable<DataOnly<Json>, Json>>;
type _c12 = Expect<Assignable<Json, DataOnly<Json>>>;

// (6) The stress case: deep nesting + circular back-refs + stripped members at
//     multiple levels (functions, symbols, promises) + native + Map.
interface Deep {
  id: string;
  fn: () => void; // drop
  token: symbol; // drop
  pending: Promise<number>; // drop
  when: Date; // keep (native)
  child?: Deep; // circular
  bag: {
    inner?: Deep; // circular
    cb: () => void; // drop
    count: number; // keep
    index: Map<string, Deep>; // keep (Map verbatim)
  };
}
type _c13 = Expect<Equal<keyof DataOnly<Deep>, 'id' | 'when' | 'child' | 'bag'>>;
type _c14 = Expect<Equal<keyof DataOnly<Deep>['bag'], 'inner' | 'count' | 'index'>>;
type _c15 = Expect<Equal<DataOnly<Deep>['when'], Date>>;
type _c16 = Expect<Equal<DataOnly<Deep>['bag']['index'], Map<string, Deep>>>;
type _c17 = Expect<Assignable<DataOnly<Deep>['child'], DataOnly<Deep> | undefined>>;

// Export a single marker so the file is unambiguously a module (and TS reports
// any failing `Expect<…>` above as a constraint violation rather than silently
// eliding an unused type).
export type DataOnlyTypeTestsPass = [
  _a01,
  _a02,
  _a03,
  _a04,
  _a05,
  _a06,
  _a07,
  _a08,
  _a09,
  _a10,
  _a11,
  _a12,
  _a13,
  _a14,
  _a15,
  _a16,
  _n01,
  _n02,
  _n04,
  _n05,
  _n06,
  _n07,
  _n08,
  _t01,
  _t02,
  _t03,
  _t04,
  _t05,
  _t06,
  _t07,
  _t08,
  _t09,
  _s01,
  _s02,
  _s03,
  _s04,
  _s05,
  _s06,
  _s07,
  _m01,
  _m02,
  _m03,
  _m04,
  _r01,
  _r02,
  _r03,
  _r04,
  _r05,
  _u01,
  _u02,
  _u03,
  _u04,
  _u05,
  _u06,
  _u07,
  _u08,
  _o01,
  _o02,
  _o03,
  _o04,
  _o05,
  _o06,
  _o07,
  _o08,
  _x01,
  _x02,
  _x03,
  _x04,
  _x05,
  _x06,
  _i01,
  _i02,
  _c01,
  _c02,
  _c03,
  _c04,
  _c05,
  _c06,
  _c07,
  _c08,
  _c09,
  _c10,
  _c11,
  _c12,
  _c13,
  _c14,
  _c15,
  _c16,
  _c17,
  ExpectFalse<Equal<DataOnly<{a: string}>, {a: string; b: number}>>,
];
