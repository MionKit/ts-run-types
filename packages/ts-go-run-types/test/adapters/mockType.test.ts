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
import {VALIDATION_SUITE, type ValidationCase} from '../suites/validation-suite.ts';

/** Number of values to draw per case. Larger = better coverage; smaller
 *  = faster CI. 20 is enough to surface most random-pool drift bugs
 *  without bloating test runtimes. **/
const MOCK_ITERATIONS = 20;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? v.toString() : v));
  } catch {
    return String(value);
  }
}

function assertMockType(c: ValidationCase): void {
  if (!c.mockType) throw new Error(`case ${c.title}: missing mockType thunk`);

  // factoryThrows — the isType / getTypeErrors factories are
  // alwaysThrow for this kind (root-unsupported), but the mock walker
  // doesn't go through the RT cache. It still produces a value (a
  // mocked symbol, function, etc.); we just can't isType-check it
  // since the paired validator throws on construction. Run the mock
  // fn so we still verify no error escapes the generator, then bail.
  const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');

  if (expectMode === 'throw') {
    const mockFn = c.mockType();
    expect(() => mockFn(), `${c.title} [static]: mock fn should throw`).toThrow();
    if (c.mockTypeReflect) {
      const mockFnReflect = c.mockTypeReflect();
      expect(() => mockFnReflect(), `${c.title} [reflect]: mock fn should throw`).toThrow();
    }
    return;
  }

  if (expectMode !== 'skip' && !c.isType) {
    throw new Error(`case ${c.title}: mockType needs paired isType thunk to validate`);
  }

  const runPass = (mockFn: () => unknown, label: string): void => {
    // expectMode === 'skip' means we exercise the mock generator but
    // can't validate output — either because the kind has no isType
    // semantic (functions) or because the paired isType factory is
    // alwaysThrow (root symbol). Either way, skip the isType call so
    // it doesn't blow up the test.
    if (expectMode === 'skip') {
      for (let i = 0; i < MOCK_ITERATIONS; i++) mockFn();
      return;
    }
    const isValid = c.isType!();
    for (let i = 0; i < MOCK_ITERATIONS; i++) {
      const generated = mockFn();
      const ok = isValid(generated);
      if (!ok) {
        throw new Error(
          `${c.title} [${label}]: iteration ${i} — generated value did not pass isType. value=${safeStringify(generated)}`
        );
      }
    }
  };

  runPass(c.mockType(), 'static');
  if (c.mockTypeReflect) runPass(c.mockTypeReflect(), 'reflect');
}

