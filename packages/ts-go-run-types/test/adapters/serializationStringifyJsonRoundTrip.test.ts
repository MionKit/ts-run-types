// Safe-path serialization adapter — drives the standalone serialization
// suite through the ported `stringifyJson` JIT family (mion's single-pass
// serialiser that walks the type, not `v`). Sibling of
// `serializationRoundTrip.test.ts` (the unsafe-path adapter that uses
// `prepareForJson + JSON.stringify`). Both run the SAME 13-section
// SERIALIZATION_SPEC; when the safe-path output diverges from the
// unsafe-path output (extras-bearing cases), the case supplies a
// `getTestDataForStringify` override that this adapter reads, falling
// back to `getTestData` for the ~95% of cases where the two paths
// produce identical observable behaviour.
//
// Success criterion (per case, per variant):
//
//   restoreFromJson(JSON.parse(stringifyJson(v)))
//     ≅ deserializedValues[i] ?? values[i]   (via normalizeForComparison)
//
// Additional invariants asserted here that the unsafe adapter cannot:
//
//   - **No mutation of `v`** — stringifyJson reads but never writes.
//     A pre-call structuredClone is compared post-call to confirm the
//     input wasn't rebound. Skipped for circular shapes (structuredClone
//     refuses cycles).
//   - **Extras stripped in the EMIT** — EXTRA_PARAMS cases that the
//     unsafe adapter records as `jsonStringifyThrows` (bigint extra
//     would crash JSON.stringify) succeed here without throwing,
//     producing the declared-only output.
//
// Why two adapter files instead of two passes in one file: the per-case
// expectations diverge (one path throws, one path succeeds), so keeping
// each adapter responsible for its own success criterion keeps the
// per-test failure messages legible.

import {afterEach, describe, expect, it} from 'vitest';
import {createRestoreFromJson} from '@mionjs/ts-go-run-types';
import {SERIALIZATION_SPEC, type SerializationCase} from '../suites/serialization-suite.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from '../util/equalsHelpers.ts';

const identityFn = (v: unknown) => v;

function pickTestData(c: SerializationCase) {
  return (c.getTestDataForStringify ?? c.getTestData)();
}

function safeStructuredClone(input: unknown): {ok: boolean; snapshot?: unknown} {
  try {
    return {ok: true, snapshot: structuredClone(input)};
  } catch {
    // Cycles, functions, etc. refuse structuredClone — skip the
    // no-mutation check rather than fail the test.
    return {ok: false};
  }
}

