// Merged serialization round-trip adapter — drives the standalone
// `SERIALIZATION_SPEC` through BOTH JSON serialise paths in a single
// file. Replaces the previous split between this file (unsafe path) and
// `serializationStringifyJsonRoundTrip.test.ts` (safe path).
//
// The two paths:
//
//   - unsafe: prepareForJson(v) → JSON.stringify(prepared) → JSON.parse → restoreFromJson
//   - safe:   stringifyJson(v)                              → JSON.parse → restoreFromJson
//
// One describe/it scaffold; each `it()` calls `runCase(c)` which
// exercises both paths sequentially. Per-path helpers
// (`assertUnsafeRoundTrip` / `assertSafeRoundTrip`) are self-contained
// — no `mode` parameter, no cross-path branching. Each path fetches its
// own `c.getTestData()` because the unsafe path's `prepareForJson`
// mutates `v` in place; sharing one `values` array across both paths
// would feed mutated state into the safe path.
//
// Success criteria:
//
//   unsafe: restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))
//             ≅ deserializedValues[i] ?? values[i]
//   safe:   restoreFromJson(JSON.parse(stringifyJson(v)))
//             ≅ deserializedValues[i] ?? values[i]
//           AND stringifyJson does NOT mutate v (read-only contract,
//           verified via structuredClone snapshot, skipped for
//           cycle-bearing shapes).
//
// `deserializedValues`, `throwsAtCompile`, `jsonStringifyThrows`,
// `roundTripBestEffort`, `safeAdapterStringifyJsonNotParseable`, and
// `getTestDataForStringify` carry per-case path-aware expectations
// consumed inside each path's helper.

import {afterEach, describe, expect, it} from 'vitest';
import {createRestoreFromJson} from '@mionjs/ts-go-run-types';
import {SERIALIZATION_SPEC, type SerializationCase} from '../suites/serialization-suite.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from '../util/equalsHelpers.ts';

const identityFn = (v: unknown) => v;

function safeStructuredClone(input: unknown): {ok: true; snapshot: unknown} | {ok: false} {
  try {
    return {ok: true, snapshot: structuredClone(input)};
  } catch {
    return {ok: false};
  }
}

function runCase(c: SerializationCase): void {
  // throwsAtCompile cases — every factory must throw at invocation
  // time. mion fails the runtype's emit step for unsupported kinds;
  // our Go pipeline emits no factory and falls through to identity —
  // which makes this assertion fail visibly. Intended divergence
  // surface; the implementation is the bug, not the test.
  if (c.throwsAtCompile) {
    expect(() => c.prepareForJson(), `${c.title}: prepareForJson factory must throw at compile time`).toThrow();
    expect(() => c.restoreFromJson(), `${c.title}: restoreFromJson factory must throw at compile time`).toThrow();
    expect(() => c.stringifyJson(), `${c.title}: stringifyJson factory must throw at compile time`).toThrow();
    return;
  }

  assertUnsafeRoundTrip(c);
  assertSafeRoundTrip(c);
}

// ---------- UNSAFE path: prepareForJson + JSON.stringify -----------