describe('mockType / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Any type — every value passes', () => assertMockType(VALIDATION_SUITE.ATOMIC.any));
  it('BigInt primitive', () => assertMockType(VALIDATION_SUITE.ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertMockType(VALIDATION_SUITE.ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertMockType(VALIDATION_SUITE.ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertMockType(VALIDATION_SUITE.ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () =>
    assertMockType(VALIDATION_SUITE.ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertMockType(VALIDATION_SUITE.ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertMockType(VALIDATION_SUITE.ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertMockType(VALIDATION_SUITE.ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertMockType(VALIDATION_SUITE.ATOMIC.object));
  it('RegExp instance', () => assertMockType(VALIDATION_SUITE.ATOMIC.regexp));
  it('String primitive', () => assertMockType(VALIDATION_SUITE.ATOMIC.string));
  it('Symbol primitive', () => assertMockType(VALIDATION_SUITE.ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertMockType(VALIDATION_SUITE.ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertMockType(VALIDATION_SUITE.ATOMIC.void));

  it('Unknown type — every value passes', () => assertMockType(VALIDATION_SUITE.ATOMIC.unknown));

  it('Numeric literal with noLiterals (degrades to number)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () =>
    assertMockType(VALIDATION_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () =>
    assertMockType(VALIDATION_SUITE.ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertMockType(VALIDATION_SUITE.ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () =>
    assertMockType(VALIDATION_SUITE.ATOMIC.literal_symbol_noLiterals));

  // Coverage guard — mirrors isType.test.ts. Object.keys(...).length
  // catches drift when a new ATOMIC case lands in the suite without a
  // matching `it()` line above.
  it('all atomic mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.ATOMIC).length);
  });
});

describe('mockType / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Array of strings', () => assertMockType(VALIDATION_SUITE.ARRAY.string_array));
  it('Array of numbers (rejects Infinity / NaN per element)', () => assertMockType(VALIDATION_SUITE.ARRAY.number_array));
  it('Array of booleans', () => assertMockType(VALIDATION_SUITE.ARRAY.boolean_array));
  it('Array of bigints', () => assertMockType(VALIDATION_SUITE.ARRAY.bigint_array));
  it('Array of Dates (rejects Invalid Date per element)', () => assertMockType(VALIDATION_SUITE.ARRAY.date_array));
  it('Array of RegExps', () => assertMockType(VALIDATION_SUITE.ARRAY.regexp_array));
  it('Array of undefined values', () => assertMockType(VALIDATION_SUITE.ARRAY.undefined_array));
  it('Array of nulls', () => assertMockType(VALIDATION_SUITE.ARRAY.null_array));
  it('Generic Array<T> form (same emit as T[])', () => assertMockType(VALIDATION_SUITE.ARRAY.array_generic));
  it('Two-dimensional string array (multi-level dependency call)', () => assertMockType(VALIDATION_SUITE.ARRAY.string_array_2d));
  it('Three-dimensional string array (depth stress)', () => assertMockType(VALIDATION_SUITE.ARRAY.string_array_3d));
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () =>
    assertMockType(VALIDATION_SUITE.ARRAY.string_array_noIsArrayCheck));

  it('Array of object literals', () => assertMockType(VALIDATION_SUITE.ARRAY.object_array));
  it('Array of unions (OR-chain per element)', () => assertMockType(VALIDATION_SUITE.ARRAY.union_array));
  it('Array of tuples', () => assertMockType(VALIDATION_SUITE.ARRAY.tuple_array));

  it('Self-referential array (CircularArray = CircularArray[])', () => assertMockType(VALIDATION_SUITE.ARRAY.circular_array));
  it('Recursive object whose cycle closes via an array property', () =>
    assertMockType(VALIDATION_SUITE.ARRAY.circular_object_with_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertMockType(VALIDATION_SUITE.ARRAY.symbol_array));
  it('Readonly array (ReadonlyArray<T> / readonly T[])', () => assertMockType(VALIDATION_SUITE.ARRAY.readonly_string_array));

  it('all array mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.ARRAY).length);
  });
});

describe('mockType / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Simple interface with string and number props', () => assertMockType(VALIDATION_SUITE.OBJECT.simple_interface));
  it('Object pinned with `as const` (readonly literal props)', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.object_as_const_literals));
  it('Object inferred via ReturnType<typeof factory>', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.object_via_return_type_utility));
  it('Object inferred via property access on a parent shape', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.object_via_property_access));
  it('Object inferred via array element access', () => assertMockType(VALIDATION_SUITE.OBJECT.object_via_array_access));
  it('Interface with one optional property', () => assertMockType(VALIDATION_SUITE.OBJECT.interface_with_optional));
  it('Interface with a Date property', () => assertMockType(VALIDATION_SUITE.OBJECT.interface_with_date));
  it('Interface with a method (function prop skipped from check)', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.interface_with_method));
  it('Interface with a nested object property', () => assertMockType(VALIDATION_SUITE.OBJECT.nested_object));
  it('Interface with a string-array property', () => assertMockType(VALIDATION_SUITE.OBJECT.interface_string_array_prop));
  it('Self-referential interface (linked-list shape)', () => assertMockType(VALIDATION_SUITE.OBJECT.circular_interface));
  it('Self-referential interface via an array-of-self property', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.circular_interface_on_array));
  it('Self-referential interface buried in a nested object', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.circular_interface_on_nested_object));
  it('Index signature with string values', () => assertMockType(VALIDATION_SUITE.OBJECT.index_signature_string));
  it('Index signature combined with named properties', () => assertMockType(VALIDATION_SUITE.OBJECT.index_signature_named_props));
  it('Nested index signatures (number leaf values)', () => assertMockType(VALIDATION_SUITE.OBJECT.index_signature_nested));
  it('Nested index signatures with Date leaf values', () => assertMockType(VALIDATION_SUITE.OBJECT.index_signature_date_value));
  it('Index signature on a nested (non-root) object property', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.index_signature_non_root));
  it('Function type at top level (any function passes)', () => assertMockType(VALIDATION_SUITE.OBJECT.function_top_level));

  it('Record<UnionKey, V> — resolves to a fixed-property shape', () => assertMockType(VALIDATION_SUITE.OBJECT.record_union_keys));
  it('Index signature with a union value type', () => assertMockType(VALIDATION_SUITE.OBJECT.union_value_index));
  it('Object with a discriminated-union string property', () => assertMockType(VALIDATION_SUITE.OBJECT.object_with_union_prop));
  it('Interface that extends a parent interface', () => assertMockType(VALIDATION_SUITE.OBJECT.interface_inheritance));
  it('Class that extends a parent class', () => assertMockType(VALIDATION_SUITE.OBJECT.class_inheritance));
  it('Index signature with a number key', () => assertMockType(VALIDATION_SUITE.OBJECT.index_signature_number_key));

  it('Interface with every property optional (plain-object guard)', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.interface_all_optional));

  it('Callable interface (function plus data properties)', () => assertMockType(VALIDATION_SUITE.OBJECT.interface_callable));

  it('Class with two atomic props (instance or plain match)', () => assertMockType(VALIDATION_SUITE.OBJECT.class_simple));
  it('RpcError-shaped class with branded discriminator', () => assertMockType(VALIDATION_SUITE.OBJECT.rpc_error_class));
  it('Function parameters extracted via Parameters<F>', () => assertMockType(VALIDATION_SUITE.OBJECT.call_signature_params));
  it('Parameters<F> tuple with a trailing optional argument', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.call_signature_params_with_optional));
  it('Parameters<F> tuple with a trailing rest segment', () =>
    assertMockType(VALIDATION_SUITE.OBJECT.call_signature_params_with_rest));

  it('all object mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.OBJECT).length);
  });
});

