// getTypeErrors adapter — runs every JitCase whose `getTypeErrors`
// thunk is defined against the precompiled validator the Go binary emits
// via internal/caches/jitfn/typeerrors.go.
//
// Mirrors `isType.test.ts` shape exactly — one `describe(...)` per
// category, one `it(...)` per case (no for-loop registration), a
// per-describe counter + coverage-guard `it('all <category>
// getTypeErrors tests ran', …)` that fails if a new case in the
// validation suite is missed here.
//
// Cases the Go emitter doesn't support yet leave their `getTypeErrors`
// thunk undefined; the coverage guard reads the active-count off the
// suite at run time, so the file scales naturally as kinds land.

import {afterEach, describe, expect, it} from 'vitest';
import {JIT_SUITE, type JitCase} from '../suites/jit-suite.ts';

function assertGetTypeErrors(c: JitCase): void {
  if (!c.getTypeErrors) throw new Error(`case ${c.title}: missing getTypeErrors thunk`);
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();

  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }

  // Static form: createGetTypeErrors<T>().
  const getErrStatic = c.getTypeErrors();
  valid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: invalid[${i}]`).toEqual(expected[i]);
  });

  // Reflect form: createGetTypeErrors(value). Optional.
  if (c.getTypeErrorsReflect) {
    const getErrReflect = c.getTypeErrorsReflect();
    valid.forEach((v, i) => {
      expect(getErrReflect(v), `${c.title} [reflect]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(getErrReflect(v), `${c.title} [reflect]: invalid[${i}]`).toEqual(expected[i]);
    });
  }

  // Deserialize-static form: deserializeGetTypeErrors<T>().
  if (c.deserializeGetTypeErrors) {
    const deserializedStatic = c.deserializeGetTypeErrors();
    valid.forEach((v, i) => {
      expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}]`).toEqual(expected[i]);
    });
  }

  // Deserialize-reflect form: deserializeGetTypeErrors(value).
  if (c.deserializeGetTypeErrorsReflect) {
    const deserializedReflect = c.deserializeGetTypeErrorsReflect();
    valid.forEach((v, i) => {
      expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}]`).toEqual(expected[i]);
    });
  }
}

describe('getTypeErrors / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Any type — every value passes', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.any));
  it('BigInt primitive', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () =>
    assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.object));
  it('RegExp instance', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.regexp));
  it('String primitive', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.string));
  it('Symbol primitive', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.void));

  it('Unknown type — every value passes', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.unknown));

  // noLiterals variants — literal types degrade to their base kind.
  it('Numeric literal with noLiterals (degrades to number)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () =>
    assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () =>
    assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () =>
    assertGetTypeErrors(JIT_SUITE.ATOMIC.literal_symbol_noLiterals));

  // Strict count — fails if the suite gains a new case without a
  // matching `it(...)` above. Every case in this section must have
  // a getTypeErrors thunk; the suite ships with full parity to
  // isType, so the `Object.keys().length` count is the right gate.
  it('all atomic getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.ATOMIC).length);
  });
});

