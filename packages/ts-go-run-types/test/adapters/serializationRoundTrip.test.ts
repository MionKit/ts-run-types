// Serialization round-trip adapter — drives `SERIALIZATION_SPEC`
// through BOTH JSON encoder + decoder modes, pairing same-mode halves.
//
// The two paths:
//
//   - unsafe: createJsonEncoder<T>({strategy: 'mutate', stripExtras: false}) +
//             createJsonDecoder<T>({stripExtras: false}). Encoder composes
//             prepareForJson + JSON.stringify (mutates v in place,
//             preserves undeclared keys). Decoder composes JSON.parse +
//             restoreFromJson (undeclared keys pass through untouched).
//   - safe:   createJsonEncoder<T>() + createJsonDecoder<T>() (both
//             default 'safe'). Encoder is single-pass stringifyJson —
//             no mutation, undeclared keys stripped at emit. Decoder
//             runs unknownKeysToUndefined before restoreFromJson —
//             any undeclared key on the parsed value becomes
//             `undefined`. For valid declared-only inputs the two
//             paths produce the same observable.
//
// Each `it()` calls `runCase(c)` which exercises both encode modes
// sequentially. Per-mode helpers (`assertUnsafeRoundTrip` /
// `assertSafeRoundTrip`) are self-contained — no `mode` parameter, no
// cross-path branching. Each path fetches its own `c.getTestData()`
// because the unsafe encoder mutates `v` in place; sharing one
// `values` array across paths would feed mutated state forward.
//
// Success criteria:
//
//   unsafe: decoder(unsafeEncoder(v)) ≅ deserializedValues[i] ?? values[i]
//   safe:   decoder(safeEncoder(v))   ≅ deserializedValues[i] ?? values[i]
//           AND safeEncoder does NOT mutate v (read-only contract,
//           verified via structuredClone snapshot, skipped for
//           cycle-bearing shapes).
//
// `deserializedValues`, `throwsAtCompile`, `jsonStringifyThrows`,
// `roundTripBestEffort`, `safeAdapterStringifyJsonNotParseable`, and
// `getTestDataForStringify` carry per-case path-aware expectations
// consumed inside each path's helper.

import {afterEach, describe, expect, it} from 'vitest';
import {SERIALIZATION_SPEC, type SerializationCase} from '../suites/serialization-suite.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from '../util/equalsHelpers.ts';

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
  // our Go pipeline emits a runtime-throwing factory whose throw
  // propagates up to the factory-call site here.
  if (c.throwsAtCompile) {
    expect(() => c.unsafeEncoder(), `${c.title}: unsafeEncoder factory must throw at compile time`).toThrow();
    expect(() => c.safeEncoder(), `${c.title}: safeEncoder factory must throw at compile time`).toThrow();
    expect(() => c.safeDirectEncoder(), `${c.title}: safeDirectEncoder factory must throw at compile time`).toThrow();
    expect(() => c.safeDecoder(), `${c.title}: safeDecoder factory must throw at compile time`).toThrow();
    expect(() => c.unsafeDecoder(), `${c.title}: unsafeDecoder factory must throw at compile time`).toThrow();
    return;
  }

  assertUnsafeRoundTrip(c);
  assertSafeRoundTrip(c);
  assertSafeDirectRoundTrip(c);
}

// ---------- UNSAFE encode path ------------------------------------

