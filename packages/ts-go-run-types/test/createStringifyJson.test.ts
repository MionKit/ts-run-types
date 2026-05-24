// Per-kind smoke tests + stringifyJson-vs-prepareForJson divergence
// assertions for `createStringifyJson`. Drives the full vite-plugin
// pipeline (transform → precompiled factory → runtime dispatch).
//
// Goal: catch per-kind emit bugs against expected raw output strings
// where the output is canonical, AND catch divergences from
// prepareForJson + JSON.stringify that the user wants documented:
//
//   1. No-mutation invariant — stringifyJson reads but doesn't write.
//      prepareForJson mutates `v` in place. Load-bearing assertion:
//      bigint in input remains a bigint after a stringifyJson call.
//   2. Extras stripped in the EMIT — bigint extras don't reach
//      JSON.stringify, so no throw. prepareForJson + JSON.stringify
//      would throw.
//   3. Per-kind raw output — atomic types where mion's encoding is
//      canonical (bigint → `"123"`, Date → `"<iso>"`, etc.) get
//      byte-level checks.

import {describe, test, expect} from 'vitest';
import {createStringifyJson, createPrepareForJson} from '@mionjs/ts-go-run-types';

describe('createStringifyJson — atomic raw output', () => {
  test('string', () => {
    const sjs = createStringifyJson<string>();
    expect(sjs('hello')).toBe('"hello"');
    expect(sjs('')).toBe('""');
    expect(sjs('with "quotes"')).toBe('"with \\"quotes\\""');
  });

  test('number — root returns a String() wrapper', () => {
    const sjs = createStringifyJson<number>();
    expect(sjs(42)).toBe('42');
    expect(sjs(-1.5)).toBe('-1.5');
    expect(sjs(0)).toBe('0');
  });

  test('boolean', () => {
    const sjs = createStringifyJson<boolean>();
    expect(sjs(true)).toBe('true');
    expect(sjs(false)).toBe('false');
  });

  test('null', () => {
    const sjs = createStringifyJson<null>();
    expect(sjs(null)).toBe('null');
  });

  test('undefined — top-level returns the JS value undefined', () => {
    const sjs = createStringifyJson<undefined>();
    expect(sjs(undefined)).toBeUndefined();
    // Mion-parity: `expect(typeof serialized).toBe('undefined')` —
    // top-level undefined is not a valid JSON document, so the JIT
    // fn returns the JS undefined sentinel rather than a string.
    expect(typeof sjs(undefined)).toBe('undefined');
  });

  test('void — top-level returns the JS value undefined', () => {
    const sjs = createStringifyJson<void>();
    // Same as undefined — mion's stringifyJson emits `undefined` for
    // both KindUndefined and KindVoid.
    expect(sjs(undefined)).toBeUndefined();
    expect(typeof sjs(undefined)).toBe('undefined');
  });

  test('bigint — quoted decimal string', () => {
    const sjs = createStringifyJson<bigint>();
    expect(sjs(123n)).toBe('"123"');
    expect(sjs(0n)).toBe('"0"');
    expect(sjs(-42n)).toBe('"-42"');
  });

  test('Date — quoted ISO string via toJSON', () => {
    const sjs = createStringifyJson<Date>();
    const d = new Date('2000-08-06T02:13:00.000Z');
    expect(sjs(d)).toBe('"2000-08-06T02:13:00.000Z"');
  });
});