describe('getTypeErrors / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Array of strings', () => assertGetTypeErrors(JIT_SUITE.ARRAY.string_array));
  it('Array of numbers (rejects Infinity / NaN per element)', () => assertGetTypeErrors(JIT_SUITE.ARRAY.number_array));
  it('Array of booleans', () => assertGetTypeErrors(JIT_SUITE.ARRAY.boolean_array));
  it('Array of bigints', () => assertGetTypeErrors(JIT_SUITE.ARRAY.bigint_array));
  it('Array of Dates (rejects Invalid Date per element)', () => assertGetTypeErrors(JIT_SUITE.ARRAY.date_array));
  it('Array of RegExps', () => assertGetTypeErrors(JIT_SUITE.ARRAY.regexp_array));
  it('Array of undefined values', () => assertGetTypeErrors(JIT_SUITE.ARRAY.undefined_array));
  it('Array of nulls', () => assertGetTypeErrors(JIT_SUITE.ARRAY.null_array));
  it('Generic Array<T> form (same emit as T[])', () => assertGetTypeErrors(JIT_SUITE.ARRAY.array_generic));
  it('Two-dimensional string array (multi-level dependency call)', () => assertGetTypeErrors(JIT_SUITE.ARRAY.string_array_2d));
  it('Three-dimensional string array (depth stress)', () => assertGetTypeErrors(JIT_SUITE.ARRAY.string_array_3d));
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () =>
    assertGetTypeErrors(JIT_SUITE.ARRAY.string_array_noIsArrayCheck));
  it('Self-referential array (CircularArray = CircularArray[])', () => assertGetTypeErrors(JIT_SUITE.ARRAY.circular_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertGetTypeErrors(JIT_SUITE.ARRAY.symbol_array));
  it('Array of unions (OR-chain per element)', () => assertGetTypeErrors(JIT_SUITE.ARRAY.union_array));
  it('Array of object literals', () => assertGetTypeErrors(JIT_SUITE.ARRAY.object_array));
  it('Recursive object whose cycle closes via an array property', () =>
    assertGetTypeErrors(JIT_SUITE.ARRAY.circular_object_with_array));
  it('Array of tuples', () => assertGetTypeErrors(JIT_SUITE.ARRAY.tuple_array));
  it('Readonly array (ReadonlyArray<T> / readonly T[])', () => assertGetTypeErrors(JIT_SUITE.ARRAY.readonly_string_array));

  it('all array getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.ARRAY).length);
  });
});

describe('getTypeErrors / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Simple interface with string and number props', () => assertGetTypeErrors(JIT_SUITE.OBJECT.simple_interface));
  it('Object pinned with `as const` (readonly literal props)', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.object_as_const_literals));
  it('Object inferred via ReturnType<typeof factory>', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.object_via_return_type_utility));
  it('Object inferred via property access on a parent shape', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.object_via_property_access));
  it('Object inferred via array element access', () => assertGetTypeErrors(JIT_SUITE.OBJECT.object_via_array_access));
  it('Interface with one optional property', () => assertGetTypeErrors(JIT_SUITE.OBJECT.interface_with_optional));
  it('Interface with a Date property', () => assertGetTypeErrors(JIT_SUITE.OBJECT.interface_with_date));
  it('Interface with a method (function prop skipped from check)', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.interface_with_method));
  it('Interface with a nested object property', () => assertGetTypeErrors(JIT_SUITE.OBJECT.nested_object));
  it('Interface with a string-array property', () => assertGetTypeErrors(JIT_SUITE.OBJECT.interface_string_array_prop));
  it('Self-referential interface (linked-list shape)', () => assertGetTypeErrors(JIT_SUITE.OBJECT.circular_interface));
  it('Self-referential interface via an array-of-self property', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.circular_interface_on_array));
  it('Self-referential interface buried in a nested object', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.circular_interface_on_nested_object));
  it('Index signature with string values', () => assertGetTypeErrors(JIT_SUITE.OBJECT.index_signature_string));
  it('Index signature combined with named properties', () => assertGetTypeErrors(JIT_SUITE.OBJECT.index_signature_named_props));
  it('Nested index signatures (number leaf values)', () => assertGetTypeErrors(JIT_SUITE.OBJECT.index_signature_nested));
  it('Nested index signatures with Date leaf values', () => assertGetTypeErrors(JIT_SUITE.OBJECT.index_signature_date_value));
  it('Index signature on a nested (non-root) object property', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.index_signature_non_root));
  it('Function type at top level (any function passes)', () => assertGetTypeErrors(JIT_SUITE.OBJECT.function_top_level));
  it('Interface with every property optional (plain-object guard)', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.interface_all_optional));
  it('Callable interface (function plus data properties)', () => assertGetTypeErrors(JIT_SUITE.OBJECT.interface_callable));
  it('Class with two atomic props (instance or plain match)', () => assertGetTypeErrors(JIT_SUITE.OBJECT.class_simple));
  it('RpcError-shaped class with branded discriminator', () => assertGetTypeErrors(JIT_SUITE.OBJECT.rpc_error_class));
  it('Function parameters extracted via Parameters<F>', () => assertGetTypeErrors(JIT_SUITE.OBJECT.call_signature_params));
  it('Parameters<F> tuple with a trailing optional argument', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.call_signature_params_with_optional));
  it('Parameters<F> tuple with a trailing rest segment', () =>
    assertGetTypeErrors(JIT_SUITE.OBJECT.call_signature_params_with_rest));
  it('Record<UnionKey, V> — resolves to a fixed-property shape', () => assertGetTypeErrors(JIT_SUITE.OBJECT.record_union_keys));
  it('Index signature with a union value type', () => assertGetTypeErrors(JIT_SUITE.OBJECT.union_value_index));
  it('Object with a discriminated-union string property', () => assertGetTypeErrors(JIT_SUITE.OBJECT.object_with_union_prop));
  it('Interface that extends a parent interface', () => assertGetTypeErrors(JIT_SUITE.OBJECT.interface_inheritance));
  it('Class that extends a parent class', () => assertGetTypeErrors(JIT_SUITE.OBJECT.class_inheritance));
  it('Index signature with a number key', () => assertGetTypeErrors(JIT_SUITE.OBJECT.index_signature_number_key));

  it('all object getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.OBJECT).length);
  });
});