describe('mockType / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Two-element tuple (string plus number)', () => assertMockType(VALIDATION_SUITE.TUPLE.string_number_pair));
  it('Six-element heterogeneous tuple (mion fixture)', () => assertMockType(VALIDATION_SUITE.TUPLE.full_mion_tuple));
  it('Tuple with trailing optional elements', () => assertMockType(VALIDATION_SUITE.TUPLE.tuple_with_optional));
  it('Tuple as array element (tuple inside array dependency call)', () =>
    assertMockType(VALIDATION_SUITE.TUPLE.nested_tuple_in_array));

  it('Self-referential tuple via trailing optional self-ref', () => assertMockType(VALIDATION_SUITE.TUPLE.tuple_circular));
  it('Tuple with a function slot (must be undefined)', () => assertMockType(VALIDATION_SUITE.TUPLE.tuple_with_non_serializable));
  it('Tuple with a trailing rest segment', () => assertMockType(VALIDATION_SUITE.TUPLE.tuple_rest));
  it('Tuple with multiple trailing optional slots', () =>
    assertMockType(VALIDATION_SUITE.TUPLE.tuple_multiple_trailing_optionals));
  it('Tuple with named element labels (labels erased at runtime)', () =>
    assertMockType(VALIDATION_SUITE.TUPLE.tuple_named_labels));
  it('Empty tuple `[]` (only the empty array passes)', () => assertMockType(VALIDATION_SUITE.TUPLE.empty_tuple));
  it('Single-element tuple `[T]`', () => assertMockType(VALIDATION_SUITE.TUPLE.single_element_tuple));
  it('Readonly tuple (readonly [T, U])', () => assertMockType(VALIDATION_SUITE.TUPLE.readonly_tuple));

  it('all tuple mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.TUPLE).length);
  });
});

