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
import {deepCloneForRoundTrip, normalizeForComparison} from '../util/equalsHelpers.ts';

// Identity fallback for cases whose restoreFromJson thunk is omitted —
// happens when a prepareForJson noop pairs with a restoreFromJson noop
// (the round-trip is just JSON.stringify / JSON.parse).
const identityFn = (v: unknown) => v;

function assertRoundTrip(
  label: string,
  prepare: (v: unknown) => unknown,
  restore: (v: unknown) => unknown,
  getValid: () => unknown[]
) {
  // Clone each sample before prepare. The serializer mutates the
  // input in place (see emit code in nodes/atomic/bigInt.ts:
  // `v.toString()`, the array's for-loop body that overwrites
  // `v[i0]`, the union's `v = [index, v]` wrap). A single getValid()
  // call is the source of truth — calling it twice for inputs vs
  // references would produce DIFFERENT Date/Map/Set instances (e.g.
  // samples that use `new Date()` inside the closure), and the
  // comparison would fail on Date `.getTime()` mismatches even
  // though the round-trip was correct.
  const samples = getValid();
  samples.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const prepared = prepare(input);
    const serialized = JSON.stringify(prepared);
    // Top-level undefined cannot be JSON-encoded — JSON.stringify
    // returns the JS value `undefined`. Skip these samples; the
    // serializer's contract is "produce a JSON-encodable shape", and
    // a bare undefined satisfies that for callers who consume the
    // prepared value directly (without going through stringify).
    if (serialized === undefined) return;
    const parsed = JSON.parse(serialized);
    const restored = restore(parsed);
    const {actual, expected} = normalizeForComparison(restored, reference);
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
  it('RegExp literal with regex-metacharacters in the source', () =>
    assertPrepareForJson(JIT_SUITE.ATOMIC.literal_regexp_escaped));
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
  it('RegExp literal with noLiterals (degrades to RegExp)', () =>
    assertPrepareForJson(JIT_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () =>
    assertPrepareForJson(JIT_SUITE.ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertPrepareForJson(JIT_SUITE.ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () =>
    assertPrepareForJson(JIT_SUITE.ATOMIC.literal_symbol_noLiterals));

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
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () =>
    assertPrepareForJson(JIT_SUITE.ARRAY.string_array_noIsArrayCheck));
  it('Array of object literals', () => assertPrepareForJson(JIT_SUITE.ARRAY.object_array));
  it('Array of unions (OR-chain per element)', () => assertPrepareForJson(JIT_SUITE.ARRAY.union_array));
  it('Array of tuples', () => assertPrepareForJson(JIT_SUITE.ARRAY.tuple_array));
  it('Self-referential array (CircularArray = CircularArray[])', () => assertPrepareForJson(JIT_SUITE.ARRAY.circular_array));
  it('Recursive object whose cycle closes via an array property', () =>
    assertPrepareForJson(JIT_SUITE.ARRAY.circular_object_with_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertPrepareForJson(JIT_SUITE.ARRAY.symbol_array));
  it('Readonly array (ReadonlyArray<T> / readonly T[])', () => assertPrepareForJson(JIT_SUITE.ARRAY.readonly_string_array));

  it('all array prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.ARRAY).length);
  });
});

describe('prepareForJson / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Simple interface with string and number props', () => assertPrepareForJson(JIT_SUITE.OBJECT.simple_interface));
  it('Object pinned with `as const` (readonly literal props)', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.object_as_const_literals));
  it('Object inferred via ReturnType<typeof factory>', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.object_via_return_type_utility));
  it('Object inferred via property access on a parent shape', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.object_via_property_access));
  it('Object inferred via array element access', () => assertPrepareForJson(JIT_SUITE.OBJECT.object_via_array_access));
  it('Interface with one optional property', () => assertPrepareForJson(JIT_SUITE.OBJECT.interface_with_optional));
  it('Interface with a Date property', () => assertPrepareForJson(JIT_SUITE.OBJECT.interface_with_date));
  it('Interface with a method (function prop skipped from check)', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.interface_with_method));
  it('Interface with a nested object property', () => assertPrepareForJson(JIT_SUITE.OBJECT.nested_object));
  it('Interface with a string-array property', () => assertPrepareForJson(JIT_SUITE.OBJECT.interface_string_array_prop));
  it('Self-referential interface (linked-list shape)', () => assertPrepareForJson(JIT_SUITE.OBJECT.circular_interface));
  it('Self-referential interface via an array-of-self property', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.circular_interface_on_array));
  it('Self-referential interface buried in a nested object', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.circular_interface_on_nested_object));
  it('Index signature with string values', () => assertPrepareForJson(JIT_SUITE.OBJECT.index_signature_string));
  it('Index signature combined with named properties', () => assertPrepareForJson(JIT_SUITE.OBJECT.index_signature_named_props));
  it('Nested index signatures (number leaf values)', () => assertPrepareForJson(JIT_SUITE.OBJECT.index_signature_nested));
  it('Nested index signatures with Date leaf values', () => assertPrepareForJson(JIT_SUITE.OBJECT.index_signature_date_value));
  it('Index signature on a nested (non-root) object property', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.index_signature_non_root));
  it('Function type at top level (any function passes)', () => assertPrepareForJson(JIT_SUITE.OBJECT.function_top_level));
  it('Record<UnionKey, V> — resolves to a fixed-property shape', () => assertPrepareForJson(JIT_SUITE.OBJECT.record_union_keys));
  it('Index signature with a union value type', () => assertPrepareForJson(JIT_SUITE.OBJECT.union_value_index));
  it('Object with a discriminated-union string property', () => assertPrepareForJson(JIT_SUITE.OBJECT.object_with_union_prop));
  it('Interface that extends a parent interface', () => assertPrepareForJson(JIT_SUITE.OBJECT.interface_inheritance));
  it('Class that extends a parent class', () => assertPrepareForJson(JIT_SUITE.OBJECT.class_inheritance));
  it('Index signature with a number key', () => assertPrepareForJson(JIT_SUITE.OBJECT.index_signature_number_key));
  it('Interface with every property optional (plain-object guard)', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.interface_all_optional));
  it('Callable interface (function plus data properties)', () => assertPrepareForJson(JIT_SUITE.OBJECT.interface_callable));
  it('Class with two atomic props (instance or plain match)', () => assertPrepareForJson(JIT_SUITE.OBJECT.class_simple));
  it('RpcError-shaped class with branded discriminator', () => assertPrepareForJson(JIT_SUITE.OBJECT.rpc_error_class));
  it('Function parameters extracted via Parameters<F>', () => assertPrepareForJson(JIT_SUITE.OBJECT.call_signature_params));
  it('Parameters<F> tuple with a trailing optional argument', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.call_signature_params_with_optional));
  it('Parameters<F> tuple with a trailing rest segment', () =>
    assertPrepareForJson(JIT_SUITE.OBJECT.call_signature_params_with_rest));

  it('all object prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.OBJECT).length);
  });
});

