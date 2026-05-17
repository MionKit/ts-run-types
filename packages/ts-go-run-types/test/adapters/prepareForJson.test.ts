// prepareForJson adapter — runs every JitCase whose `prepareForJson` thunk
// is defined against the precompiled transformer the Go binary emits via
// internal/caches/jitfn/preparefjson.go.
//
// Success criterion is the JSON round-trip:
//
//   restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))
//     ≅ v   (via normalizeForComparison + toEqual)
//
// This couples the prepareForJson adapter to the restoreFromJson half:
// both are exercised per case here so a phase ships only when the
// round-trip is green for every valid sample in the kinds covered so far.
// Invalid samples are not exercised — out-of-domain input is the
// validators' (isType / getTypeErrors) responsibility, not the
// serializer's.
//
// Mirrors isType.test.ts shape — one describe per category, one it() per
// case, an afterEach counter, and a final coverage-guard test per
// category. Adapter helper runs four passes (static / reflect /
// deserialize-static / deserialize-reflect) gated on the matching thunk
// being defined.

import {afterEach, describe, expect, it} from 'vitest';
import {JIT_SUITE, type JitCase} from '../suites/jit-suite.ts';
import {normalizeForComparison} from '../util/equalsHelpers.ts';

// Identity fallback for cases whose restoreFromJson thunk is omitted —
// happens when a prepareForJson noop pairs with a restoreFromJson noop
// (the round-trip is just JSON.stringify / JSON.parse).
const identityFn = (v: unknown) => v;

function assertRoundTrip(label: string, prepare: (v: unknown) => unknown, restore: (v: unknown) => unknown, getValid: () => unknown[]) {
  // Fetch the samples twice so we have a separate reference copy for
  // comparison. The serializer mutates the input in place (mion's
  // contract — see emit code in nodes/atomic/bigInt.ts: `v.toString()`,
  // emit code in nodes/member/array.ts wraps with the for loop that
  // overwrites `v[i0]`). If we passed the same object to both sides,
  // the comparison would see the post-mutation value.
  const inputs = getValid();
  const references = getValid();
  inputs.forEach((v, i) => {
    const prepared = prepare(v);
    const serialized = JSON.stringify(prepared);
    // Top-level undefined cannot be JSON-encoded — JSON.stringify
    // returns the JS value `undefined`. Skip these samples; the
    // serializer's contract is "produce a JSON-encodable shape", and
    // a bare undefined satisfies that for callers who consume the
    // prepared value directly (without going through stringify).
    if (serialized === undefined) return;
    const parsed = JSON.parse(serialized);
    const restored = restore(parsed);
    const {actual, expected} = normalizeForComparison(restored, references[i]);
    expect(actual, `${label}: valid[${i}] round-trip should deep-equal original`).toEqual(expected);
  });
}

function assertPrepareForJson(c: JitCase): void {
  if (!c.prepareForJson) throw new Error(`case ${c.title}: missing prepareForJson thunk`);
  // Use getRoundTripValid when defined — narrower sample set for cases
  // whose static type is too broad to preserve class info through the
  // round-trip (e.g. `object` excludes Date / RegExp).
  const getValid = c.getRoundTripValid ?? (() => c.getSamples().valid);
  // Paired thunks for the round-trip. When a half is undefined the
  // pair is presumed identity (covers atomic noops cleanly).
  const restoreStatic = c.restoreFromJson?.() ?? identityFn;
  const restoreReflect = c.restoreFromJsonReflect?.() ?? identityFn;
  const restoreDeserStatic = c.deserializeRestoreFromJson?.() ?? identityFn;
  const restoreDeserReflect = c.deserializeRestoreFromJsonReflect?.() ?? identityFn;

  // Static form: createPrepareForJson<T>() + createRestoreFromJson<T>().
  assertRoundTrip(`${c.title} [static]`, c.prepareForJson(), restoreStatic, getValid);

  // Reflect form. Optional — cases that omit `prepareForJsonReflect`
  // skip the second pass.
  if (c.prepareForJsonReflect) {
    assertRoundTrip(`${c.title} [reflect]`, c.prepareForJsonReflect(), restoreReflect, getValid);
  }

  // Deserialize-static form — rebuilds the transformer from the
  // serialized JitCompiledFnData.code body.
  if (c.deserializePrepareForJson) {
    assertRoundTrip(`${c.title} [deserialize-static]`, c.deserializePrepareForJson(), restoreDeserStatic, getValid);
  }

  // Deserialize-reflect form.
  if (c.deserializePrepareForJsonReflect) {
    assertRoundTrip(`${c.title} [deserialize-reflect]`, c.deserializePrepareForJsonReflect(), restoreDeserReflect, getValid);
  }
}