describe('createStringifyJson — compound shapes', () => {
  test('object literal — declared keys serialised, parses back', () => {
    type T = {a: string; b: number};
    const sjs = createStringifyJson<T>();
    const out = sjs({a: 'hello', b: 42});
    expect(typeof out).toBe('string');
    expect(JSON.parse(out!)).toEqual({a: 'hello', b: 42});
  });

  test('object with bigint field — bigint quoted in output', () => {
    type T = {n: bigint};
    const sjs = createStringifyJson<T>();
    const out = sjs({n: 123n});
    expect(out).toBe('{"n":"123"}');
  });

  test('array of atomics', () => {
    const sjs = createStringifyJson<number[]>();
    expect(sjs([1, 2, 3])).toBe('[1,2,3]');
    expect(sjs([])).toBe('[]');
  });

  test('array of bigints — each quoted', () => {
    const sjs = createStringifyJson<bigint[]>();
    const out = sjs([1n, 2n]);
    expect(JSON.parse(out!)).toEqual(['1', '2']);
  });

  test('tuple — slots serialised in order', () => {
    const sjs = createStringifyJson<[number, string, bigint]>();
    const out = sjs([1, 'x', 42n]);
    expect(out).toBe('[1,"x","42"]');
  });

  test('Map<string, number>', () => {
    const sjs = createStringifyJson<Map<string, number>>();
    const m = new Map<string, number>([['a', 1], ['b', 2]]);
    const out = sjs(m);
    expect(JSON.parse(out!)).toEqual([['a', 1], ['b', 2]]);
  });

  test('Set<string>', () => {
    const sjs = createStringifyJson<Set<string>>();
    const s = new Set<string>(['a', 'b']);
    const out = sjs(s);
    expect(JSON.parse(out!)).toEqual(['a', 'b']);
  });

  test('optional last + undefined — produces valid JSON (mion-parity sort puts optional first)', () => {
    // Without mion's optional-first sort, the trailing-comma logic
    // would emit `{"a":"x",}` here — invalid JSON. We port the sort,
    // so optional `b` is emitted FIRST (empty when undefined), then
    // required `a` last (with skipCommas), giving `{"a":"x"}`.
    type T = {a: string; b?: number};
    const sjs = createStringifyJson<T>();
    const out = sjs({a: 'x'});
    expect(out).toBe('{"a":"x"}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({a: 'x'});
  });

  test('optional last + present — both keys serialised', () => {
    type T = {a: string; b?: number};
    const sjs = createStringifyJson<T>();
    const out = sjs({a: 'x', b: 42});
    expect(JSON.parse(out!)).toEqual({a: 'x', b: 42});
  });
});

// Mion's `compileStringifyInterface` has TWO paths:
//
//   1. At-least-one-required → static `+` concat with optional-first
//      sort + skipCommas-on-last. Fast; no allocations.
//   2. All-optional → IIFE that pushes each prop into a `ns` array
//      and final-joins with ','. Required because the static + concat
//      shape would emit invalid JSON with a trailing comma when only
//      some of the optional props are present at runtime.
//
// These tests catch the bug-mode where path (2) is missing — the
// emit produces `{"a":"x",}` (trailing comma) and JSON.parse throws.
// They MUST run through the actual JIT factory (not JSON.stringify
// fallback) to exercise the emit.
describe('createStringifyJson — all-optional objects (mion array-join fallback)', () => {
  test('all-optional, first present + second absent — must NOT emit trailing comma', () => {
    type T = {a?: string; b?: string};
    const sjs = createStringifyJson<T>();
    const out = sjs({a: 'helloA'});
    // The bug-mode output would be `{"a":"helloA",}` — invalid JSON.
    // After the fix: array-join filter drops the empty `b` slot and
    // the result is the canonical `{"a":"helloA"}`.
    expect(out).toBe('{"a":"helloA"}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({a: 'helloA'});
  });

  test('all-optional, first absent + second present', () => {
    type T = {a?: string; b?: string};
    const sjs = createStringifyJson<T>();
    const out = sjs({b: 'helloB'});
    // Leading-empty case — bug-mode might emit `{,"b":"helloB"}`
    // (leading comma) if filter logic is broken.
    expect(out).toBe('{"b":"helloB"}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({b: 'helloB'});
  });

  test('all-optional, middle gap — first + third present, second absent', () => {
    type T = {a?: string; b?: string; c?: string};
    const sjs = createStringifyJson<T>();
    const out = sjs({a: 'helloA', c: 'helloC'});
    // Middle-gap case — bug-mode might emit `{"a":"helloA",,"c":"helloC"}`
    // (double comma) if the filter doesn't collapse empty slots.
    expect(out).toBe('{"a":"helloA","c":"helloC"}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({a: 'helloA', c: 'helloC'});
  });

  test('all-optional, all present', () => {
    // Avoid `boolean` here — TS reflects boolean as `true | false`
    // (a union), which would force the [idx, val] tuple-wrap and
    // muddle this test's intent. Atomic-only optional types isolate
    // the all-optional array-join path.
    type T = {a?: string; b?: number; c?: string};
    const sjs = createStringifyJson<T>();
    const out = sjs({a: 'x', b: 42, c: 'y'});
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({a: 'x', b: 42, c: 'y'});
  });

  test('all-optional, none present — empty object', () => {
    type T = {a?: string; b?: number};
    const sjs = createStringifyJson<T>();
    const out = sjs({});
    expect(out).toBe('{}');
    expect(() => JSON.parse(out!)).not.toThrow();
    expect(JSON.parse(out!)).toEqual({});
  });

  test('all-optional with bigint — array-join path still honours per-kind encoding', () => {
    // Per-kind encoding (bigint quoted) must still happen inside the
    // array-join path — exercises the property emit's value fragment
    // composing correctly under the skipCommas=true mode.
    type T = {n?: bigint; s?: string};
    const sjs = createStringifyJson<T>();
    const out = sjs({n: 123n});
    expect(out).toBe('{"n":"123"}');
    expect(JSON.parse(out!)).toEqual({n: '123'});
  });
});

describe('createStringifyJson — no-mutation invariant (divergence from prepareForJson)', () => {
  test('bigint input field stays a bigint after stringifyJson', () => {
    type T = {n: bigint};
    const sjs = createStringifyJson<T>();
    const input: T = {n: 123n};
    sjs(input);
    // load-bearing: prepareForJson would have rebound `input.n` to
    // the string `'123'`. stringifyJson reads but doesn't write.
    expect(typeof input.n).toBe('bigint');
    expect(input.n).toBe(123n);
  });

  test('nested object with Date field — Date instance preserved', () => {
    type T = {at: Date; tag: string};
    const sjs = createStringifyJson<T>();
    const d = new Date('2000-08-06T02:13:00.000Z');
    const input: T = {at: d, tag: 'x'};
    sjs(input);
    // prepareForJson is a noop on Date (relies on Date.toJSON), but
    // stringifyJson's no-mutation contract is unconditional —
    // assert the slot still holds the Date instance.
    expect(input.at).toBeInstanceOf(Date);
    expect(input.at).toBe(d);
    expect(input.tag).toBe('x');
  });

  test('prepareForJson DOES mutate the same input shape — contrast', () => {
    type T = {n: bigint};
    const prep = createPrepareForJson<T>();
    const input: T = {n: 123n};
    prep(input);
    // contract contrast — prepareForJson rebinds the bigint to its
    // decimal string in place.
    expect(typeof (input as unknown as {n: unknown}).n).toBe('string');
    expect((input as unknown as {n: unknown}).n).toBe('123');
  });
});

describe('createStringifyJson — extras stripped in the EMIT', () => {
  test('JSON-compatible extra is dropped, not preserved', () => {
    type T = {declared: string};
    const sjs = createStringifyJson<T>();
    const input = {declared: 'x', extra: 'y'} as T & {extra: string};
    const out = sjs(input);
    expect(out).toBe('{"declared":"x"}');
  });

  test('bigint extra does NOT throw — emit walks declared members only', () => {
    type T = {declared: string};
    const sjs = createStringifyJson<T>();
    const input = {declared: 'x', extra: 123n} as T & {extra: bigint};
    // Crucially: no throw, and the bigint extra is absent from
    // output. prepareForJson + JSON.stringify on the same input
    // would throw "Do not know how to serialize a BigInt".
    const out = sjs(input);
    expect(out).toBe('{"declared":"x"}');
  });

  test('symbol-valued extra also dropped (no throw)', () => {
    type T = {declared: string};
    const sjs = createStringifyJson<T>();
    const input = {declared: 'x', sym: Symbol('hi')} as T & {sym: symbol};
    const out = sjs(input);
    expect(out).toBe('{"declared":"x"}');
  });

  test('function-valued extra also dropped (no throw)', () => {
    type T = {declared: string};
    const sjs = createStringifyJson<T>();
    const input = {declared: 'x', fn: () => 0} as T & {fn: () => number};
    const out = sjs(input);
    expect(out).toBe('{"declared":"x"}');
  });
});

describe('createStringifyJson vs JSON.stringify(prepareForJson(v)) — parsed-equality', () => {
  // For inputs WITHOUT extras and supported types, the two paths
  // produce parsed-identical output. Byte-level differences (property
  // order) are tolerated by parsing both sides before comparing.

  test('parsed equality: simple object', () => {
    type T = {a: string; b: number};
    const sjs = createStringifyJson<T>();
    const prep = createPrepareForJson<T>();
    const input: T = {a: 'hello', b: 42};
    const fromSjs = JSON.parse(sjs(structuredClone(input))!);
    const fromPrep = JSON.parse(JSON.stringify(prep(structuredClone(input))));
    expect(fromSjs).toEqual(fromPrep);
  });

  test('parsed equality: object with bigint', () => {
    type T = {n: bigint; tag: string};
    const sjs = createStringifyJson<T>();
    const prep = createPrepareForJson<T>();
    const input: T = {n: 1234567890123456789n, tag: 'x'};
    const fromSjs = JSON.parse(sjs(structuredClone(input))!);
    const fromPrep = JSON.parse(JSON.stringify(prep(structuredClone(input))));
    expect(fromSjs).toEqual(fromPrep);
  });

  test('parsed equality: array of objects with Date + bigint', () => {
    type T = {at: Date; n: bigint}[];
    const sjs = createStringifyJson<T>();
    const prep = createPrepareForJson<T>();
    const d = new Date('2000-08-06T02:13:00.000Z');
    const input: T = [{at: d, n: 1n}, {at: d, n: 2n}];
    const fromSjs = JSON.parse(sjs(structuredClone(input))!);
    const fromPrep = JSON.parse(JSON.stringify(prep(structuredClone(input))));
    expect(fromSjs).toEqual(fromPrep);
  });

  test('parsed equality: Map<string, bigint>', () => {
    const sjs = createStringifyJson<Map<string, bigint>>();
    const prep = createPrepareForJson<Map<string, bigint>>();
    const m = new Map<string, bigint>([['a', 1n], ['b', 2n]]);
    const fromSjs = JSON.parse(sjs(new Map(m))!);
    const fromPrep = JSON.parse(JSON.stringify(prep(new Map(m))));
    expect(fromSjs).toEqual(fromPrep);
  });
});