function assertUnsafeRoundTrip(c: SerializationCase): void {
  // jsonStringifyThrows — unsafe-only contract. prepareForJson runs
  // successfully but JSON.stringify throws because the input carries a
  // non-serializable structural extra (bigint, etc) that prepareForJson
  // doesn't strip. Documents mion's "extras pass through" semantic.
  if (c.jsonStringifyThrows) {
    const prepare = c.prepareForJson();
    const {values} = c.getTestData();
    values.forEach((reference, i) => {
      const input = deepCloneForRoundTrip(reference);
      const prepared = prepare(input);
      expect(() => JSON.stringify(prepared), `${c.title} [unsafe]: JSON.stringify(prepareForJson(values[${i}])) must throw`).toThrow();
    });
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const restoreStatic = c.restoreFromJson?.() ?? identityFn;
  const restoreDeser = c.deserializeRestoreFromJson?.();

  // Fresh getTestData() per variant — prepareForJson mutates `v` in
  // place, so the static and deserialize variants must NOT share the
  // same `values` array.
  runUnsafePair(c, 'static', c.prepareForJson(), restoreStatic, c.getTestData(), bestEffort);
  if (c.deserializePrepareForJson && restoreDeser) {
    runUnsafePair(c, 'deserialize', c.deserializePrepareForJson(), restoreDeser, c.getTestData(), bestEffort);
  }
}

function runUnsafePair(
  c: SerializationCase,
  variant: string,
  prepare: (v: unknown) => unknown,
  restore: (v: unknown) => unknown,
  testData: {values: unknown[]; deserializedValues?: unknown[]},
  bestEffort: boolean
): void {
  const label = `${c.title} [unsafe:${variant}]`;
  const {values, deserializedValues} = testData;
  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const prepared = prepare(input);
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(prepared);
    } catch (e) {
      // Best-effort types accept JSON failures — the broad-type
      // contract is "if a value is JSON-supported it survives".
      if (bestEffort) return;
      throw e;
    }
    // Top-level undefined cannot be JSON-encoded — JSON.stringify
    // returns the JS value `undefined`. Skip the deep-equal half but
    // honour the contract that prepare didn't throw.
    if (serialized === undefined) return;
    if (bestEffort) return;
    const parsed = JSON.parse(serialized);
    const restored = restore(parsed);
    // deserializedValues holds the expected restored shape when the
    // round-trip is intentionally asymmetric (functions → undefined,
    // class instances → plain objects, etc).
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- SAFE path: stringifyJson (single-pass) -----------------

function assertSafeRoundTrip(c: SerializationCase): void {
  const bestEffort = c.roundTripBestEffort ?? false;
  const getTestData = c.getTestDataForStringify ?? c.getTestData;
  const stringify = c.stringifyJson();
  const restoreStatic = c.restoreFromJson?.() ?? identityFn;
  const restoreDeser = c.deserializeRestoreFromJson?.();

  // Fresh getTestData() per variant. stringifyJson itself is read-only
  // (load-bearing contract — verified below), so sharing across
  // variants would be technically safe, but the per-variant fetch
  // matches the unsafe path's shape and stays cheap.
  runSafePair(c, 'stringify', stringify, restoreStatic, getTestData(), bestEffort);
  if (restoreDeser) {
    runSafePair(c, 'stringify+deserialize', stringify, restoreDeser, getTestData(), bestEffort);
  }
}

function runSafePair(
  c: SerializationCase,
  variant: string,
  stringify: (v: unknown) => string | undefined,
  restore: (v: unknown) => unknown,
  testData: {values: unknown[]; deserializedValues?: unknown[]},
  bestEffort: boolean
): void {
  const label = `${c.title} [safe:${variant}]`;
  const {values, deserializedValues} = testData;
  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const preSnapshot = safeStructuredClone(input);

    let serialized: string | undefined;
    try {
      serialized = stringify(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }

    // No-mutation invariant — load-bearing for stringifyJson's
    // read-only contract. Skipped for shapes structuredClone refuses
    // (cycles).
    if (preSnapshot.ok) {
      expect(input, `${label}: values[${i}] — stringifyJson must not mutate input`).toEqual(preSnapshot.snapshot);
    }

    if (serialized === undefined) return;
    if (bestEffort) return;

    if (c.safeAdapterStringifyJsonNotParseable) {
      // mion's number-not-supported semantic: `String(Infinity)` is
      // `"Infinity"` — not a valid JSON document. Assert the parse
      // throws instead of attempting a round-trip.
      expect(() => JSON.parse(serialized!), `${label}: values[${i}] expected JSON.parse to throw (not valid JSON)`).toThrow();
      return;
    }

    const parsed = JSON.parse(serialized);
    const restored = restore(parsed);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- Sections ------------------------------------------------

describe('serialization / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('string', () => runCase(SERIALIZATION_SPEC.ATOMIC.string));
  it('number', () => runCase(SERIALIZATION_SPEC.ATOMIC.number));
  it('number values not supported by all protocols', () => runCase(SERIALIZATION_SPEC.ATOMIC.number_not_supported));
  it('regexp', () => runCase(SERIALIZATION_SPEC.ATOMIC.regexp));
  it('bigint', () => runCase(SERIALIZATION_SPEC.ATOMIC.bigint));
  it('boolean', () => runCase(SERIALIZATION_SPEC.ATOMIC.boolean));
  it('any', () => runCase(SERIALIZATION_SPEC.ATOMIC.any));
  it('not supported in JSON stringify when any type is used', () => runCase(SERIALIZATION_SPEC.ATOMIC.not_supported_any));
  it('null', () => runCase(SERIALIZATION_SPEC.ATOMIC.null));
  it('undefined', () => runCase(SERIALIZATION_SPEC.ATOMIC.undefined));
  it('date', () => runCase(SERIALIZATION_SPEC.ATOMIC.date));
  it('enum', () => runCase(SERIALIZATION_SPEC.ATOMIC.enum_color));
  it('symbol', () => runCase(SERIALIZATION_SPEC.ATOMIC.symbol));
  it('object', () => runCase(SERIALIZATION_SPEC.ATOMIC.object));
  it('void', () => runCase(SERIALIZATION_SPEC.ATOMIC.void));
  it('never', () => runCase(SERIALIZATION_SPEC.ATOMIC.never));
  it('string literal', () => runCase(SERIALIZATION_SPEC.ATOMIC.literal_string));
  it('number literal', () => runCase(SERIALIZATION_SPEC.ATOMIC.literal_number));
  it('boolean literal', () => runCase(SERIALIZATION_SPEC.ATOMIC.literal_boolean));
  it('regexp literal', () => runCase(SERIALIZATION_SPEC.ATOMIC.literal_regexp));

  it('all ATOMIC serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.ATOMIC).length);
  });
});

describe('serialization / ARRAYS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('array', () => runCase(SERIALIZATION_SPEC.ARRAYS.array));
  it('array of dates', () => runCase(SERIALIZATION_SPEC.ARRAYS.array_date));
  it('undefined is serialized as null in array', () => runCase(SERIALIZATION_SPEC.ARRAYS.undefined_in_array));
  it('multi dimensional array', () => runCase(SERIALIZATION_SPEC.ARRAYS.multi_dimensional));
  it('non serializable items throws an error', () => runCase(SERIALIZATION_SPEC.ARRAYS.non_serializable_in_array));
  it('array circular', () => runCase(SERIALIZATION_SPEC.ARRAYS.array_circular));

  it('all ARRAYS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.ARRAYS).length);
  });
});

