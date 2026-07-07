// Compile-time proof that `Static<typeof schema>` recovers EXACTLY the TS type a
// value-first schema models — across the whole builder surface. Each case binds a
// schema to a `const`, then asserts `Static<typeof schema>` is mutually assignable
// (both directions) with the hand-written type-first equivalent. This is the
// type-level twin of the runtime convergence suite (test/suites/id-integrity/).
//
// `assertMutual<S, T>()` is the helper form of the cross-assignment:
//     const _a: S = (x as T);   // T → S
//     const _b: T = (x as S);   // S → T
// It compiles ONLY when S and T are mutually assignable; otherwise the no-arg call
// errors (the rest param becomes a required `[error: …]` tuple). Tuple-wrapping
// (`[S] extends [T]`) stops unions from distributing so `string | number` compares
// as a whole.
//
// WHY this passes: `Static<RT>` is just `NonNullable<RT['__rtType']>['t']` — a
// getter. The resolution (config → modeled type) is done EAGERLY by each builder's
// return type (`ObjectType<C>`, `MapTuple<T>`, `LeafType<…>`, …) and stored in the
// phantom `__rtType`; `Static` reads it back. Drop those helpers and the SAME
// `Static` yields e.g. `{a: RunType<string>}` instead of `{a: string}`.
//
// The bodies are type-only and never invoked; the `test` references them so lint
// doesn't flag them. The real check is tsc:
//   pnpm exec tsc --noEmit -p packages/ts-runtypes/tsconfig.test.json

import * as TF from '@ts-runtypes/core/formats';
import {expect, test} from 'vitest';
import * as RT from '@ts-runtypes/core/schema';
import type {Static} from '@ts-runtypes/core';

/** Asserts `S` and `T` are mutually assignable (the helper form of cross-assigning
 *  a value of each type to the other). No-arg call compiles iff equivalent. */
function assertMutual<S, T>(
  ..._proof: [S] extends [T]
    ? [T] extends [S]
      ? []
      : [error: 'T not assignable to S', T, S]
    : [error: 'S not assignable to T', S, T]
): void {
  void _proof;
}

test('Static ⇄ type-first equivalence assertions are referenced (compile-time check)', () => {
  expect(typeof atomicLeaves).toBe('function');
  expect(typeof brandedLeaves).toBe('function');
  expect(typeof composers).toBe('function');
  expect(typeof objects).toBe('function');
  expect(typeof utilities).toBe('function');
});

// ── Atomic leaves (no params → plain base type) ──────────────────────
function atomicLeaves(): void {
  const str = TF.string();
  const num = TF.number();
  const bool = RT.boolean();
  const big = TF.bigInt();
  const dat = TF.date();
  const re = RT.regexp();
  const litS = RT.literal('a');
  const litN = RT.literal(42);
  const litB = RT.literal(true);
  const litNull = RT.literal(null);
  const litUndef = RT.literal(undefined);
  assertMutual<Static<typeof str>, string>();
  assertMutual<Static<typeof num>, number>();
  assertMutual<Static<typeof bool>, boolean>();
  assertMutual<Static<typeof big>, bigint>();
  assertMutual<Static<typeof dat>, Date>();
  assertMutual<Static<typeof re>, RegExp>();
  assertMutual<Static<typeof litS>, 'a'>();
  assertMutual<Static<typeof litN>, 42>();
  assertMutual<Static<typeof litB>, true>();
  assertMutual<Static<typeof litNull>, null>();
  assertMutual<Static<typeof litUndef>, undefined>();
}

// ── Leaves with params (→ branded format type) ───────────────────────
function brandedLeaves(): void {
  const str = TF.string({maxLength: 5});
  const num = TF.number({min: 0, max: 9});
  assertMutual<Static<typeof str>, TF.String<{maxLength: 5}>>();
  assertMutual<Static<typeof num>, TF.Number<{min: 0; max: 9}>>();
}

