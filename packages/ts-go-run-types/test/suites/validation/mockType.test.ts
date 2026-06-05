// mockType adapter — drives every ValidationCase whose `mockType`
// thunk is defined against the runtime mock walker
// (packages/ts-go-run-types/src/mocking/mockType.ts). For each case the
// adapter:
//
//   1. resolves the case-paired `isType` validator
//   2. invokes the mock generator MOCK_ITERATIONS times
//   3. asserts every generated value passes `isType<T>()`
//
// Special-case discriminator:
//   - `mockTypeExpect: 'throw'` — the mock fn must throw (e.g. `never`)
//   - `mockTypeExpect: 'skip'`  — the mock runs but its output is NOT
//                                  isType-checked (e.g. function kinds
//                                  where mion returns `undefined`)
//   - default (no `mockTypeExpect` field) — every value must pass isType
//
// Phased rollout: each phase wires up a new describe block. Phase 1
// covers only ATOMIC. Later phases (array / object / tuple / function /
// native / union / circular / utility / type-mappings) add the
// remaining describe blocks as the walker grows.

import {afterEach, describe, expect, it} from 'vitest';
import {ATOMIC} from './Atomic.ts';
import {ARRAY} from './Array.ts';
import {OBJECT} from './Object.ts';
import {TUPLE} from './Tuple.ts';
import {UNION} from './Union.ts';
import {TEMPLATE_LITERAL} from './TemplateLiteral.ts';
import {NATIVE} from './Native.ts';
import {CIRCULAR} from './Circular.ts';
import {UTILITY} from './Utility.ts';
import {TYPE_MAPPINGS} from './TypeMappings.ts';
import {assertMockType} from '../../util/validationAsserts.ts';

