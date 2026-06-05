// isType adapter — runs every ValidationCase whose `isType` thunk is
// defined against the precompiled validator the Go binary emits via
// internal/compiled/typefns/istype.go.
//
// Shape mirrors mion-run-types:packages/run-types/src/rtCompilers/json/jsonSpec/01JsonAtomic.spec.ts:
// one explicit `it(...)` per case (no for-loop registration — keeps
// the failure surface readable and lets the IDE jump to each test),
// an `afterEach` counter per category, and a final coverage-guard
// test per category that fails if a new case lands in the suite
// without a matching `it()` here.
//
// To add a new case: declare it in the matching group file under test/suites/validation/ AND
// add a one-line `it(<title>, …)` in suite-declaration order inside
// the matching `describe(...)` block below. The per-describe counter
// surfaces the drift if you only do one. Vitest's `it.todo` does NOT
// invoke `afterEach`, so deferred cases (no thunk) naturally fall out
// of the active-count comparison.
//
// The `it()` descriptor mirrors each case's `title` field — intent-first
// labels keyed off the case name, not the type signature.

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
import {assertIsType} from '../../util/validationAsserts.ts';

describe('isType / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Any type — every value passes', () => assertIsType(ATOMIC.any));
  it('BigInt primitive', () => assertIsType(ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertIsType(ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertIsType(ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertIsType(ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertIsType(ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertIsType(ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertIsType(ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () => assertIsType(ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertIsType(ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertIsType(ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertIsType(ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertIsType(ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertIsType(ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertIsType(ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertIsType(ATOMIC.object));
  it('RegExp instance', () => assertIsType(ATOMIC.regexp));
  it('String primitive', () => assertIsType(ATOMIC.string));
  it('Symbol primitive', () => assertIsType(ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertIsType(ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertIsType(ATOMIC.void));

  it('Unknown type — every value passes', () => assertIsType(ATOMIC.unknown));

  // noLiterals variants — literal types degrade to their base kind.
  it('Numeric literal with noLiterals (degrades to number)', () => assertIsType(ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertIsType(ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () => assertIsType(ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () => assertIsType(ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertIsType(ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () => assertIsType(ATOMIC.literal_symbol_noLiterals));

  // Coverage guard. Mirrors 01JsonAtomic.spec.ts's final `it('all test
  // ran', …)`. Fails if the suite gains a new atomic case without a
  // matching `it(...)` line above. Using a runtime counter (not a
  // key-set comparison) means filtered runs (--testNamePattern) will
  // skip this guard alongside the filtered tests; full runs catch drift.
  it('all atomic isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(ATOMIC).length);
  });
});

describe('isType / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Array of strings', () => assertIsType(ARRAY.string_array));
  it('Array of numbers (rejects Infinity / NaN per element)', () => assertIsType(ARRAY.number_array));
  it('Array of booleans', () => assertIsType(ARRAY.boolean_array));
  it('Array of bigints', () => assertIsType(ARRAY.bigint_array));
  it('Array of Dates (rejects Invalid Date per element)', () => assertIsType(ARRAY.date_array));
  it('Array of RegExps', () => assertIsType(ARRAY.regexp_array));
  it('Array of undefined values', () => assertIsType(ARRAY.undefined_array));
  it('Array of nulls', () => assertIsType(ARRAY.null_array));
  it('Generic Array<T> form (same emit as T[])', () => assertIsType(ARRAY.array_generic));
  it('Two-dimensional string array (multi-level dependency call)', () => assertIsType(ARRAY.string_array_2d));
  it('Three-dimensional string array (depth stress)', () => assertIsType(ARRAY.string_array_3d));
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () => assertIsType(ARRAY.string_array_noIsArrayCheck));

  it('Array of object literals', () => assertIsType(ARRAY.object_array));
  it('Array of unions (OR-chain per element)', () => assertIsType(ARRAY.union_array));
  it('Array of tuples', () => assertIsType(ARRAY.tuple_array));

  it('Self-referential array (CircularArray = CircularArray[])', () => assertIsType(ARRAY.circular_array));
  it('Recursive object whose cycle closes via an array property', () => assertIsType(ARRAY.circular_object_with_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertIsType(ARRAY.symbol_array));
  it('Readonly array (ReadonlyArray<T> / readonly T[])', () => assertIsType(ARRAY.readonly_string_array));

  it('all array isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(ARRAY).length);
  });
});

describe('isType / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Simple interface with string and number props', () => assertIsType(OBJECT.simple_interface));
  it('Object pinned with `as const` (readonly literal props)', () => assertIsType(OBJECT.object_as_const_literals));
  it('Object inferred via ReturnType<typeof factory>', () => assertIsType(OBJECT.object_via_return_type_utility));
  it('Object inferred via property access on a parent shape', () => assertIsType(OBJECT.object_via_property_access));
  it('Object inferred via array element access', () => assertIsType(OBJECT.object_via_array_access));
  it('Interface with one optional property', () => assertIsType(OBJECT.interface_with_optional));
  it('Interface with a Date property', () => assertIsType(OBJECT.interface_with_date));
  it('Interface with a method (function prop skipped from check)', () => assertIsType(OBJECT.interface_with_method));
  it('Interface with a nested object property', () => assertIsType(OBJECT.nested_object));
  it('Interface with a string-array property', () => assertIsType(OBJECT.interface_string_array_prop));
  it('Self-referential interface (linked-list shape)', () => assertIsType(OBJECT.circular_interface));
  it('Self-referential interface via an array-of-self property', () => assertIsType(OBJECT.circular_interface_on_array));
  it('Self-referential interface buried in a nested object', () => assertIsType(OBJECT.circular_interface_on_nested_object));
  it('Index signature with string values', () => assertIsType(OBJECT.index_signature_string));
  it('Index signature combined with named properties', () => assertIsType(OBJECT.index_signature_named_props));
  it('Nested index signatures (number leaf values)', () => assertIsType(OBJECT.index_signature_nested));
  it('Nested index signatures with Date leaf values', () => assertIsType(OBJECT.index_signature_date_value));
  it('Index signature on a nested (non-root) object property', () => assertIsType(OBJECT.index_signature_non_root));
  it('Function type at top level (any function passes)', () => assertIsType(OBJECT.function_top_level));

  it('Record<UnionKey, V> — resolves to a fixed-property shape', () => assertIsType(OBJECT.record_union_keys));
  it('Index signature with a union value type', () => assertIsType(OBJECT.union_value_index));
  it('Object with a discriminated-union string property', () => assertIsType(OBJECT.object_with_union_prop));
  it('Interface that extends a parent interface', () => assertIsType(OBJECT.interface_inheritance));
  it('Class that extends a parent class', () => assertIsType(OBJECT.class_inheritance));
  it('Index signature with a number key', () => assertIsType(OBJECT.index_signature_number_key));

  it('Interface with every property optional (plain-object guard)', () => assertIsType(OBJECT.interface_all_optional));

  it('Callable interface (function plus data properties)', () => assertIsType(OBJECT.interface_callable));

  it('Class with two atomic props (instance or plain match)', () => assertIsType(OBJECT.class_simple));
  it('RpcError-shaped class with branded discriminator', () => assertIsType(OBJECT.rpc_error_class));
  it('Function parameters extracted via Parameters<F>', () => assertIsType(OBJECT.call_signature_params));
  it('Parameters<F> tuple with a trailing optional argument', () => assertIsType(OBJECT.call_signature_params_with_optional));
  it('Parameters<F> tuple with a trailing rest segment', () => assertIsType(OBJECT.call_signature_params_with_rest));

  it('all object isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(OBJECT).length);
  });
});

describe('isType / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Two-element tuple (string plus number)', () => assertIsType(TUPLE.string_number_pair));
  it('Six-element heterogeneous tuple (mion fixture)', () => assertIsType(TUPLE.full_mion_tuple));
  it('Tuple with trailing optional elements', () => assertIsType(TUPLE.tuple_with_optional));
  it('Tuple as array element (tuple inside array dependency call)', () => assertIsType(TUPLE.nested_tuple_in_array));

  it('Self-referential tuple via trailing optional self-ref', () => assertIsType(TUPLE.tuple_circular));
  it('Tuple with a function slot (must be undefined)', () => assertIsType(TUPLE.tuple_with_non_serializable));
  it('Tuple with a trailing rest segment', () => assertIsType(TUPLE.tuple_rest));
  it('Tuple with multiple trailing optional slots', () => assertIsType(TUPLE.tuple_multiple_trailing_optionals));
  it('Tuple with named element labels (labels erased at runtime)', () => assertIsType(TUPLE.tuple_named_labels));
  it('Empty tuple `[]` (only the empty array passes)', () => assertIsType(TUPLE.empty_tuple));
  it('Single-element tuple `[T]`', () => assertIsType(TUPLE.single_element_tuple));
  it('Readonly tuple (readonly [T, U])', () => assertIsType(TUPLE.readonly_tuple));

  it('all tuple isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(TUPLE).length);
  });
});

describe('isType / UNION', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Union of common atomic types (with Date and bigint)', () => assertIsType(UNION.atomic_union));
  it('Union of string literals (case-sensitive)', () => assertIsType(UNION.string_literal_union));
  it('Two-arm union of string and number', () => assertIsType(UNION.string_or_number));
  it('Union of array types (whole-array dispatch)', () => assertIsType(UNION.union_of_array_types));
  it('Array whose element type is a union', () => assertIsType(UNION.array_of_union));

  it('Union of disjoint object shapes', () => assertIsType(UNION.union_of_object_shapes));
  it('Discriminated union (shared kind literal, different payloads)', () => assertIsType(UNION.discriminated_union));
  it('Union of object arms each carrying a method', () => assertIsType(UNION.union_with_methods));

  it('Self-referential union via object and array arms', () => assertIsType(UNION.circular_union));
  it('Intersection of object shapes (resolved to one merged shape)', () => assertIsType(UNION.intersection_to_object));

  // mion union.spec.ts ports — additional arms / shapes
  it('Union where one arm carries an index signature', () => assertIsType(UNION.union_with_index_arm));
  it('Discriminated union sharing one prop with arm-dependent type', () => assertIsType(UNION.union_same_prop_different_types));
  it('Union mixing array types and object shapes', () => assertIsType(UNION.union_mixed_arrays_and_objects));
  it('Union of shapes sharing a prop with different value types', () => assertIsType(UNION.union_merged_property));
  it('Union mixing arrays, plain objects, and index-signature shapes', () => assertIsType(UNION.union_mixed_with_index));
  it('Union with an `any` arm (collapses to any)', () => assertIsType(UNION.union_with_any_fallback));
  it('Union with an `unknown` arm (collapses to unknown)', () => assertIsType(UNION.union_with_unknown_fallback));
  it('Union with the smaller arm declared before its superset', () => assertIsType(UNION.union_subset_small_first));
  it('Union with a three-level subset chain', () => assertIsType(UNION.union_subset_nested_levels));
  it('Union mixing a subset pair with a disjoint arm', () => assertIsType(UNION.union_subset_mixed_related_unrelated));

  it('all union isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(UNION).length);
  });
});

// Template literal types (`\`api/user/${number}\``) project as
// KindTemplateLiteral with the literal text + placeholder spans on
// rt.Literal; the emit compiles to an anchored RegExp at RT-build
// time and hoists it into the closure prologue as a context-item
// const, then validator-call runs `typeof v === 'string' &&
// regex.test(v)`.
describe('isType / TEMPLATE_LITERAL', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Template literal URL with a number placeholder', () => assertIsType(TEMPLATE_LITERAL.url_with_number_id));
  it('Template literal URL with multiple placeholders', () => assertIsType(TEMPLATE_LITERAL.multi_segment_url));
  it('Template literal starting with a string placeholder', () => assertIsType(TEMPLATE_LITERAL.leading_string_placeholder));
  it('Template literal with regex metacharacters in literal segments', () => assertIsType(TEMPLATE_LITERAL.regex_special_chars));
  it('Object with a template-literal-typed string property', () =>
    assertIsType(TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('Index signature whose key is a template literal pattern', () => assertIsType(TEMPLATE_LITERAL.template_literal_index_key));
  it('Template literal with a union-of-literals placeholder', () =>
    assertIsType(TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(TEMPLATE_LITERAL).length);
  });
});

// NATIVE — runtime container types (Map, Set, Promise + Awaited<Promise<T>>
// as a regression check that TypeScript's built-in utility resolves
// cleanly through our cache). Date / RegExp / Error are native too but
// project as atomic kinds and live in the ATOMIC describe above.
describe('isType / NATIVE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Map with string keys and number values', () => assertIsType(NATIVE.map_string_number));
  it('Set of strings', () => assertIsType(NATIVE.set_string));
  it('Promise — thenable check, wrapped type not validated', () => assertIsType(NATIVE.promise_string));
  it('Awaited<Promise<T>> — resolves to the wrapped type', () => assertIsType(NATIVE.awaited_promise));

  it('all native isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(NATIVE).length);
  });
});

// CIRCULAR — self-referential and mutually-recursive type shapes ported
// from mion's nodes/collection/circularRefs.spec.ts. Other sections
// already carry the simpler circular cases; this block holds the
// variants where the cycle closes through a tuple-typed property, an
// index signature, or a deeply nested anonymous-object chain.
describe('isType / CIRCULAR', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Self-referential object with optional self-ref and Date prop', () => assertIsType(CIRCULAR.object_full_mion_shape));
  it('Self-referential array whose union element includes the array itself', () =>
    assertIsType(CIRCULAR.array_of_union_with_self_ref));
  it('Self-referential object whose cycle closes via a tuple property', () => assertIsType(CIRCULAR.object_with_tuple_prop));
  it('Self-referential object whose cycle closes via an index signature', () => assertIsType(CIRCULAR.object_with_index_prop));
  it('Self-referential object with the cycle buried four levels deep', () => assertIsType(CIRCULAR.object_deeply_nested));
  it('Non-circular root holding a circular child interface', () => assertIsType(CIRCULAR.circular_child_under_literal_root));
  it('Multiple circular types cross-referenced from a non-circular root', () =>
    assertIsType(CIRCULAR.multiple_circular_types_cross_referenced));

  it('all circular isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(CIRCULAR).length);
  });
});

// UTILITY — TypeScript utility types (Partial / Required / Pick / Omit /
// Exclude / Extract / NonNullable / ReturnType / Readonly), plus
// intersection-with-modifier examples that flip a property's optionality.
// tsgo resolves every utility at the type-checker layer to its concrete
// shape, so this exercises no new emit code — pure regression coverage
// that the utilities thread through our cache + emit pipeline.
describe('isType / UTILITY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Partial<T> — all props become optional', () => assertIsType(UTILITY.partial));
  it('Required<T> — all optional props become required', () => assertIsType(UTILITY.required));
  it('Pick<T, K> — keeps only the named properties', () => assertIsType(UTILITY.pick));
  it('Omit<T, K> — drops the named properties', () => assertIsType(UTILITY.omit));
  it('Exclude<U, X> on a string-literal union', () => assertIsType(UTILITY.exclude_atomic));
  it('Extract<U, X> on a string-literal union', () => assertIsType(UTILITY.extract_atomic));
  it('Exclude<U, X> on a discriminated object union', () => assertIsType(UTILITY.exclude_from_object_union));
  it('NonNullable<T> — strips null and undefined from a union', () => assertIsType(UTILITY.non_nullable));
  it('ReturnType<F> — extracts the return type of a function', () => assertIsType(UTILITY.return_type));
  it('Readonly<T> — readonly bit erased at runtime', () => assertIsType(UTILITY.readonly));
  // Note: Uppercase / Lowercase / Capitalize / Uncapitalize are NOT
  // covered as isType constraints — they belong in the future
  // validation-constraints library (alongside number brand types).
  // See the comment above `intersection_with_required_override` in
  // validation/Utility.ts.
  it('Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)', () =>
    assertIsType(UTILITY.intersection_with_required_override));
  it('Omit<T, K> preserves optionality of remaining props', () => assertIsType(UTILITY.omit_keeping_optional));
  it('keyof T — resolves to a union of string-literal keys', () => assertIsType(UTILITY.keyof_to_literal_union));
  it('typeof variable — type query on a runtime value', () => assertIsType(UTILITY.typeof_variable_query));
  it('Indexed access type — Person["name"] resolves to string', () => assertIsType(UTILITY.indexed_access_type));
  it('Conditional type — T extends string ? boolean : number', () => assertIsType(UTILITY.conditional_type_resolved));
  it('Custom mapped type — {[K in keyof T]: T[K] | null}', () => assertIsType(UTILITY.mapped_type_custom));
  it('Mapped type whose value is a conditional — per-prop shape diverges', () =>
    assertIsType(UTILITY.mapped_type_with_conditional_value));
  it('Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`', () =>
    assertIsType(UTILITY.distributive_conditional_over_union));
  it('DeepPartial<T> — recursive mapped type with nested optionality', () => assertIsType(UTILITY.deep_partial_recursive_mapped));

  it('all utility isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(UTILITY).length);
  });
});

describe('isType / TYPE_MAPPINGS', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Key prefix via template literal — `prefix_${K}` rename', () => assertIsType(TYPE_MAPPINGS.key_prefix_rename));
  it('Conditional key rename — swap one key, leave the rest', () => assertIsType(TYPE_MAPPINGS.key_conditional_rename));
  it('Filter keys via `never` — drop sensitive props', () => assertIsType(TYPE_MAPPINGS.key_filter_via_never));

  it('all type-mappings isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(TYPE_MAPPINGS).length);
  });
});