describe('getTypeErrors / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Two-element tuple (string plus number)', () => assertGetTypeErrors(JIT_SUITE.TUPLE.string_number_pair));
  it('Six-element heterogeneous tuple (mion fixture)', () => assertGetTypeErrors(JIT_SUITE.TUPLE.full_mion_tuple));
  it('Tuple with trailing optional elements', () => assertGetTypeErrors(JIT_SUITE.TUPLE.tuple_with_optional));
  it('Tuple as array element (tuple inside array dependency call)', () =>
    assertGetTypeErrors(JIT_SUITE.TUPLE.nested_tuple_in_array));
  it('Self-referential tuple via trailing optional self-ref', () => assertGetTypeErrors(JIT_SUITE.TUPLE.tuple_circular));
  it('Tuple with a function slot (must be undefined)', () => assertGetTypeErrors(JIT_SUITE.TUPLE.tuple_with_non_serializable));
  it('Tuple with a trailing rest segment', () => assertGetTypeErrors(JIT_SUITE.TUPLE.tuple_rest));
  it('Tuple with multiple trailing optional slots', () => assertGetTypeErrors(JIT_SUITE.TUPLE.tuple_multiple_trailing_optionals));
  it('Tuple with named element labels (labels erased at runtime)', () => assertGetTypeErrors(JIT_SUITE.TUPLE.tuple_named_labels));
  it('Empty tuple `[]` (only the empty array passes)', () => assertGetTypeErrors(JIT_SUITE.TUPLE.empty_tuple));
  it('Single-element tuple `[T]`', () => assertGetTypeErrors(JIT_SUITE.TUPLE.single_element_tuple));
  it('Readonly tuple (readonly [T, U])', () => assertGetTypeErrors(JIT_SUITE.TUPLE.readonly_tuple));

  it('all tuple getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.TUPLE).length);
  });
});

describe('getTypeErrors / TEMPLATE_LITERAL', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Template literal URL with a number placeholder', () => assertGetTypeErrors(JIT_SUITE.TEMPLATE_LITERAL.url_with_number_id));
  it('Template literal URL with multiple placeholders', () => assertGetTypeErrors(JIT_SUITE.TEMPLATE_LITERAL.multi_segment_url));
  it('Template literal starting with a string placeholder', () =>
    assertGetTypeErrors(JIT_SUITE.TEMPLATE_LITERAL.leading_string_placeholder));
  it('Template literal with regex metacharacters in literal segments', () =>
    assertGetTypeErrors(JIT_SUITE.TEMPLATE_LITERAL.regex_special_chars));
  it('Object with a template-literal-typed string property', () =>
    assertGetTypeErrors(JIT_SUITE.TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('Index signature whose key is a template literal pattern', () =>
    assertGetTypeErrors(JIT_SUITE.TEMPLATE_LITERAL.template_literal_index_key));
  it('Template literal with a union-of-literals placeholder', () =>
    assertGetTypeErrors(JIT_SUITE.TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.TEMPLATE_LITERAL).length);
  });
});