describe('prepareForJson / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Two-element tuple (string plus number)', () => assertPrepareForJson(JIT_SUITE.TUPLE.string_number_pair));
  it('Six-element heterogeneous tuple (mion fixture)', () => assertPrepareForJson(JIT_SUITE.TUPLE.full_mion_tuple));
  it('Tuple with trailing optional elements', () => assertPrepareForJson(JIT_SUITE.TUPLE.tuple_with_optional));
  it('Tuple as array element (tuple inside array dependency call)', () =>
    assertPrepareForJson(JIT_SUITE.TUPLE.nested_tuple_in_array));
  it('Self-referential tuple via trailing optional self-ref', () => assertPrepareForJson(JIT_SUITE.TUPLE.tuple_circular));
  it('Tuple with a function slot (must be undefined)', () => assertPrepareForJson(JIT_SUITE.TUPLE.tuple_with_non_serializable));
  it('Tuple with a trailing rest segment', () => assertPrepareForJson(JIT_SUITE.TUPLE.tuple_rest));
  it('Tuple with multiple trailing optional slots', () =>
    assertPrepareForJson(JIT_SUITE.TUPLE.tuple_multiple_trailing_optionals));
  it('Tuple with named element labels (labels erased at runtime)', () =>
    assertPrepareForJson(JIT_SUITE.TUPLE.tuple_named_labels));
  it('Empty tuple `[]` (only the empty array passes)', () => assertPrepareForJson(JIT_SUITE.TUPLE.empty_tuple));
  it('Single-element tuple `[T]`', () => assertPrepareForJson(JIT_SUITE.TUPLE.single_element_tuple));
  it('Readonly tuple (readonly [T, U])', () => assertPrepareForJson(JIT_SUITE.TUPLE.readonly_tuple));

  it('all tuple prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.TUPLE).length);
  });
});

describe('prepareForJson / NATIVE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Map with string keys and number values', () => assertPrepareForJson(JIT_SUITE.NATIVE.map_string_number));
  it('Set of strings', () => assertPrepareForJson(JIT_SUITE.NATIVE.set_string));
  it('Promise — thenable check, wrapped type not validated', () => assertPrepareForJson(JIT_SUITE.NATIVE.promise_string));
  it('Awaited<Promise<T>> — resolves to the wrapped type', () => assertPrepareForJson(JIT_SUITE.NATIVE.awaited_promise));

  it('all native prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.NATIVE).length);
  });
});