// ── Composers ────────────────────────────────────────────────────────
function composers(): void {
  const arr = RT.array(TF.string());
  const arrObj = RT.array(RT.object({a: TF.number()}));
  const tup = RT.tuple([TF.string(), TF.number()]);
  const tupOpt = RT.tuple([TF.string()], [TF.number()]);
  const tupRest = RT.tuple([TF.string()], TF.number());
  const uni = RT.union([TF.string(), TF.number()]);
  const uniLit = RT.union([RT.literal('a'), RT.literal('b')]);
  const inter = RT.intersection(RT.object({a: TF.string()}), RT.object({b: TF.number()}));
  const rec = RT.record(TF.number());
  const recKV = RT.record(TF.string(), RT.boolean());
  const mp = RT.map(TF.string(), TF.number());
  const st = RT.set(TF.string());
  const prom = RT.promise(TF.string());
  const fn = RT.func([TF.string(), TF.number()], RT.boolean());
  const tmpl = RT.templateLiteral(['user/', TF.number()]);
  assertMutual<Static<typeof arr>, string[]>();
  assertMutual<Static<typeof arrObj>, {a: number}[]>();
  assertMutual<Static<typeof tup>, [string, number]>();
  assertMutual<Static<typeof tupOpt>, [string, number?]>();
  assertMutual<Static<typeof tupRest>, [string, ...number[]]>();
  assertMutual<Static<typeof uni>, string | number>();
  assertMutual<Static<typeof uniLit>, 'a' | 'b'>();
  assertMutual<Static<typeof inter>, {a: string} & {b: number}>();
  assertMutual<Static<typeof rec>, Record<string, number>>();
  assertMutual<Static<typeof recKV>, Record<string, boolean>>();
  assertMutual<Static<typeof mp>, Map<string, number>>();
  assertMutual<Static<typeof st>, Set<string>>();
  assertMutual<Static<typeof prom>, Promise<string>>();
  assertMutual<Static<typeof fn>, (a: string, b: number) => boolean>();
  assertMutual<Static<typeof tmpl>, `user/${number}`>();
}

// ── object() + property modifiers ────────────────────────────────────
function objects(): void {
  // The request's headline example.
  const obj = RT.object({a: TF.string(), b: RT.optional(TF.number())});
  const nested = RT.object({id: TF.number(), tags: RT.array(TF.string()), meta: RT.object({ok: RT.boolean()})});
  // readonly modifier (note: TS treats readonly/mutable as mutually assignable, so
  // this asserts the shape, not the readonly bit itself).
  const ro = RT.object({a: RT.propMod({readonly: true}, TF.string())});
  assertMutual<Static<typeof obj>, {a: string; b?: number}>();
  assertMutual<Static<typeof nested>, {id: number; tags: string[]; meta: {ok: boolean}}>();
  assertMutual<Static<typeof ro>, {readonly a: string}>();
}

// ── Utility-type builders ────────────────────────────────────────────
function utilities(): void {
  const par = RT.partial(RT.object({a: TF.string(), b: TF.number()}));
  const req = RT.required(RT.object({a: TF.string(), b: RT.optional(TF.number())}));
  const pck = RT.pick(RT.object({a: TF.string(), b: TF.number()}), ['a']);
  const omt = RT.omit(RT.object({a: TF.string(), b: TF.number()}), ['b']);
  const nn = RT.nonNullable(RT.union([TF.string(), RT.literal(null), RT.literal(undefined)]));
  const roT = RT.readonlyType(RT.object({a: TF.string()}));
  const ret = RT.returnType(RT.func([], TF.number()));
  const params = RT.parameters(RT.func([TF.string(), TF.number()], RT.boolean()));
  assertMutual<Static<typeof par>, {a?: string; b?: number}>();
  assertMutual<Static<typeof req>, {a: string; b: number}>();
  assertMutual<Static<typeof pck>, {a: string}>();
  assertMutual<Static<typeof omt>, {a: string}>();
  assertMutual<Static<typeof nn>, string>();
  assertMutual<Static<typeof roT>, {readonly a: string}>();
  assertMutual<Static<typeof ret>, number>();
  assertMutual<Static<typeof params>, [string, number]>();
}