describe('serialization / OBJECTS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('interface', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface));
  it('many optional properties', () => runCase(SERIALIZATION_SPEC.OBJECTS.many_optional_props));
  it('class', () => runCase(SERIALIZATION_SPEC.OBJECTS.class));
  it('extended class', () => runCase(SERIALIZATION_SPEC.OBJECTS.extended_class));
  it('non-serializable class via deserialize function', () => runCase(SERIALIZATION_SPEC.OBJECTS.non_serializable_class));
  it('undefined is omitted in object prop', () => runCase(SERIALIZATION_SPEC.OBJECTS.undefined_in_object));
  it('optional properties order', () => runCase(SERIALIZATION_SPEC.OBJECTS.optional_properties_order));
  it('all optional fields', () => runCase(SERIALIZATION_SPEC.OBJECTS.all_optional_fields));
  it('extras passthrough — unsafe preserves, safe strips', () =>
    runCase(SERIALIZATION_SPEC.OBJECTS.extras_passthrough_unsafe));
  it('interface circular', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_circular));
  it('interface circular array', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_circular_array));
  it('interface circular deep', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_circular_deep));
  it('interface root not circular', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_root_not_circular));
  it('interface multiple circular', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_multiple_circular));
  it('methods should be excluded from interface when serializing', () =>
    runCase(SERIALIZATION_SPEC.OBJECTS.interface_with_methods));

  it('all OBJECTS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.OBJECTS).length);
  });
});

describe('serialization / RECORDS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('index property', () => runCase(SERIALIZATION_SPEC.RECORDS.index_property));
  it('interface with a single property and index property', () => runCase(SERIALIZATION_SPEC.RECORDS.index_property_and_prop));
  it('index property with extra props and unions', () => runCase(SERIALIZATION_SPEC.RECORDS.index_property_extra));
  it('multiple index properties (symbol keys skipped)', () => runCase(SERIALIZATION_SPEC.RECORDS.multiple_index_props));
  it('index property nested', () => runCase(SERIALIZATION_SPEC.RECORDS.index_property_nested));
  it('index property nested with Date values', () => runCase(SERIALIZATION_SPEC.RECORDS.index_property_nested_date));
  it('index property with bigint values', () => runCase(SERIALIZATION_SPEC.RECORDS.index_property_bigint));
  it('index property non-root', () => runCase(SERIALIZATION_SPEC.RECORDS.index_property_non_root));

  it('all RECORDS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.RECORDS).length);
  });
});

