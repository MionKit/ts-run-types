// Serialization round-trip adapter — drives the standalone serialization
// suite ported from mion's `serialization-suite.ts`. Runs ALONGSIDE the
// `prepareForJson.test.ts` / `restoreFromJson.test.ts` adapters that
// consume the validator-shared `jit-suite.ts`. Both halves of the
// JSON pair (prepareForJson + restoreFromJson) are exercised per case
// in a single it() because mion's suite always pairs them.
//
// Success criterion mirrors prepareForJson.test.ts:
//
//   restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))
//     ≅ deserializedValues[i] ?? values[i]   (via normalizeForComparison)
//
// `deserializedValues` is supplied by cases whose restored shape
// intentionally diverges from the original — e.g. functions in tuples
// decode to `undefined`, class instances decode to plain objects, etc.
// Falls through to `values[i]` when omitted.
//
// `throwsAtCompile: true` cases assert that the prepareForJson /
// restoreFromJson thunks throw on invocation (factory creation time).
// Our implementation may diverge from mion here (mion throws inside
// the emitter; our Go pipeline falls back to identity for unsupported
// types). When that divergence surfaces, the test fails visibly — per
// the testing-absolute-rules, the implementation is the bug, not the
// test.
//
// `roundTripBestEffort: true` cases (any / unknown / object) skip the
// deep-equal step and check only that JSON.stringify produces a
// non-undefined output — the broad-type contract is "if it's
// JSON-supported it survives" without requiring shape equivalence.

import {afterEach, describe, expect, it} from 'vitest';
import {SERIALIZATION_SPEC, type SerializationCase} from '../suites/serialization-suite.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from '../util/equalsHelpers.ts';

const identityFn = (v: unknown) => v;

function assertRoundTrip(
  label: string,
  prepare: (v: unknown) => unknown,
  restore: (v: unknown) => unknown,
  getTestData: () => {values: unknown[]; deserializedValues?: unknown[]},
  bestEffort: boolean
) {
  const {values, deserializedValues} = getTestData();
  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const prepared = prepare(input);
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(prepared);
    } catch (e) {
      // Best-effort types (any / unknown / object) accept JSON
      // failures — the broad-type contract is "if a value is
      // JSON-supported it survives", and bigint / symbol / circular
      // values legitimately throw at stringify. Non-bestEffort
      // types re-throw so the failure stays visible.
      if (bestEffort) return;
      throw e;
    }
    // Top-level undefined cannot be JSON-encoded — JSON.stringify
    // returns the JS value `undefined`. Skip the deep-equal half but
    // honour the contract that the prepare half didn't throw.
    if (serialized === undefined) return;
    if (bestEffort) {
      // Broad type: success = JSON-encodable. No shape comparison.
      return;
    }
    const parsed = JSON.parse(serialized);
    const restored = restore(parsed);
    // mion's deserializedValues holds the expected restored shape when
    // the round-trip is intentionally asymmetric (functions → undefined,
    // class instances → plain objects, etc).
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

function runCase(c: SerializationCase): void {
  // throwsAtCompile cases: the prepareForJson / restoreFromJson
  // factory invocation itself must throw. mion fails the runtype's
  // emit step for unsupported kinds; our Go pipeline emits no factory
  // and createPrepareForJson falls through to identity — which would
  // make this assertion fail visibly. That's the intended divergence
  // surface for the next implementation round.
  if (c.throwsAtCompile) {
    expect(() => c.prepareForJson(), `${c.title}: prepareForJson factory must throw at compile time`).toThrow();
    expect(() => c.restoreFromJson(), `${c.title}: restoreFromJson factory must throw at compile time`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const getTestData = c.getTestData;

  // Paired thunks for the round-trip. Same 4-variant pattern as
  // jit-suite adapters — when a half is undefined the pair is presumed
  // identity (covers atomic noops cleanly).
  const restoreStatic = c.restoreFromJson?.() ?? identityFn;
  const restoreReflect = c.restoreFromJsonReflect?.() ?? identityFn;
  const restoreDeserStatic = c.deserializeRestoreFromJson?.() ?? identityFn;
  const restoreDeserReflect = c.deserializeRestoreFromJsonReflect?.() ?? identityFn;

  assertRoundTrip(`${c.title} [static]`, c.prepareForJson(), restoreStatic, getTestData, bestEffort);

  if (c.prepareForJsonReflect) {
    assertRoundTrip(`${c.title} [reflect]`, c.prepareForJsonReflect(), restoreReflect, getTestData, bestEffort);
  }

  if (c.deserializePrepareForJson) {
    assertRoundTrip(
      `${c.title} [deserialize-static]`,
      c.deserializePrepareForJson(),
      restoreDeserStatic,
      getTestData,
      bestEffort
    );
  }

  if (c.deserializePrepareForJsonReflect) {
    assertRoundTrip(
      `${c.title} [deserialize-reflect]`,
      c.deserializePrepareForJsonReflect(),
      restoreDeserReflect,
      getTestData,
      bestEffort
    );
  }
}

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
  it('not supported in JSON stringify when any type is used', () =>
    runCase(SERIALIZATION_SPEC.ATOMIC.not_supported_any));
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
  it('non-serializable class via deserialize function', () =>
    runCase(SERIALIZATION_SPEC.OBJECTS.non_serializable_class));
  it('undefined is omitted in object prop', () => runCase(SERIALIZATION_SPEC.OBJECTS.undefined_in_object));
  it('optional properties order', () => runCase(SERIALIZATION_SPEC.OBJECTS.optional_properties_order));
  it('all optional fields', () => runCase(SERIALIZATION_SPEC.OBJECTS.all_optional_fields));
  it('strip extra params (mion semantic — extras pass through)', () =>
    runCase(SERIALIZATION_SPEC.OBJECTS.strip_extra_params));
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
  it('interface with a single property and index property', () =>
    runCase(SERIALIZATION_SPEC.RECORDS.index_property_and_prop));
  it('index property with extra props and unions', () => runCase(SERIALIZATION_SPEC.RECORDS.index_property_extra));
  it('multiple index properties (symbol keys skipped)', () =>
    runCase(SERIALIZATION_SPEC.RECORDS.multiple_index_props));
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
  it('function with only rest parameters', () =>
    runCase(SERIALIZATION_SPEC.FUNCTIONS.function_with_only_rest_parameters));
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
  it('non-serializable inside interface throws', () =>
    runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_interface));
  it('non-serializable inside array throws', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_array));
  it('non-serializable inside tuple throws', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_tuple));

  it('all OTHERS serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.OTHERS).length);
  });
});