function assertSafeRoundTrip(
  label: string,
  stringify: (v: unknown) => string | undefined,
  restore: (v: unknown) => unknown,
  c: SerializationCase,
  bestEffort: boolean
) {
  const {values, deserializedValues} = pickTestData(c);
  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const pre = safeStructuredClone(input);
    let serialized: string | undefined;
    try {
      serialized = stringify(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    // No-mutation invariant — load-bearing assertion that stringifyJson
    // reads but never writes. Skipped for shapes structuredClone can't
    // handle (cycles, functions).
    if (pre.ok) {
      expect(input, `${label}: values[${i}] — stringifyJson must not mutate input`).toEqual(pre.snapshot);
    }
    if (serialized === undefined) {
      // Top-level undefined returns the JS undefined (mion parity).
      // No JSON.parse possible — skip the deep-equal half.
      return;
    }
    if (bestEffort) {
      // Broad type: success = stringify produced a string. No shape
      // comparison.
      return;
    }
    if (c.safeAdapterStringifyJsonNotParseable) {
      // Number-not-supported semantic: `String(Infinity)` is
      // `"Infinity"` (not a valid JSON document). Assert JSON.parse
      // throws — matches mion's "either throw OR non-equal" loose
      // contract from number_not_supported.spec.
      expect(() => JSON.parse(serialized!), `${label}: values[${i}] expected JSON.parse to throw (not valid JSON)`).toThrow();
      return;
    }
    const parsed = JSON.parse(serialized);
    const restored = restore(parsed);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] safe round-trip should match expected reference`).toEqual(expected);
  });
}

function runCase(c: SerializationCase): void {
  // throwsAtCompile cases — the unsafe adapter asserts the factory
  // throws; the safe adapter should too. Our pipeline identity-falls-
  // back for unsupported types so this assertion may not hold; same
  // caveat as the unsafe adapter — surfaces as a visible failure when
  // it does, and the implementation is the bug, not the test.
  if (c.throwsAtCompile) {
    if (c.stringifyJson) {
      expect(() => c.stringifyJson!(), `${c.title}: stringifyJson factory must throw at compile time`).toThrow();
    }
    return;
  }

  // jsonStringifyThrows cases — UNSAFE path throws because the input
  // carries a JSON-incompatible extra (bigint). SAFE path strips the
  // extra in the EMIT, so this should succeed. Run a regular
  // round-trip; the case carries a getTestDataForStringify with the
  // stripped expected output.
  // (No special branch needed — the regular assertSafeRoundTrip path
  // handles it correctly via getTestDataForStringify.)

  // Cases without a stringifyJson thunk get skipped — defensive guard
  // for any case that's missing the thunk. Every case in the suite
  // SHOULD have one; if a new case lands without it, this guard makes
  // the gap visible rather than silent identity-fallback.
  if (!c.stringifyJson) {
    throw new Error(`SerializationCase "${c.title}" is missing a stringifyJson thunk — add it to the suite.`);
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const stringifier = c.stringifyJson();
  const restoreStatic = c.restoreFromJson?.() ?? identityFn;
  const restoreReflect = c.restoreFromJsonReflect?.() ?? identityFn;
  const restoreDeserStatic = c.deserializeRestoreFromJson?.() ?? identityFn;
  const restoreDeserReflect = c.deserializeRestoreFromJsonReflect?.() ?? identityFn;

  assertSafeRoundTrip(`${c.title} [stringify-static]`, stringifier, restoreStatic, c, bestEffort);

  // The reflect / deserialize variants apply to the RESTORE half only
  // — stringifyJson's read-only contract makes a reflect-vs-static
  // distinction on the serialise half meaningless. Drive each restore
  // variant against the same stringifier.
  if (c.restoreFromJsonReflect) {
    assertSafeRoundTrip(`${c.title} [stringify+restore-reflect]`, stringifier, restoreReflect, c, bestEffort);
  }
  if (c.deserializeRestoreFromJson) {
    assertSafeRoundTrip(`${c.title} [stringify+restore-deser-static]`, stringifier, restoreDeserStatic, c, bestEffort);
  }
  if (c.deserializeRestoreFromJsonReflect) {
    assertSafeRoundTrip(`${c.title} [stringify+restore-deser-reflect]`, stringifier, restoreDeserReflect, c, bestEffort);
  }
}

describe('safe serialization / ATOMIC', () => {
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

  it('all ATOMIC safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.ATOMIC).length);
  });
});

describe('safe serialization / ARRAYS', () => {
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

  it('all ARRAYS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.ARRAYS).length);
  });
});

describe('safe serialization / OBJECTS', () => {
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
  it('extras passthrough (stringify strips, while prepare preserves)', () =>
    runCase(SERIALIZATION_SPEC.OBJECTS.extras_passthrough_unsafe));
  it('interface circular', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_circular));
  it('interface circular array', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_circular_array));
  it('interface circular deep', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_circular_deep));
  it('interface root not circular', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_root_not_circular));
  it('interface multiple circular', () => runCase(SERIALIZATION_SPEC.OBJECTS.interface_multiple_circular));
  it('methods should be excluded from interface when serializing', () =>
    runCase(SERIALIZATION_SPEC.OBJECTS.interface_with_methods));

  it('all OBJECTS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.OBJECTS).length);
  });
});

describe('safe serialization / RECORDS', () => {
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

  it('all RECORDS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.RECORDS).length);
  });
});

describe('safe serialization / TUPLES', () => {
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

  it('all TUPLES safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.TUPLES).length);
  });
});

describe('safe serialization / FUNCTIONS', () => {
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

  it('all FUNCTIONS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.FUNCTIONS).length);
  });
});

describe('safe serialization / UTILITY_TYPES', () => {
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

  it('all UTILITY_TYPES safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.UTILITY_TYPES).length);
  });
});

describe('safe serialization / UNIONS', () => {
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
  it('union member with extra bigint prop — stringify path strips, no throw', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.union_extra_bigint_prop_throws));
  it('union member with extra symbol prop — both paths produce declared-only', () =>
    runCase(SERIALIZATION_SPEC.UNIONS.union_extra_symbol_prop_drops));

  it('all UNIONS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.UNIONS).length);
  });
});

describe('safe serialization / ITERABLES', () => {
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

  it('all ITERABLES safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.ITERABLES).length);
  });
});

describe('safe serialization / CIRCULAR_REFS', () => {
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

  it('all CIRCULAR_REFS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.CIRCULAR_REFS).length);
  });
});

describe('safe serialization / TEMPLATE_LITERALS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('template literal as string type', () => runCase(SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_string));
  it('template literal as object property type', () => runCase(SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_in_object));
  it('template literal as index signature key', () => runCase(SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_index_key));
  it('template literal index key + sibling named property', () =>
    runCase(SERIALIZATION_SPEC.TEMPLATE_LITERALS.url_index_key_with_named));

  it('all TEMPLATE_LITERALS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.TEMPLATE_LITERALS).length);
  });
});

describe('safe serialization / OTHERS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Promise top-level throws', () => runCase(SERIALIZATION_SPEC.OTHERS.promise_jsonStringify_error));
  it('non-serializable type throws (Int8Array)', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable));
  it('non-serializable inside interface throws', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_interface));
  it('non-serializable inside array throws', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_array));
  it('non-serializable inside tuple throws', () => runCase(SERIALIZATION_SPEC.OTHERS.non_serializable_tuple));

  it('all OTHERS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.OTHERS).length);
  });
});

// EXTRA_PARAMS — the divergence test bed. Where the unsafe adapter
// asserts extras pass-through (and throws on bigint extras), the safe
// adapter asserts strip-in-emit. Each case's
// `getTestDataForStringify` describes the stripped expectation.
describe('safe serialization / EXTRA_PARAMS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('JSON-compatible extra prop — safe strips, output has only declared keys', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.extras_passthrough_compatible));
  it('bigint extra prop — safe strips before stringify, no throw', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.extras_throws_bigint));
  it('symbol-valued extra prop — declared-only output', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.extras_dropped_symbol));
  it('function-valued extra prop — declared-only output', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.extras_dropped_function));
  it('extras nested inside a declared composite child — recursive strip', () =>
    runCase(SERIALIZATION_SPEC.EXTRA_PARAMS.nested_extras_in_declared_child));

  it('all EXTRA_PARAMS safe serialization tests ran', () => {
    expect(ranTests).toBe(Object.keys(SERIALIZATION_SPEC.EXTRA_PARAMS).length);
  });
});

// createRestoreFromJson import is referenced via the test cases'
// thunks; importing it directly here is the explicit "this adapter
// uses the standard restoreFromJson family" declaration.
void createRestoreFromJson;