describe('getTypeErrors / NATIVE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Map with string keys and number values', () => assertGetTypeErrors(JIT_SUITE.NATIVE.map_string_number));
  it('Set of strings', () => assertGetTypeErrors(JIT_SUITE.NATIVE.set_string));
  it('Promise — thenable check, wrapped type not validated', () => assertGetTypeErrors(JIT_SUITE.NATIVE.promise_string));
  it('Awaited<Promise<T>> — resolves to the wrapped type', () => assertGetTypeErrors(JIT_SUITE.NATIVE.awaited_promise));

  it('all native getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.NATIVE).length);
  });
});

describe('getTypeErrors / CIRCULAR', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Self-referential object with optional self-ref and Date prop', () =>
    assertGetTypeErrors(JIT_SUITE.CIRCULAR.object_full_mion_shape));
  it('Self-referential array whose union element includes the array itself', () =>
    assertGetTypeErrors(JIT_SUITE.CIRCULAR.array_of_union_with_self_ref));
  it('Self-referential object whose cycle closes via a tuple property', () =>
    assertGetTypeErrors(JIT_SUITE.CIRCULAR.object_with_tuple_prop));
  it('Self-referential object whose cycle closes via an index signature', () =>
    assertGetTypeErrors(JIT_SUITE.CIRCULAR.object_with_index_prop));
  it('Self-referential object with the cycle buried four levels deep', () =>
    assertGetTypeErrors(JIT_SUITE.CIRCULAR.object_deeply_nested));
  it('Non-circular root holding a circular child interface', () =>
    assertGetTypeErrors(JIT_SUITE.CIRCULAR.circular_child_under_literal_root));
  it('Multiple circular types cross-referenced from a non-circular root', () =>
    assertGetTypeErrors(JIT_SUITE.CIRCULAR.multiple_circular_types_cross_referenced));

  it('all circular getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.CIRCULAR).length);
  });
});

describe('getTypeErrors / UNION', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Union of common atomic types (with Date and bigint)', () => assertGetTypeErrors(JIT_SUITE.UNION.atomic_union));
  it('Union of string literals (case-sensitive)', () => assertGetTypeErrors(JIT_SUITE.UNION.string_literal_union));
  it('Two-arm union of string and number', () => assertGetTypeErrors(JIT_SUITE.UNION.string_or_number));
  it('Union of array types (whole-array dispatch)', () => assertGetTypeErrors(JIT_SUITE.UNION.union_of_array_types));
  it('Array whose element type is a union', () => assertGetTypeErrors(JIT_SUITE.UNION.array_of_union));
  it('Union of disjoint object shapes', () => assertGetTypeErrors(JIT_SUITE.UNION.union_of_object_shapes));
  it('Discriminated union (shared kind literal, different payloads)', () =>
    assertGetTypeErrors(JIT_SUITE.UNION.discriminated_union));
  it('Union of object arms each carrying a method', () => assertGetTypeErrors(JIT_SUITE.UNION.union_with_methods));
  it('Self-referential union via object and array arms', () => assertGetTypeErrors(JIT_SUITE.UNION.circular_union));
  it('Intersection of object shapes (resolved to one merged shape)', () =>
    assertGetTypeErrors(JIT_SUITE.UNION.intersection_to_object));

  // mion union.spec.ts ports — additional arms / shapes
  it('Union where one arm carries an index signature', () => assertGetTypeErrors(JIT_SUITE.UNION.union_with_index_arm));
  it('Discriminated union sharing one prop with arm-dependent type', () =>
    assertGetTypeErrors(JIT_SUITE.UNION.union_same_prop_different_types));
  it('Union mixing array types and object shapes', () => assertGetTypeErrors(JIT_SUITE.UNION.union_mixed_arrays_and_objects));
  it('Union of shapes sharing a prop with different value types', () =>
    assertGetTypeErrors(JIT_SUITE.UNION.union_merged_property));
  it('Union mixing arrays, plain objects, and index-signature shapes', () =>
    assertGetTypeErrors(JIT_SUITE.UNION.union_mixed_with_index));
  it('Union with an `any` arm (collapses to any)', () => assertGetTypeErrors(JIT_SUITE.UNION.union_with_any_fallback));
  it('Union with an `unknown` arm (collapses to unknown)', () =>
    assertGetTypeErrors(JIT_SUITE.UNION.union_with_unknown_fallback));
  it('Union with the smaller arm declared before its superset', () =>
    assertGetTypeErrors(JIT_SUITE.UNION.union_subset_small_first));
  it('Union with a three-level subset chain', () => assertGetTypeErrors(JIT_SUITE.UNION.union_subset_nested_levels));
  it('Union mixing a subset pair with a disjoint arm', () =>
    assertGetTypeErrors(JIT_SUITE.UNION.union_subset_mixed_related_unrelated));

  it('all union getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.UNION).length);
  });
});