describe('serialization / TUPLES', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('tuple', () => runCase(SERIALIZATION_SPEC.TUPLES.tuple));
  it('tuple with optional params', () => runCase(SERIALIZATION_SPEC.TUPLES.tuple_with_optional));
  it('tuple rest parameter', () => runCase(SERIALIZATION_SPEC.TUPLES.tuple_rest_parameter));
  it('tuple with non serializable types are transformed to undefined', () =>
    runCase(SERIALIZATION_SPEC.TUPLES.tuple_with_non_serializable));
  it('tuple circular', () => runCase(SERIALIZATION_SPEC.TUPLES.tuple_circular));
  it('interface circular tuple', () => runCase(SERIALIZATION_SPEC.TUPLES.interface_circular_tuple));

  it('all TUPLES serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.TUPLES).length);
  });
});

describe('serialization / FUNCTIONS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('function parameters', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.parameters));
  it('optional parameters', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.optional_params));
  it('function return', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.function_return));
  it('function with rest parameters', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.function_with_rest_parameters));
  it('function with Date parameters', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.function_with_date_parameters));
  it('required function return', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.required_function_return));
  it('function with only rest parameters', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.function_with_only_rest_parameters));
  it('non serializable params', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.non_serializable_params));
  it('function returns a promise', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.function_promise_return_type));
  it('return type of a closure', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.function_return_type_is_function));
  it('call signature params', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.call_signature_params));
  it('call signature return', () => runCase(SERIALIZATION_SPEC.FUNCTIONS.call_signature_return));

  it('all FUNCTIONS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.FUNCTIONS).length);
  });
});

describe('serialization / UTILITY_TYPES', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Awaited<Promise<T>>', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.awaited));
  it('Exclude on atomic union', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.exclude_atomic));
  it('Exclude on object union', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.exclude_objects));
  it('Required<T>', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.required_properties));
  it('Extract on atomic union', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.extract_atomic));
  it('Extract on object union', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.extract_objects));
  it('Partial<T>', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.partial_properties));
  it('Pick<T, K>', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.pick_properties));
  it('Omit<T, K>', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.omit_properties));
  it('Record<string, Date>', () => runCase(SERIALIZATION_SPEC.UTILITY_TYPES.record_type));

  it('all UTILITY_TYPES serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.UTILITY_TYPES).length);
  });
});

describe('serialization / UNIONS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('atomic union', () => runCase(SERIALIZATION_SPEC.UNIONS.union));
  it('union of arrays', () => runCase(SERIALIZATION_SPEC.UNIONS.union_array));
  it('array of union with discriminator', () => runCase(SERIALIZATION_SPEC.UNIONS.with_discriminator));
  it('union of object shapes', () => runCase(SERIALIZATION_SPEC.UNIONS.union_object_with_discriminator));
  it('union with discriminator property', () => runCase(SERIALIZATION_SPEC.UNIONS.union_with_discriminator_property));
  it('union mixed arrays and objects', () => runCase(SERIALIZATION_SPEC.UNIONS.union_mixed_with_discriminator));
  it('union with index property and discriminator', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.union_index_property_with_discriminator));
  it('Circular union with discriminator', () => runCase(SERIALIZATION_SPEC.UNIONS.circular_union_with_discriminator));
  it('union with methods — methods should be excluded', () => runCase(SERIALIZATION_SPEC.UNIONS.union_with_methods));
  it('union with any — checked last as fallback', () => runCase(SERIALIZATION_SPEC.UNIONS.union_with_any));
  it('union with non-serializable type throws', () => runCase(SERIALIZATION_SPEC.UNIONS.union_with_non_serializable));
  it('union member with extra bigint prop — path-dependent (unsafe throws, safe strips)', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.union_extra_bigint_prop_throws));
  it('union member with extra symbol prop — declared-only output on both paths', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.union_extra_symbol_prop_drops));

  it('all UNIONS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.UNIONS).length);
  });
});