describe('mockType / UNION', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Union of common atomic types (with Date and bigint)', () => assertMockType(VALIDATION_SUITE.UNION.atomic_union));
  it('Union of string literals (case-sensitive)', () => assertMockType(VALIDATION_SUITE.UNION.string_literal_union));
  it('Two-arm union of string and number', () => assertMockType(VALIDATION_SUITE.UNION.string_or_number));
  it('Union of array types (whole-array dispatch)', () => assertMockType(VALIDATION_SUITE.UNION.union_of_array_types));
  it('Array whose element type is a union', () => assertMockType(VALIDATION_SUITE.UNION.array_of_union));

  it('Union of disjoint object shapes', () => assertMockType(VALIDATION_SUITE.UNION.union_of_object_shapes));
  it('Discriminated union (shared kind literal, different payloads)', () =>
    assertMockType(VALIDATION_SUITE.UNION.discriminated_union));
  it('Union of object arms each carrying a method', () => assertMockType(VALIDATION_SUITE.UNION.union_with_methods));

  it('Self-referential union via object and array arms', () => assertMockType(VALIDATION_SUITE.UNION.circular_union));
  it('Intersection of object shapes (resolved to one merged shape)', () =>
    assertMockType(VALIDATION_SUITE.UNION.intersection_to_object));

  it('Union where one arm carries an index signature', () => assertMockType(VALIDATION_SUITE.UNION.union_with_index_arm));
  it('Discriminated union sharing one prop with arm-dependent type', () =>
    assertMockType(VALIDATION_SUITE.UNION.union_same_prop_different_types));
  it('Union mixing array types and object shapes', () => assertMockType(VALIDATION_SUITE.UNION.union_mixed_arrays_and_objects));
  it('Union of shapes sharing a prop with different value types', () =>
    assertMockType(VALIDATION_SUITE.UNION.union_merged_property));
  it('Union mixing arrays, plain objects, and index-signature shapes', () =>
    assertMockType(VALIDATION_SUITE.UNION.union_mixed_with_index));
  it('Union with an `any` arm (collapses to any)', () => assertMockType(VALIDATION_SUITE.UNION.union_with_any_fallback));
  it('Union with an `unknown` arm (collapses to unknown)', () =>
    assertMockType(VALIDATION_SUITE.UNION.union_with_unknown_fallback));
  it('Union with the smaller arm declared before its superset', () =>
    assertMockType(VALIDATION_SUITE.UNION.union_subset_small_first));
  it('Union with a three-level subset chain', () => assertMockType(VALIDATION_SUITE.UNION.union_subset_nested_levels));
  it('Union mixing a subset pair with a disjoint arm', () =>
    assertMockType(VALIDATION_SUITE.UNION.union_subset_mixed_related_unrelated));

  it('all union mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.UNION).length);
  });
});

describe('mockType / TEMPLATE_LITERAL', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Template literal URL with a number placeholder', () =>
    assertMockType(VALIDATION_SUITE.TEMPLATE_LITERAL.url_with_number_id));
  it('Template literal URL with multiple placeholders', () =>
    assertMockType(VALIDATION_SUITE.TEMPLATE_LITERAL.multi_segment_url));
  it('Template literal starting with a string placeholder', () =>
    assertMockType(VALIDATION_SUITE.TEMPLATE_LITERAL.leading_string_placeholder));
  it('Template literal with regex metacharacters in literal segments', () =>
    assertMockType(VALIDATION_SUITE.TEMPLATE_LITERAL.regex_special_chars));
  it('Object with a template-literal-typed string property', () =>
    assertMockType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('Index signature whose key is a template literal pattern', () =>
    assertMockType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_index_key));
  it('Template literal with a union-of-literals placeholder', () =>
    assertMockType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.TEMPLATE_LITERAL).length);
  });
});

describe('mockType / NATIVE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Map with string keys and number values', () => assertMockType(VALIDATION_SUITE.NATIVE.map_string_number));
  it('Set of strings', () => assertMockType(VALIDATION_SUITE.NATIVE.set_string));
  it('Promise — thenable check, wrapped type not validated', () => assertMockType(VALIDATION_SUITE.NATIVE.promise_string));
  it('Awaited<Promise<T>> — resolves to the wrapped type', () => assertMockType(VALIDATION_SUITE.NATIVE.awaited_promise));

  it('all native mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.NATIVE).length);
  });
});