describe('getTypeErrors / UTILITY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Partial<T> — all props become optional', () => assertGetTypeErrors(JIT_SUITE.UTILITY.partial));
  it('Required<T> — all optional props become required', () => assertGetTypeErrors(JIT_SUITE.UTILITY.required));
  it('Pick<T, K> — keeps only the named properties', () => assertGetTypeErrors(JIT_SUITE.UTILITY.pick));
  it('Omit<T, K> — drops the named properties', () => assertGetTypeErrors(JIT_SUITE.UTILITY.omit));
  it('Exclude<U, X> on a string-literal union', () => assertGetTypeErrors(JIT_SUITE.UTILITY.exclude_atomic));
  it('Extract<U, X> on a string-literal union', () => assertGetTypeErrors(JIT_SUITE.UTILITY.extract_atomic));
  it('Exclude<U, X> on a discriminated object union', () => assertGetTypeErrors(JIT_SUITE.UTILITY.exclude_from_object_union));
  it('NonNullable<T> — strips null and undefined from a union', () => assertGetTypeErrors(JIT_SUITE.UTILITY.non_nullable));
  it('ReturnType<F> — extracts the return type of a function', () => assertGetTypeErrors(JIT_SUITE.UTILITY.return_type));
  it('Readonly<T> — readonly bit erased at runtime', () => assertGetTypeErrors(JIT_SUITE.UTILITY.readonly));
  it('Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)', () =>
    assertGetTypeErrors(JIT_SUITE.UTILITY.intersection_with_required_override));
  it('Omit<T, K> preserves optionality of remaining props', () => assertGetTypeErrors(JIT_SUITE.UTILITY.omit_keeping_optional));
  it('keyof T — resolves to a union of string-literal keys', () => assertGetTypeErrors(JIT_SUITE.UTILITY.keyof_to_literal_union));
  it('typeof variable — type query on a runtime value', () => assertGetTypeErrors(JIT_SUITE.UTILITY.typeof_variable_query));
  it('Indexed access type — Person["name"] resolves to string', () => assertGetTypeErrors(JIT_SUITE.UTILITY.indexed_access_type));
  it('Conditional type — T extends string ? boolean : number', () =>
    assertGetTypeErrors(JIT_SUITE.UTILITY.conditional_type_resolved));
  it('Custom mapped type — {[K in keyof T]: T[K] | null}', () => assertGetTypeErrors(JIT_SUITE.UTILITY.mapped_type_custom));
  it('Mapped type whose value is a conditional — per-prop shape diverges', () =>
    assertGetTypeErrors(JIT_SUITE.UTILITY.mapped_type_with_conditional_value));
  it('Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`', () =>
    assertGetTypeErrors(JIT_SUITE.UTILITY.distributive_conditional_over_union));
  it('DeepPartial<T> — recursive mapped type with nested optionality', () =>
    assertGetTypeErrors(JIT_SUITE.UTILITY.deep_partial_recursive_mapped));

  it('all utility getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.UTILITY).length);
  });
});

describe('getTypeErrors / TYPE_MAPPINGS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Key prefix via template literal — `prefix_${K}` rename', () =>
    assertGetTypeErrors(JIT_SUITE.TYPE_MAPPINGS.key_prefix_rename));
  it('Conditional key rename — swap one key, leave the rest', () =>
    assertGetTypeErrors(JIT_SUITE.TYPE_MAPPINGS.key_conditional_rename));
  it('Filter keys via `never` — drop sensitive props', () => assertGetTypeErrors(JIT_SUITE.TYPE_MAPPINGS.key_filter_via_never));

  it('all type-mappings getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.TYPE_MAPPINGS).length);
  });
});