describe('prepareForJson / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Any type — every value passes', () => assertPrepareForJson(JIT_SUITE.ATOMIC.any));
  it('BigInt primitive', () => assertPrepareForJson(JIT_SUITE.ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertPrepareForJson(JIT_SUITE.ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertPrepareForJson(JIT_SUITE.ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertPrepareForJson(JIT_SUITE.ATOMIC.object));
  it('RegExp instance', () => assertPrepareForJson(JIT_SUITE.ATOMIC.regexp));
  it('String primitive', () => assertPrepareForJson(JIT_SUITE.ATOMIC.string));
  it('Symbol primitive', () => assertPrepareForJson(JIT_SUITE.ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertPrepareForJson(JIT_SUITE.ATOMIC.void));
  it('Unknown type — every value passes', () => assertPrepareForJson(JIT_SUITE.ATOMIC.unknown));
  it('Numeric literal with noLiterals (degrades to number)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_symbol_noLiterals));

  it('all atomic prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.ATOMIC).length);
  });
});

describe('prepareForJson / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Array of strings', () => assertPrepareForJson(JIT_SUITE.ARRAY.string_array));
  it('Array of numbers (rejects Infinity / NaN per element)', () => assertPrepareForJson(JIT_SUITE.ARRAY.number_array));
  it('Array of booleans', () => assertPrepareForJson(JIT_SUITE.ARRAY.boolean_array));
  it('Array of bigints', () => assertPrepareForJson(JIT_SUITE.ARRAY.bigint_array));
  it('Array of Dates (rejects Invalid Date per element)', () => assertPrepareForJson(JIT_SUITE.ARRAY.date_array));
  it('Array of RegExps', () => assertPrepareForJson(JIT_SUITE.ARRAY.regexp_array));
  it('Array of undefined values', () => assertPrepareForJson(JIT_SUITE.ARRAY.undefined_array));
  it('Array of nulls', () => assertPrepareForJson(JIT_SUITE.ARRAY.null_array));
  it('Generic Array<T> form (same emit as T[])', () => assertPrepareForJson(JIT_SUITE.ARRAY.array_generic));
  it('Two-dimensional string array (multi-level dependency call)', () => assertPrepareForJson(JIT_SUITE.ARRAY.string_array_2d));
  it('Three-dimensional string array (depth stress)', () => assertPrepareForJson(JIT_SUITE.ARRAY.string_array_3d));
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () => assertPrepareForJson(JIT_SUITE.ARRAY.string_array_noIsArrayCheck));
  it('Array of object literals', () => assertPrepareForJson(JIT_SUITE.ARRAY.object_array));
  it('Array of unions (OR-chain per element)', () => assertPrepareForJson(JIT_SUITE.ARRAY.union_array));
  it('Array of tuples', () => assertPrepareForJson(JIT_SUITE.ARRAY.tuple_array));
  it('Self-referential array (CircularArray = CircularArray[])', () => assertPrepareForJson(JIT_SUITE.ARRAY.circular_array));
  it('Recursive object whose cycle closes via an array property', () => assertPrepareForJson(JIT_SUITE.ARRAY.circular_object_with_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertPrepareForJson(JIT_SUITE.ARRAY.symbol_array));
  it('Readonly array (ReadonlyArray<T> / readonly T[])', () => assertPrepareForJson(JIT_SUITE.ARRAY.readonly_string_array));

  it('all array prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.ARRAY).length);
  });
});