describe('prepareForJson / UNION', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Union of common atomic types (with Date and bigint)', () => assertPrepareForJson(JIT_SUITE.UNION.atomic_union));
  it('Union of string literals (case-sensitive)', () => assertPrepareForJson(JIT_SUITE.UNION.string_literal_union));
  it('Two-arm union of string and number', () => assertPrepareForJson(JIT_SUITE.UNION.string_or_number));
  it('Union of array types (whole-array dispatch)', () => assertPrepareForJson(JIT_SUITE.UNION.union_of_array_types));
  it('Array whose element type is a union', () => assertPrepareForJson(JIT_SUITE.UNION.array_of_union));
  it('Union of disjoint object shapes', () => assertPrepareForJson(JIT_SUITE.UNION.union_of_object_shapes));
  it('Discriminated union (shared kind literal, different payloads)', () =>
    assertPrepareForJson(JIT_SUITE.UNION.discriminated_union));
  it('Union of object arms each carrying a method', () => assertPrepareForJson(JIT_SUITE.UNION.union_with_methods));
  it('Self-referential union via object and array arms', () => assertPrepareForJson(JIT_SUITE.UNION.circular_union));
  it('Intersection of object shapes (resolved to one merged shape)', () =>
    assertPrepareForJson(JIT_SUITE.UNION.intersection_to_object));
  it('Union where one arm carries an index signature', () => assertPrepareForJson(JIT_SUITE.UNION.union_with_index_arm));
  it('Discriminated union sharing one prop with arm-dependent type', () =>
    assertPrepareForJson(JIT_SUITE.UNION.union_same_prop_different_types));
  it('Union mixing array types and object shapes', () => assertPrepareForJson(JIT_SUITE.UNION.union_mixed_arrays_and_objects));
  it('Union of shapes sharing a prop with different value types', () =>
    assertPrepareForJson(JIT_SUITE.UNION.union_merged_property));
  it('Union mixing arrays, plain objects, and index-signature shapes', () =>
    assertPrepareForJson(JIT_SUITE.UNION.union_mixed_with_index));
  it('Union with an `any` arm (collapses to any)', () => assertPrepareForJson(JIT_SUITE.UNION.union_with_any_fallback));
  it('Union with an `unknown` arm (collapses to unknown)', () =>
    assertPrepareForJson(JIT_SUITE.UNION.union_with_unknown_fallback));
  it('Union with the smaller arm declared before its superset', () =>
    assertPrepareForJson(JIT_SUITE.UNION.union_subset_small_first));
  it('Union with a three-level subset chain', () => assertPrepareForJson(JIT_SUITE.UNION.union_subset_nested_levels));
  it('Union mixing a subset pair with a disjoint arm', () =>
    assertPrepareForJson(JIT_SUITE.UNION.union_subset_mixed_related_unrelated));

  it('all union prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.UNION).length);
  });
});

describe('prepareForJson / TEMPLATE_LITERAL', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Template literal URL with a number placeholder', () => assertPrepareForJson(JIT_SUITE.TEMPLATE_LITERAL.url_with_number_id));
  it('Template literal URL with multiple placeholders', () => assertPrepareForJson(JIT_SUITE.TEMPLATE_LITERAL.multi_segment_url));
  it('Template literal starting with a string placeholder', () =>
    assertPrepareForJson(JIT_SUITE.TEMPLATE_LITERAL.leading_string_placeholder));
  it('Template literal with regex metacharacters in literal segments', () =>
    assertPrepareForJson(JIT_SUITE.TEMPLATE_LITERAL.regex_special_chars));
  it('Object with a template-literal-typed string property', () =>
    assertPrepareForJson(JIT_SUITE.TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('Index signature whose key is a template literal pattern', () =>
    assertPrepareForJson(JIT_SUITE.TEMPLATE_LITERAL.template_literal_index_key));
  it('Template literal with a union-of-literals placeholder', () =>
    assertPrepareForJson(JIT_SUITE.TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.TEMPLATE_LITERAL).length);
  });
});