function assertUnsafeRoundTrip(c: SerializationCase): void {
  const label = `${c.title} [unsafe]`;

  // jsonStringifyThrows — unsafe-only contract. The unsafe encoder
  // composes prepareForJson + JSON.stringify; when the input carries a
  // non-serializable structural extra (bigint, …) that prepareForJson
  // doesn't strip, the internal JSON.stringify throws. Documents mion's
  // "extras pass through" semantic.
  if (c.jsonStringifyThrows) {
    const encode = c.unsafeEncoder();
    const {values} = c.getTestData();
    values.forEach((reference, i) => {
      const input = deepCloneForRoundTrip(reference);
      expect(() => encode(input), `${label}: unsafeEncoder(values[${i}]) must throw`).toThrow();
    });
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = c.unsafeEncoder();
  const decode = c.unsafeDecoder();
  const {values, deserializedValues} = c.getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      // Best-effort types accept JSON failures — the broad-type contract
      // is "if a value is JSON-supported it survives".
      if (bestEffort) return;
      throw e;
    }
    // Top-level `undefined` inputs serialize to the literal string
    // 'undefined' (per createJsonEncoder's coercion). Skip the
    // deep-equal half for those.
    if (serialized === undefined) return;
    if (bestEffort) return;
    const restored = decode(serialized);
    // `deserializedValues` holds the expected restored shape when the
    // round-trip is intentionally asymmetric (functions → undefined,
    // class instances → plain objects, etc).
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- SAFE encode path (single-pass stringifyJson) ----------

function assertSafeRoundTrip(c: SerializationCase): void {
  const label = `${c.title} [safe]`;
  const bestEffort = c.roundTripBestEffort ?? false;
  const getTestData = c.getTestDataForStringify ?? c.getTestData;
  const encode = c.safeEncoder();
  const decode = c.safeDecoder();
  const {values, deserializedValues} = getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const preSnapshot = safeStructuredClone(input);

    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }

    // No-mutation invariant — load-bearing for safeEncoder's
    // read-only contract. Skipped for shapes structuredClone refuses
    // (cycles).
    if (preSnapshot.ok) {
      expect(input, `${label}: values[${i}] — safeEncoder must not mutate input`).toEqual(preSnapshot.snapshot);
    }

    if (serialized === undefined) return;
    if (bestEffort) return;

    // `safeAdapterStringifyJsonNotParseable` is for the safeDirect
    // path (single-pass `stringifyJson`) where `String(Infinity)` is
    // `"Infinity"` (unparseable). The new `safe` mode goes through
    // native `JSON.stringify` which renders Infinity / NaN as
    // `"null"` (parseable) — so this path falls through to the
    // normal round-trip check using `deserializedValues`.

    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- SAFE-DIRECT encode path (single-pass stringifyJson) ---
//
// Same shape as assertSafeRoundTrip but builds the encoder via
// `createJsonEncoder<T>(undefined, {strategy: 'direct'})` — the
// single-pass `stringifyJson` JIT family. Pairs with `c.safeDecoder()`
// (decoder is two-mode, both safe variants use the same decoder).
// The no-mutation invariant still applies (single-pass stringify
// walks the type, never the value).

function assertSafeDirectRoundTrip(c: SerializationCase): void {
  const label = `${c.title} [safeDirect]`;
  const bestEffort = c.roundTripBestEffort ?? false;
  const getTestData = c.getTestDataForStringify ?? c.getTestData;
  const encode = c.safeDirectEncoder();
  const decode = c.safeDecoder();
  const {values, deserializedValues} = getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const preSnapshot = safeStructuredClone(input);

    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }

    if (preSnapshot.ok) {
      expect(input, `${label}: values[${i}] — safeDirectEncoder must not mutate input`).toEqual(preSnapshot.snapshot);
    }

    if (serialized === undefined) return;
    if (bestEffort) return;

    if (c.safeAdapterStringifyJsonNotParseable) {
      // safeDirect uses single-pass stringifyJson which at root for
      // Infinity / NaN emits `String(Infinity)` = `"Infinity"` —
      // unparseable by JSON.parse. Assert the decoder throws.
      expect(() => decode(serialized as string), `${label}: values[${i}] expected decoder to throw (not valid JSON)`).toThrow();
      return;
    }

    const restored = decode(serialized);
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
  it('extras passthrough — unsafe preserves, safe strips', () => runCase(SERIALIZATION_SPEC.OBJECTS.extras_passthrough_unsafe));
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
  it('flattened union — shared prop same Date type on both members', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.shared_prop_same_type));
  it('flattened union — shared prop divergent Date / string per member', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.shared_prop_divergent_date_string));
  it('flattened union — shared prop divergent bigint / number per member', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.shared_prop_divergent_bigint_number));
  it('flattened union — shared prop, member resolved structurally (no discriminator)', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.shared_prop_no_discriminator_structural));

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