describe('mockType / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Any type — every value passes', () => assertMockType(ATOMIC.any));
  it('BigInt primitive', () => assertMockType(ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertMockType(ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertMockType(ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertMockType(ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertMockType(ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertMockType(ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertMockType(ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () => assertMockType(ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertMockType(ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertMockType(ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertMockType(ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertMockType(ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertMockType(ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertMockType(ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertMockType(ATOMIC.object));
  it('RegExp instance', () => assertMockType(ATOMIC.regexp));
  it('String primitive', () => assertMockType(ATOMIC.string));
  it('Symbol primitive', () => assertMockType(ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertMockType(ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertMockType(ATOMIC.void));

  it('Unknown type — every value passes', () => assertMockType(ATOMIC.unknown));

  it('Numeric literal with noLiterals (degrades to number)', () => assertMockType(ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertMockType(ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () => assertMockType(ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () => assertMockType(ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertMockType(ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () => assertMockType(ATOMIC.literal_symbol_noLiterals));

  // Coverage guard — mirrors isType.test.ts. Object.keys(...).length
  // catches drift when a new ATOMIC case lands in the suite without a
  // matching `it()` line above.
  it('all atomic mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(ATOMIC).length);
  });
});

describe('mockType / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Array of strings', () => assertMockType(ARRAY.string_array));
  it('Array of numbers (rejects Infinity / NaN per element)', () => assertMockType(ARRAY.number_array));
  it('Array of booleans', () => assertMockType(ARRAY.boolean_array));
  it('Array of bigints', () => assertMockType(ARRAY.bigint_array));
  it('Array of Dates (rejects Invalid Date per element)', () => assertMockType(ARRAY.date_array));
  it('Array of RegExps', () => assertMockType(ARRAY.regexp_array));
  it('Array of undefined values', () => assertMockType(ARRAY.undefined_array));
  it('Array of nulls', () => assertMockType(ARRAY.null_array));
  it('Generic Array<T> form (same emit as T[])', () => assertMockType(ARRAY.array_generic));
  it('Two-dimensional string array (multi-level dependency call)', () => assertMockType(ARRAY.string_array_2d));
  it('Three-dimensional string array (depth stress)', () => assertMockType(ARRAY.string_array_3d));
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () => assertMockType(ARRAY.string_array_noIsArrayCheck));

  it('Array of object literals', () => assertMockType(ARRAY.object_array));
  it('Array of unions (OR-chain per element)', () => assertMockType(ARRAY.union_array));
  it('Array of tuples', () => assertMockType(ARRAY.tuple_array));

  it('Self-referential array (CircularArray = CircularArray[])', () => assertMockType(ARRAY.circular_array));
  it('Recursive object whose cycle closes via an array property', () => assertMockType(ARRAY.circular_object_with_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertMockType(ARRAY.symbol_array));
  it('Readonly array (ReadonlyArray<T> / readonly T[])', () => assertMockType(ARRAY.readonly_string_array));

  it('all array mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(ARRAY).length);
  });
});

describe('mockType / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Simple interface with string and number props', () => assertMockType(OBJECT.simple_interface));
  it('Object pinned with `as const` (readonly literal props)', () => assertMockType(OBJECT.object_as_const_literals));
  it('Object inferred via ReturnType<typeof factory>', () => assertMockType(OBJECT.object_via_return_type_utility));
  it('Object inferred via property access on a parent shape', () => assertMockType(OBJECT.object_via_property_access));
  it('Object inferred via array element access', () => assertMockType(OBJECT.object_via_array_access));
  it('Interface with one optional property', () => assertMockType(OBJECT.interface_with_optional));
  it('Interface with a Date property', () => assertMockType(OBJECT.interface_with_date));
  it('Interface with a method (function prop skipped from check)', () => assertMockType(OBJECT.interface_with_method));
  it('Interface with a nested object property', () => assertMockType(OBJECT.nested_object));
  it('Interface with a string-array property', () => assertMockType(OBJECT.interface_string_array_prop));
  it('Self-referential interface (linked-list shape)', () => assertMockType(OBJECT.circular_interface));
  it('Self-referential interface via an array-of-self property', () => assertMockType(OBJECT.circular_interface_on_array));
  it('Self-referential interface buried in a nested object', () => assertMockType(OBJECT.circular_interface_on_nested_object));
  it('Index signature with string values', () => assertMockType(OBJECT.index_signature_string));
  it('Index signature combined with named properties', () => assertMockType(OBJECT.index_signature_named_props));
  it('Nested index signatures (number leaf values)', () => assertMockType(OBJECT.index_signature_nested));
  it('Nested index signatures with Date leaf values', () => assertMockType(OBJECT.index_signature_date_value));
  it('Index signature on a nested (non-root) object property', () => assertMockType(OBJECT.index_signature_non_root));
  it('Function type at top level (any function passes)', () => assertMockType(OBJECT.function_top_level));

  it('Record<UnionKey, V> — resolves to a fixed-property shape', () => assertMockType(OBJECT.record_union_keys));
  it('Index signature with a union value type', () => assertMockType(OBJECT.union_value_index));
  it('Object with a discriminated-union string property', () => assertMockType(OBJECT.object_with_union_prop));
  it('Interface that extends a parent interface', () => assertMockType(OBJECT.interface_inheritance));
  it('Class that extends a parent class', () => assertMockType(OBJECT.class_inheritance));
  it('Index signature with a number key', () => assertMockType(OBJECT.index_signature_number_key));

  it('Interface with every property optional (plain-object guard)', () => assertMockType(OBJECT.interface_all_optional));

  it('Callable interface (function plus data properties)', () => assertMockType(OBJECT.interface_callable));

  it('Class with two atomic props (instance or plain match)', () => assertMockType(OBJECT.class_simple));
  it('RpcError-shaped class with branded discriminator', () => assertMockType(OBJECT.rpc_error_class));
  it('Function parameters extracted via Parameters<F>', () => assertMockType(OBJECT.call_signature_params));
  it('Parameters<F> tuple with a trailing optional argument', () => assertMockType(OBJECT.call_signature_params_with_optional));
  it('Parameters<F> tuple with a trailing rest segment', () => assertMockType(OBJECT.call_signature_params_with_rest));

  it('all object mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(OBJECT).length);
  });
});

describe('mockType / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Two-element tuple (string plus number)', () => assertMockType(TUPLE.string_number_pair));
  it('Six-element heterogeneous tuple (mion fixture)', () => assertMockType(TUPLE.full_mion_tuple));
  it('Tuple with trailing optional elements', () => assertMockType(TUPLE.tuple_with_optional));
  it('Tuple as array element (tuple inside array dependency call)', () => assertMockType(TUPLE.nested_tuple_in_array));

  it('Self-referential tuple via trailing optional self-ref', () => assertMockType(TUPLE.tuple_circular));
  it('Tuple with a function slot (must be undefined)', () => assertMockType(TUPLE.tuple_with_non_serializable));
  it('Tuple with a trailing rest segment', () => assertMockType(TUPLE.tuple_rest));
  it('Tuple with multiple trailing optional slots', () => assertMockType(TUPLE.tuple_multiple_trailing_optionals));
  it('Tuple with named element labels (labels erased at runtime)', () => assertMockType(TUPLE.tuple_named_labels));
  it('Empty tuple `[]` (only the empty array passes)', () => assertMockType(TUPLE.empty_tuple));
  it('Single-element tuple `[T]`', () => assertMockType(TUPLE.single_element_tuple));
  it('Readonly tuple (readonly [T, U])', () => assertMockType(TUPLE.readonly_tuple));

  it('all tuple mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(TUPLE).length);
  });
});

describe('mockType / UNION', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Union of common atomic types (with Date and bigint)', () => assertMockType(UNION.atomic_union));
  it('Union of string literals (case-sensitive)', () => assertMockType(UNION.string_literal_union));
  it('Two-arm union of string and number', () => assertMockType(UNION.string_or_number));
  it('Union of array types (whole-array dispatch)', () => assertMockType(UNION.union_of_array_types));
  it('Array whose element type is a union', () => assertMockType(UNION.array_of_union));

  it('Union of disjoint object shapes', () => assertMockType(UNION.union_of_object_shapes));
  it('Discriminated union (shared kind literal, different payloads)', () => assertMockType(UNION.discriminated_union));
  it('Union of object arms each carrying a method', () => assertMockType(UNION.union_with_methods));

  it('Self-referential union via object and array arms', () => assertMockType(UNION.circular_union));
  it('Intersection of object shapes (resolved to one merged shape)', () => assertMockType(UNION.intersection_to_object));

  it('Union where one arm carries an index signature', () => assertMockType(UNION.union_with_index_arm));
  it('Discriminated union sharing one prop with arm-dependent type', () => assertMockType(UNION.union_same_prop_different_types));
  it('Union mixing array types and object shapes', () => assertMockType(UNION.union_mixed_arrays_and_objects));
  it('Union of shapes sharing a prop with different value types', () => assertMockType(UNION.union_merged_property));
  it('Union mixing arrays, plain objects, and index-signature shapes', () => assertMockType(UNION.union_mixed_with_index));
  it('Union with an `any` arm (collapses to any)', () => assertMockType(UNION.union_with_any_fallback));
  it('Union with an `unknown` arm (collapses to unknown)', () => assertMockType(UNION.union_with_unknown_fallback));
  it('Union with the smaller arm declared before its superset', () => assertMockType(UNION.union_subset_small_first));
  it('Union with a three-level subset chain', () => assertMockType(UNION.union_subset_nested_levels));
  it('Union mixing a subset pair with a disjoint arm', () => assertMockType(UNION.union_subset_mixed_related_unrelated));

  it('all union mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(UNION).length);
  });
});

describe('mockType / TEMPLATE_LITERAL', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Template literal URL with a number placeholder', () => assertMockType(TEMPLATE_LITERAL.url_with_number_id));
  it('Template literal URL with multiple placeholders', () => assertMockType(TEMPLATE_LITERAL.multi_segment_url));
  it('Template literal starting with a string placeholder', () => assertMockType(TEMPLATE_LITERAL.leading_string_placeholder));
  it('Template literal with regex metacharacters in literal segments', () =>
    assertMockType(TEMPLATE_LITERAL.regex_special_chars));
  it('Object with a template-literal-typed string property', () =>
    assertMockType(TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('Index signature whose key is a template literal pattern', () =>
    assertMockType(TEMPLATE_LITERAL.template_literal_index_key));
  it('Template literal with a union-of-literals placeholder', () =>
    assertMockType(TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(TEMPLATE_LITERAL).length);
  });
});

describe('mockType / NATIVE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Map with string keys and number values', () => assertMockType(NATIVE.map_string_number));
  it('Set of strings', () => assertMockType(NATIVE.set_string));
  it('Promise — thenable check, wrapped type not validated', () => assertMockType(NATIVE.promise_string));
  it('Awaited<Promise<T>> — resolves to the wrapped type', () => assertMockType(NATIVE.awaited_promise));

  it('all native mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(NATIVE).length);
  });
});

describe('mockType / CIRCULAR', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Self-referential object with optional self-ref and Date prop', () => assertMockType(CIRCULAR.object_full_mion_shape));
  it('Self-referential array whose union element includes the array itself', () =>
    assertMockType(CIRCULAR.array_of_union_with_self_ref));
  it('Self-referential object whose cycle closes via a tuple property', () => assertMockType(CIRCULAR.object_with_tuple_prop));
  it('Self-referential object whose cycle closes via an index signature', () => assertMockType(CIRCULAR.object_with_index_prop));
  it('Self-referential object with the cycle buried four levels deep', () => assertMockType(CIRCULAR.object_deeply_nested));
  it('Non-circular root holding a circular child interface', () => assertMockType(CIRCULAR.circular_child_under_literal_root));
  it('Multiple circular types cross-referenced from a non-circular root', () =>
    assertMockType(CIRCULAR.multiple_circular_types_cross_referenced));

  it('all circular mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(CIRCULAR).length);
  });
});

describe('mockType / UTILITY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Partial<T> — all props become optional', () => assertMockType(UTILITY.partial));
  it('Required<T> — all optional props become required', () => assertMockType(UTILITY.required));
  it('Pick<T, K> — keeps only the named properties', () => assertMockType(UTILITY.pick));
  it('Omit<T, K> — drops the named properties', () => assertMockType(UTILITY.omit));
  it('Exclude<U, X> on a string-literal union', () => assertMockType(UTILITY.exclude_atomic));
  it('Extract<U, X> on a string-literal union', () => assertMockType(UTILITY.extract_atomic));
  it('Exclude<U, X> on a discriminated object union', () => assertMockType(UTILITY.exclude_from_object_union));
  it('NonNullable<T> — strips null and undefined from a union', () => assertMockType(UTILITY.non_nullable));
  it('ReturnType<F> — extracts the return type of a function', () => assertMockType(UTILITY.return_type));
  it('Readonly<T> — readonly bit erased at runtime', () => assertMockType(UTILITY.readonly));
  it('Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)', () =>
    assertMockType(UTILITY.intersection_with_required_override));
  it('Omit<T, K> preserves optionality of remaining props', () => assertMockType(UTILITY.omit_keeping_optional));
  it('keyof T — resolves to a union of string-literal keys', () => assertMockType(UTILITY.keyof_to_literal_union));
  it('typeof variable — type query on a runtime value', () => assertMockType(UTILITY.typeof_variable_query));
  it('Indexed access type — Person["name"] resolves to string', () => assertMockType(UTILITY.indexed_access_type));
  it('Conditional type — T extends string ? boolean : number', () => assertMockType(UTILITY.conditional_type_resolved));
  it('Custom mapped type — {[K in keyof T]: T[K] | null}', () => assertMockType(UTILITY.mapped_type_custom));
  it('Mapped type whose value is a conditional — per-prop shape diverges', () =>
    assertMockType(UTILITY.mapped_type_with_conditional_value));
  it('Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`', () =>
    assertMockType(UTILITY.distributive_conditional_over_union));
  it('DeepPartial<T> — recursive mapped type with nested optionality', () =>
    assertMockType(UTILITY.deep_partial_recursive_mapped));

  it('all utility mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(UTILITY).length);
  });
});

describe('mockType / TYPE_MAPPINGS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Key prefix via template literal — `prefix_${K}` rename', () => assertMockType(TYPE_MAPPINGS.key_prefix_rename));
  it('Conditional key rename — swap one key, leave the rest', () => assertMockType(TYPE_MAPPINGS.key_conditional_rename));
  it('Filter keys via `never` — drop sensitive props', () => assertMockType(TYPE_MAPPINGS.key_filter_via_never));

  it('all type-mappings mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(TYPE_MAPPINGS).length);
  });
});