describe('serialization / ITERABLES', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Set<string>', () => runCase(SERIALIZATION_SPEC.ITERABLES.set_string));
  it('Set<SmallObject>', () => runCase(SERIALIZATION_SPEC.ITERABLES.set_small_object));
  it('objects with nested sets', () => runCase(SERIALIZATION_SPEC.ITERABLES.objects_with_nested_sets));
  it('Map<string, number>', () => runCase(SERIALIZATION_SPEC.ITERABLES.map_string_number));
  it('Map<string, SmallObject>', () => runCase(SERIALIZATION_SPEC.ITERABLES.map_string_small_object));
  it('Map<SmallObject, number>', () => runCase(SERIALIZATION_SPEC.ITERABLES.map_small_object_number));
  it('objects with nested maps', () => runCase(SERIALIZATION_SPEC.ITERABLES.objects_with_nested_maps));
  it('Map with bigint keys', () => runCase(SERIALIZATION_SPEC.ITERABLES.map_with_bigint_keys));
  it('Map with Date values', () => runCase(SERIALIZATION_SPEC.ITERABLES.map_with_date_values));

  it('all ITERABLES serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.ITERABLES).length);
  });
});

describe('serialization / CIRCULAR_REFS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('circular objects', () => runCase(SERIALIZATION_SPEC.CIRCULAR_REFS.circular_types));
  it('CircularUnion array with discriminator', () => runCase(SERIALIZATION_SPEC.CIRCULAR_REFS.circular_union_array));
  it('CircularTuple object with discriminator', () => runCase(SERIALIZATION_SPEC.CIRCULAR_REFS.circular_tuple));
  it('CircularIndex object with discriminator', () => runCase(SERIALIZATION_SPEC.CIRCULAR_REFS.circular_index));
  it('CircularDeep object with discriminator', () => runCase(SERIALIZATION_SPEC.CIRCULAR_REFS.circular_deep));
  it('Circular tuple with complex structure', () => runCase(SERIALIZATION_SPEC.CIRCULAR_REFS.circular_tuple_complex));
  it('object with circular array', () => runCase(SERIALIZATION_SPEC.CIRCULAR_REFS.object_with_circular_array));

  it('all CIRCULAR_REFS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.CIRCULAR_REFS).length);
  });
});

describe('serialization / TEMPLATE_LITERALS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('template literal as string type', () => runCase(SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_string));
  it('template literal as object property type', () => runCase(SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_in_object));
  it('template literal as index signature key', () => runCase(SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_index_key));
  it('template literal index key + sibling named property', () =>
    runCase(SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_index_key_with_named));

  it('all TEMPLATE_LITERALS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.TEMPLATE_LITERALS).length);
  });
});

describe('serialization / OTHERS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Promise top-level throws', () => runCase(SERIALIZATION_SPEC.OTHERS.promise_jsonStringify_error));
  it('non-serializable type throws (Int8Array)', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable));
  it('non-serializable inside interface throws', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_interface));
  it('non-serializable inside array throws', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_array));
  it('non-serializable inside tuple throws', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_tuple));

  it('all OTHERS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.OTHERS).length);
  });
});

// EXTRA_PARAMS — divergence test bed. Unsafe path asserts extras
// pass-through (and throws on bigint extras); safe path asserts
// strip-in-emit. Each case's getTestDataForStringify override (when
// set) describes the stripped expectation that assertSafeRoundTrip
// uses.
describe('serialization / EXTRA_PARAMS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('JSON-compatible extra prop — unsafe preserves, safe strips', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.extras_passthrough_compatible));
  it('bigint extra prop — unsafe throws at JSON.stringify, safe strips it', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.extras_throws_bigint));
  it('symbol-valued extra prop — both paths produce declared-only output', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.extras_dropped_symbol));
  it('function-valued extra prop — both paths produce declared-only output', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.extras_dropped_function));
  it('extras nested inside a declared composite child', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.nested_extras_in_declared_child));

  it('all EXTRA_PARAMS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.EXTRA_PARAMS).length);
  });
});

// createRestoreFromJson is the explicit "this adapter uses the standard
// restoreFromJson family" declaration — kept from the safe-path file.
void createRestoreFromJson;