describe('mockType / CIRCULAR', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Self-referential object with optional self-ref and Date prop', () =>
    assertMockType(VALIDATION_SUITE.CIRCULAR.object_full_mion_shape));
  it('Self-referential array whose union element includes the array itself', () =>
    assertMockType(VALIDATION_SUITE.CIRCULAR.array_of_union_with_self_ref));
  it('Self-referential object whose cycle closes via a tuple property', () =>
    assertMockType(VALIDATION_SUITE.CIRCULAR.object_with_tuple_prop));
  it('Self-referential object whose cycle closes via an index signature', () =>
    assertMockType(VALIDATION_SUITE.CIRCULAR.object_with_index_prop));
  it('Self-referential object with the cycle buried four levels deep', () =>
    assertMockType(VALIDATION_SUITE.CIRCULAR.object_deeply_nested));
  it('Non-circular root holding a circular child interface', () =>
    assertMockType(VALIDATION_SUITE.CIRCULAR.circular_child_under_literal_root));
  it('Multiple circular types cross-referenced from a non-circular root', () =>
    assertMockType(VALIDATION_SUITE.CIRCULAR.multiple_circular_types_cross_referenced));

  it('all circular mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.CIRCULAR).length);
  });
});

describe('mockType / UTILITY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Partial<T> — all props become optional', () => assertMockType(VALIDATION_SUITE.UTILITY.partial));
  it('Required<T> — all optional props become required', () => assertMockType(VALIDATION_SUITE.UTILITY.required));
  it('Pick<T, K> — keeps only the named properties', () => assertMockType(VALIDATION_SUITE.UTILITY.pick));
  it('Omit<T, K> — drops the named properties', () => assertMockType(VALIDATION_SUITE.UTILITY.omit));
  it('Exclude<U, X> on a string-literal union', () => assertMockType(VALIDATION_SUITE.UTILITY.exclude_atomic));
  it('Extract<U, X> on a string-literal union', () => assertMockType(VALIDATION_SUITE.UTILITY.extract_atomic));
  it('Exclude<U, X> on a discriminated object union', () => assertMockType(VALIDATION_SUITE.UTILITY.exclude_from_object_union));
  it('NonNullable<T> — strips null and undefined from a union', () => assertMockType(VALIDATION_SUITE.UTILITY.non_nullable));
  it('ReturnType<F> — extracts the return type of a function', () => assertMockType(VALIDATION_SUITE.UTILITY.return_type));
  it('Readonly<T> — readonly bit erased at runtime', () => assertMockType(VALIDATION_SUITE.UTILITY.readonly));
  it('Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)', () =>
    assertMockType(VALIDATION_SUITE.UTILITY.intersection_with_required_override));
  it('Omit<T, K> preserves optionality of remaining props', () => assertMockType(VALIDATION_SUITE.UTILITY.omit_keeping_optional));
  it('keyof T — resolves to a union of string-literal keys', () =>
    assertMockType(VALIDATION_SUITE.UTILITY.keyof_to_literal_union));
  it('typeof variable — type query on a runtime value', () => assertMockType(VALIDATION_SUITE.UTILITY.typeof_variable_query));
  it('Indexed access type — Person["name"] resolves to string', () =>
    assertMockType(VALIDATION_SUITE.UTILITY.indexed_access_type));
  it('Conditional type — T extends string ? boolean : number', () =>
    assertMockType(VALIDATION_SUITE.UTILITY.conditional_type_resolved));
  it('Custom mapped type — {[K in keyof T]: T[K] | null}', () => assertMockType(VALIDATION_SUITE.UTILITY.mapped_type_custom));
  it('Mapped type whose value is a conditional — per-prop shape diverges', () =>
    assertMockType(VALIDATION_SUITE.UTILITY.mapped_type_with_conditional_value));
  it('Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`', () =>
    assertMockType(VALIDATION_SUITE.UTILITY.distributive_conditional_over_union));
  it('DeepPartial<T> — recursive mapped type with nested optionality', () =>
    assertMockType(VALIDATION_SUITE.UTILITY.deep_partial_recursive_mapped));

  it('all utility mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.UTILITY).length);
  });
});

describe('mockType / TYPE_MAPPINGS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Key prefix via template literal — `prefix_${K}` rename', () =>
    assertMockType(VALIDATION_SUITE.TYPE_MAPPINGS.key_prefix_rename));
  it('Conditional key rename — swap one key, leave the rest', () =>
    assertMockType(VALIDATION_SUITE.TYPE_MAPPINGS.key_conditional_rename));
  it('Filter keys via `never` — drop sensitive props', () => assertMockType(VALIDATION_SUITE.TYPE_MAPPINGS.key_filter_via_never));

  it('all type-mappings mockType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.TYPE_MAPPINGS).length);
  });
});
