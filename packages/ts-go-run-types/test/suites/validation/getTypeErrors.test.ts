// getTypeErrors adapter — runs every ValidationCase whose `getTypeErrors`
// thunk is defined against the precompiled validator the Go binary emits
// via internal/compiled/typefns/typeerrors.go.
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
import {assertGetTypeErrors} from '../../util/validationAsserts.ts';

describe('getTypeErrors / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Any type — every value passes', () => assertGetTypeErrors(ATOMIC.any));
  it('BigInt primitive', () => assertGetTypeErrors(ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertGetTypeErrors(ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertGetTypeErrors(ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertGetTypeErrors(ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertGetTypeErrors(ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertGetTypeErrors(ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertGetTypeErrors(ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () => assertGetTypeErrors(ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertGetTypeErrors(ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertGetTypeErrors(ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertGetTypeErrors(ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertGetTypeErrors(ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertGetTypeErrors(ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertGetTypeErrors(ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertGetTypeErrors(ATOMIC.object));
  it('RegExp instance', () => assertGetTypeErrors(ATOMIC.regexp));
  it('String primitive', () => assertGetTypeErrors(ATOMIC.string));
  it('Symbol primitive', () => assertGetTypeErrors(ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertGetTypeErrors(ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertGetTypeErrors(ATOMIC.void));

  it('Unknown type — every value passes', () => assertGetTypeErrors(ATOMIC.unknown));

  // noLiterals variants — literal types degrade to their base kind.
  it('Numeric literal with noLiterals (degrades to number)', () => assertGetTypeErrors(ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertGetTypeErrors(ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () => assertGetTypeErrors(ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () => assertGetTypeErrors(ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertGetTypeErrors(ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () => assertGetTypeErrors(ATOMIC.literal_symbol_noLiterals));

  // Strict count — fails if the suite gains a new case without a
  // matching `it(...)` above. Every case in this section must have
  // a getTypeErrors thunk; the suite ships with full parity to
  // isType, so the `Object.keys().length` count is the right gate.
  it('all atomic getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(ATOMIC).length);
  });
});

describe('getTypeErrors / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Array of strings', () => assertGetTypeErrors(ARRAY.string_array));
  it('Array of numbers (rejects Infinity / NaN per element)', () => assertGetTypeErrors(ARRAY.number_array));
  it('Array of booleans', () => assertGetTypeErrors(ARRAY.boolean_array));
  it('Array of bigints', () => assertGetTypeErrors(ARRAY.bigint_array));
  it('Array of Dates (rejects Invalid Date per element)', () => assertGetTypeErrors(ARRAY.date_array));
  it('Array of RegExps', () => assertGetTypeErrors(ARRAY.regexp_array));
  it('Array of undefined values', () => assertGetTypeErrors(ARRAY.undefined_array));
  it('Array of nulls', () => assertGetTypeErrors(ARRAY.null_array));
  it('Generic Array<T> form (same emit as T[])', () => assertGetTypeErrors(ARRAY.array_generic));
  it('Two-dimensional string array (multi-level dependency call)', () => assertGetTypeErrors(ARRAY.string_array_2d));
  it('Three-dimensional string array (depth stress)', () => assertGetTypeErrors(ARRAY.string_array_3d));
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () => assertGetTypeErrors(ARRAY.string_array_noIsArrayCheck));
  it('Self-referential array (CircularArray = CircularArray[])', () => assertGetTypeErrors(ARRAY.circular_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertGetTypeErrors(ARRAY.symbol_array));
  it('Array of unions (OR-chain per element)', () => assertGetTypeErrors(ARRAY.union_array));
  it('Array of object literals', () => assertGetTypeErrors(ARRAY.object_array));
  it('Recursive object whose cycle closes via an array property', () => assertGetTypeErrors(ARRAY.circular_object_with_array));
  it('Array of tuples', () => assertGetTypeErrors(ARRAY.tuple_array));
  it('Readonly array (ReadonlyArray<T> / readonly T[])', () => assertGetTypeErrors(ARRAY.readonly_string_array));

  it('all array getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(ARRAY).length);
  });
});

describe('getTypeErrors / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Simple interface with string and number props', () => assertGetTypeErrors(OBJECT.simple_interface));
  it('Object pinned with `as const` (readonly literal props)', () => assertGetTypeErrors(OBJECT.object_as_const_literals));
  it('Object inferred via ReturnType<typeof factory>', () => assertGetTypeErrors(OBJECT.object_via_return_type_utility));
  it('Object inferred via property access on a parent shape', () => assertGetTypeErrors(OBJECT.object_via_property_access));
  it('Object inferred via array element access', () => assertGetTypeErrors(OBJECT.object_via_array_access));
  it('Interface with one optional property', () => assertGetTypeErrors(OBJECT.interface_with_optional));
  it('Interface with a Date property', () => assertGetTypeErrors(OBJECT.interface_with_date));
  it('Interface with a method (function prop skipped from check)', () => assertGetTypeErrors(OBJECT.interface_with_method));
  it('Interface with a nested object property', () => assertGetTypeErrors(OBJECT.nested_object));
  it('Interface with a string-array property', () => assertGetTypeErrors(OBJECT.interface_string_array_prop));
  it('Self-referential interface (linked-list shape)', () => assertGetTypeErrors(OBJECT.circular_interface));
  it('Self-referential interface via an array-of-self property', () => assertGetTypeErrors(OBJECT.circular_interface_on_array));
  it('Self-referential interface buried in a nested object', () =>
    assertGetTypeErrors(OBJECT.circular_interface_on_nested_object));
  it('Index signature with string values', () => assertGetTypeErrors(OBJECT.index_signature_string));
  it('Index signature combined with named properties', () => assertGetTypeErrors(OBJECT.index_signature_named_props));
  it('Nested index signatures (number leaf values)', () => assertGetTypeErrors(OBJECT.index_signature_nested));
  it('Nested index signatures with Date leaf values', () => assertGetTypeErrors(OBJECT.index_signature_date_value));
  it('Index signature on a nested (non-root) object property', () => assertGetTypeErrors(OBJECT.index_signature_non_root));
  it('Function type at top level (any function passes)', () => assertGetTypeErrors(OBJECT.function_top_level));
  it('Interface with every property optional (plain-object guard)', () => assertGetTypeErrors(OBJECT.interface_all_optional));
  it('Callable interface (function plus data properties)', () => assertGetTypeErrors(OBJECT.interface_callable));
  it('Class with two atomic props (instance or plain match)', () => assertGetTypeErrors(OBJECT.class_simple));
  it('RpcError-shaped class with branded discriminator', () => assertGetTypeErrors(OBJECT.rpc_error_class));
  it('Function parameters extracted via Parameters<F>', () => assertGetTypeErrors(OBJECT.call_signature_params));
  it('Parameters<F> tuple with a trailing optional argument', () =>
    assertGetTypeErrors(OBJECT.call_signature_params_with_optional));
  it('Parameters<F> tuple with a trailing rest segment', () => assertGetTypeErrors(OBJECT.call_signature_params_with_rest));
  it('Record<UnionKey, V> — resolves to a fixed-property shape', () => assertGetTypeErrors(OBJECT.record_union_keys));
  it('Index signature with a union value type', () => assertGetTypeErrors(OBJECT.union_value_index));
  it('Object with a discriminated-union string property', () => assertGetTypeErrors(OBJECT.object_with_union_prop));
  it('Interface that extends a parent interface', () => assertGetTypeErrors(OBJECT.interface_inheritance));
  it('Class that extends a parent class', () => assertGetTypeErrors(OBJECT.class_inheritance));
  it('Index signature with a number key', () => assertGetTypeErrors(OBJECT.index_signature_number_key));

  it('all object getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(OBJECT).length);
  });
});

describe('getTypeErrors / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Two-element tuple (string plus number)', () => assertGetTypeErrors(TUPLE.string_number_pair));
  it('Six-element heterogeneous tuple (mion fixture)', () => assertGetTypeErrors(TUPLE.full_mion_tuple));
  it('Tuple with trailing optional elements', () => assertGetTypeErrors(TUPLE.tuple_with_optional));
  it('Tuple as array element (tuple inside array dependency call)', () => assertGetTypeErrors(TUPLE.nested_tuple_in_array));
  it('Self-referential tuple via trailing optional self-ref', () => assertGetTypeErrors(TUPLE.tuple_circular));
  it('Tuple with a function slot (must be undefined)', () => assertGetTypeErrors(TUPLE.tuple_with_non_serializable));
  it('Tuple with a trailing rest segment', () => assertGetTypeErrors(TUPLE.tuple_rest));
  it('Tuple with multiple trailing optional slots', () => assertGetTypeErrors(TUPLE.tuple_multiple_trailing_optionals));
  it('Tuple with named element labels (labels erased at runtime)', () => assertGetTypeErrors(TUPLE.tuple_named_labels));
  it('Empty tuple `[]` (only the empty array passes)', () => assertGetTypeErrors(TUPLE.empty_tuple));
  it('Single-element tuple `[T]`', () => assertGetTypeErrors(TUPLE.single_element_tuple));
  it('Readonly tuple (readonly [T, U])', () => assertGetTypeErrors(TUPLE.readonly_tuple));

  it('all tuple getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(TUPLE).length);
  });
});

describe('getTypeErrors / TEMPLATE_LITERAL', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Template literal URL with a number placeholder', () => assertGetTypeErrors(TEMPLATE_LITERAL.url_with_number_id));
  it('Template literal URL with multiple placeholders', () => assertGetTypeErrors(TEMPLATE_LITERAL.multi_segment_url));
  it('Template literal starting with a string placeholder', () =>
    assertGetTypeErrors(TEMPLATE_LITERAL.leading_string_placeholder));
  it('Template literal with regex metacharacters in literal segments', () =>
    assertGetTypeErrors(TEMPLATE_LITERAL.regex_special_chars));
  it('Object with a template-literal-typed string property', () =>
    assertGetTypeErrors(TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('Index signature whose key is a template literal pattern', () =>
    assertGetTypeErrors(TEMPLATE_LITERAL.template_literal_index_key));
  it('Template literal with a union-of-literals placeholder', () =>
    assertGetTypeErrors(TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(TEMPLATE_LITERAL).length);
  });
});

describe('getTypeErrors / NATIVE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Map with string keys and number values', () => assertGetTypeErrors(NATIVE.map_string_number));
  it('Set of strings', () => assertGetTypeErrors(NATIVE.set_string));
  it('Promise — thenable check, wrapped type not validated', () => assertGetTypeErrors(NATIVE.promise_string));
  it('Awaited<Promise<T>> — resolves to the wrapped type', () => assertGetTypeErrors(NATIVE.awaited_promise));

  it('all native getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(NATIVE).length);
  });
});

describe('getTypeErrors / CIRCULAR', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Self-referential object with optional self-ref and Date prop', () => assertGetTypeErrors(CIRCULAR.object_full_mion_shape));
  it('Self-referential array whose union element includes the array itself', () =>
    assertGetTypeErrors(CIRCULAR.array_of_union_with_self_ref));
  it('Self-referential object whose cycle closes via a tuple property', () =>
    assertGetTypeErrors(CIRCULAR.object_with_tuple_prop));
  it('Self-referential object whose cycle closes via an index signature', () =>
    assertGetTypeErrors(CIRCULAR.object_with_index_prop));
  it('Self-referential object with the cycle buried four levels deep', () => assertGetTypeErrors(CIRCULAR.object_deeply_nested));
  it('Non-circular root holding a circular child interface', () =>
    assertGetTypeErrors(CIRCULAR.circular_child_under_literal_root));
  it('Multiple circular types cross-referenced from a non-circular root', () =>
    assertGetTypeErrors(CIRCULAR.multiple_circular_types_cross_referenced));

  it('all circular getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(CIRCULAR).length);
  });
});

describe('getTypeErrors / UNION', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Union of common atomic types (with Date and bigint)', () => assertGetTypeErrors(UNION.atomic_union));
  it('Union of string literals (case-sensitive)', () => assertGetTypeErrors(UNION.string_literal_union));
  it('Two-arm union of string and number', () => assertGetTypeErrors(UNION.string_or_number));
  it('Union of array types (whole-array dispatch)', () => assertGetTypeErrors(UNION.union_of_array_types));
  it('Array whose element type is a union', () => assertGetTypeErrors(UNION.array_of_union));
  it('Union of disjoint object shapes', () => assertGetTypeErrors(UNION.union_of_object_shapes));
  it('Discriminated union (shared kind literal, different payloads)', () => assertGetTypeErrors(UNION.discriminated_union));
  it('Union of object arms each carrying a method', () => assertGetTypeErrors(UNION.union_with_methods));
  it('Self-referential union via object and array arms', () => assertGetTypeErrors(UNION.circular_union));
  it('Intersection of object shapes (resolved to one merged shape)', () => assertGetTypeErrors(UNION.intersection_to_object));

  // mion union.spec.ts ports — additional arms / shapes
  it('Union where one arm carries an index signature', () => assertGetTypeErrors(UNION.union_with_index_arm));
  it('Discriminated union sharing one prop with arm-dependent type', () =>
    assertGetTypeErrors(UNION.union_same_prop_different_types));
  it('Union mixing array types and object shapes', () => assertGetTypeErrors(UNION.union_mixed_arrays_and_objects));
  it('Union of shapes sharing a prop with different value types', () => assertGetTypeErrors(UNION.union_merged_property));
  it('Union mixing arrays, plain objects, and index-signature shapes', () => assertGetTypeErrors(UNION.union_mixed_with_index));
  it('Union with an `any` arm (collapses to any)', () => assertGetTypeErrors(UNION.union_with_any_fallback));
  it('Union with an `unknown` arm (collapses to unknown)', () => assertGetTypeErrors(UNION.union_with_unknown_fallback));
  it('Union with the smaller arm declared before its superset', () => assertGetTypeErrors(UNION.union_subset_small_first));
  it('Union with a three-level subset chain', () => assertGetTypeErrors(UNION.union_subset_nested_levels));
  it('Union mixing a subset pair with a disjoint arm', () => assertGetTypeErrors(UNION.union_subset_mixed_related_unrelated));

  it('all union getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(UNION).length);
  });
});

describe('getTypeErrors / UTILITY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Partial<T> — all props become optional', () => assertGetTypeErrors(UTILITY.partial));
  it('Required<T> — all optional props become required', () => assertGetTypeErrors(UTILITY.required));
  it('Pick<T, K> — keeps only the named properties', () => assertGetTypeErrors(UTILITY.pick));
  it('Omit<T, K> — drops the named properties', () => assertGetTypeErrors(UTILITY.omit));
  it('Exclude<U, X> on a string-literal union', () => assertGetTypeErrors(UTILITY.exclude_atomic));
  it('Extract<U, X> on a string-literal union', () => assertGetTypeErrors(UTILITY.extract_atomic));
  it('Exclude<U, X> on a discriminated object union', () => assertGetTypeErrors(UTILITY.exclude_from_object_union));
  it('NonNullable<T> — strips null and undefined from a union', () => assertGetTypeErrors(UTILITY.non_nullable));
  it('ReturnType<F> — extracts the return type of a function', () => assertGetTypeErrors(UTILITY.return_type));
  it('Readonly<T> — readonly bit erased at runtime', () => assertGetTypeErrors(UTILITY.readonly));
  it('Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)', () =>
    assertGetTypeErrors(UTILITY.intersection_with_required_override));
  it('Omit<T, K> preserves optionality of remaining props', () => assertGetTypeErrors(UTILITY.omit_keeping_optional));
  it('keyof T — resolves to a union of string-literal keys', () => assertGetTypeErrors(UTILITY.keyof_to_literal_union));
  it('typeof variable — type query on a runtime value', () => assertGetTypeErrors(UTILITY.typeof_variable_query));
  it('Indexed access type — Person["name"] resolves to string', () => assertGetTypeErrors(UTILITY.indexed_access_type));
  it('Conditional type — T extends string ? boolean : number', () => assertGetTypeErrors(UTILITY.conditional_type_resolved));
  it('Custom mapped type — {[K in keyof T]: T[K] | null}', () => assertGetTypeErrors(UTILITY.mapped_type_custom));
  it('Mapped type whose value is a conditional — per-prop shape diverges', () =>
    assertGetTypeErrors(UTILITY.mapped_type_with_conditional_value));
  it('Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`', () =>
    assertGetTypeErrors(UTILITY.distributive_conditional_over_union));
  it('DeepPartial<T> — recursive mapped type with nested optionality', () =>
    assertGetTypeErrors(UTILITY.deep_partial_recursive_mapped));

  it('all utility getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(UTILITY).length);
  });
});

describe('getTypeErrors / TYPE_MAPPINGS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Key prefix via template literal — `prefix_${K}` rename', () => assertGetTypeErrors(TYPE_MAPPINGS.key_prefix_rename));
  it('Conditional key rename — swap one key, leave the rest', () => assertGetTypeErrors(TYPE_MAPPINGS.key_conditional_rename));
  it('Filter keys via `never` — drop sensitive props', () => assertGetTypeErrors(TYPE_MAPPINGS.key_filter_via_never));

  it('all type-mappings getTypeErrors tests ran', () => {
    expect(ranTests).toBe(Object.keys(TYPE_MAPPINGS).length);
  });
});