describe('prepareForJson / CIRCULAR', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Self-referential object with optional self-ref and Date prop', () =>
    assertPrepareForJson(JIT_SUITE.CIRCULAR.object_full_mion_shape));
  it('Self-referential array whose union element includes the array itself', () =>
    assertPrepareForJson(JIT_SUITE.CIRCULAR.array_of_union_with_self_ref));
  it('Self-referential object whose cycle closes via a tuple property', () =>
    assertPrepareForJson(JIT_SUITE.CIRCULAR.object_with_tuple_prop));
  it('Self-referential object whose cycle closes via an index signature', () =>
    assertPrepareForJson(JIT_SUITE.CIRCULAR.object_with_index_prop));
  it('Self-referential object with the cycle buried four levels deep', () =>
    assertPrepareForJson(JIT_SUITE.CIRCULAR.object_deeply_nested));
  it('Non-circular root holding a circular child interface', () =>
    assertPrepareForJson(JIT_SUITE.CIRCULAR.circular_child_under_literal_root));
  it('Multiple circular types cross-referenced from a non-circular root', () =>
    assertPrepareForJson(JIT_SUITE.CIRCULAR.multiple_circular_types_cross_referenced));

  it('all circular prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.CIRCULAR).length);
  });
});

describe('prepareForJson / UTILITY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Partial<T> — all props become optional', () => assertPrepareForJson(JIT_SUITE.UTILITY.partial));
  it('Required<T> — all optional props become required', () => assertPrepareForJson(JIT_SUITE.UTILITY.required));
  it('Pick<T, K> — keeps only the named properties', () => assertPrepareForJson(JIT_SUITE.UTILITY.pick));
  it('Omit<T, K> — drops the named properties', () => assertPrepareForJson(JIT_SUITE.UTILITY.omit));
  it('Exclude<U, X> on a string-literal union', () => assertPrepareForJson(JIT_SUITE.UTILITY.exclude_atomic));
  it('Extract<U, X> on a string-literal union', () => assertPrepareForJson(JIT_SUITE.UTILITY.extract_atomic));
  it('Exclude<U, X> on a discriminated object union', () => assertPrepareForJson(JIT_SUITE.UTILITY.exclude_from_object_union));
  it('NonNullable<T> — strips null and undefined from a union', () => assertPrepareForJson(JIT_SUITE.UTILITY.non_nullable));
  it('ReturnType<F> — extracts the return type of a function', () => assertPrepareForJson(JIT_SUITE.UTILITY.return_type));
  it('Readonly<T> — readonly bit erased at runtime', () => assertPrepareForJson(JIT_SUITE.UTILITY.readonly));
  it('Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)', () =>
    assertPrepareForJson(JIT_SUITE.UTILITY.intersection_with_required_override));
  it('Omit<T, K> preserves optionality of remaining props', () => assertPrepareForJson(JIT_SUITE.UTILITY.omit_keeping_optional));
  it('keyof T — resolves to a union of string-literal keys', () =>
    assertPrepareForJson(JIT_SUITE.UTILITY.keyof_to_literal_union));
  it('typeof variable — type query on a runtime value', () => assertPrepareForJson(JIT_SUITE.UTILITY.typeof_variable_query));
  it('Indexed access type — Person["name"] resolves to string', () =>
    assertPrepareForJson(JIT_SUITE.UTILITY.indexed_access_type));
  it('Conditional type — T extends string ? boolean : number', () =>
    assertPrepareForJson(JIT_SUITE.UTILITY.conditional_type_resolved));
  it('Custom mapped type — {[K in keyof T]: T[K] | null}', () => assertPrepareForJson(JIT_SUITE.UTILITY.mapped_type_custom));
  it('Mapped type whose value is a conditional — per-prop shape diverges', () =>
    assertPrepareForJson(JIT_SUITE.UTILITY.mapped_type_with_conditional_value));
  it('Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`', () =>
    assertPrepareForJson(JIT_SUITE.UTILITY.distributive_conditional_over_union));
  it('DeepPartial<T> — recursive mapped type with nested optionality', () =>
    assertPrepareForJson(JIT_SUITE.UTILITY.deep_partial_recursive_mapped));

  it('all utility prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.UTILITY).length);
  });
});

describe('prepareForJson / TYPE_MAPPINGS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Key prefix via template literal — `prefix_${K}` rename', () =>
    assertPrepareForJson(JIT_SUITE.TYPE_MAPPINGS.key_prefix_rename));
  it('Conditional key rename — swap one key, leave the rest', () =>
    assertPrepareForJson(JIT_SUITE.TYPE_MAPPINGS.key_conditional_rename));
  it('Filter keys via `never` — drop sensitive props', () => assertPrepareForJson(JIT_SUITE.TYPE_MAPPINGS.key_filter_via_never));

  it('all type-mappings prepareForJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.TYPE_MAPPINGS).length);
  });
});
