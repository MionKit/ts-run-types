// getTypeErrors adapter — runs every ValidationCase whose `getTypeErrors`
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
import {VALIDATION_SUITE, type ValidationCase} from '../suites/validation-suite.ts';

function assertGetTypeErrors(c: ValidationCase): void {
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

  it('Any type — every value passes', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.any));
  it('BigInt primitive', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.object));
  it('RegExp instance', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.regexp));
  it('String primitive', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.string));
  it('Symbol primitive', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.void));

  // noLiterals variants — literal types degrade to their base kind.
  it('Numeric literal with noLiterals (degrades to number)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () => assertGetTypeErrors(VALIDATION_SUITE.ATOMIC.literal_symbol_noLiterals));

  it('all atomic getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.ATOMIC).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('getTypeErrors / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Array of strings', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.string_array));
  it('Array of numbers (rejects Infinity / NaN per element)', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.number_array));
  it('Array of booleans', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.boolean_array));
  it('Array of bigints', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.bigint_array));
  it('Array of Dates (rejects Invalid Date per element)', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.date_array));
  it('Array of RegExps', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.regexp_array));
  it('Array of undefined values', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.undefined_array));
  it('Array of nulls', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.null_array));
  it('Generic Array<T> form (same emit as T[])', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.array_generic));
  it('Two-dimensional string array (multi-level dependency call)', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.string_array_2d));
  it('Three-dimensional string array (depth stress)', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.string_array_3d));
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.string_array_noIsArrayCheck));
  it('Self-referential array (CircularArray = CircularArray[])', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.circular_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.symbol_array));
  it('Array of object literals', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.object_array));
  it('Recursive object whose cycle closes via an array property', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.circular_object_with_array));
  it('Array of tuples', () => assertGetTypeErrors(VALIDATION_SUITE.ARRAY.tuple_array));

  it('all array getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.ARRAY).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('getTypeErrors / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Simple interface with string and number props', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.simple_interface));
  it('Object pinned with `as const` (readonly literal props)', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.object_as_const_literals));
  it('Object inferred via ReturnType<typeof factory>', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.object_via_return_type_utility));
  it('Object inferred via property access on a parent shape', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.object_via_property_access));
  it('Object inferred via array element access', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.object_via_array_access));
  it('Interface with one optional property', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.interface_with_optional));
  it('Interface with a Date property', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.interface_with_date));
  it('Interface with a method (function prop skipped from check)', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.interface_with_method));
  it('Interface with a nested object property', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.nested_object));
  it('Interface with a string-array property', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.interface_string_array_prop));
  it('Self-referential interface (linked-list shape)', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.circular_interface));
  it('Self-referential interface via an array-of-self property', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.circular_interface_on_array));
  it('Self-referential interface buried in a nested object', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.circular_interface_on_nested_object));
  it('Index signature with string values', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.index_signature_string));
  it('Nested index signatures (number leaf values)', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.index_signature_nested));
  it('Nested index signatures with Date leaf values', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.index_signature_date_value));
  it('Index signature on a nested (non-root) object property', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.index_signature_non_root));
  it('Function type at top level (any function passes)', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.function_top_level));
  it('Class with two atomic props (instance or plain match)', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.class_simple));
  it('Function parameters extracted via Parameters<F>', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.call_signature_params));
  it('Parameters<F> tuple with a trailing optional argument', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.call_signature_params_with_optional));
  it('Parameters<F> tuple with a trailing rest segment', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.call_signature_params_with_rest));
  it('Record<UnionKey, V> — resolves to a fixed-property shape', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.record_union_keys));
  it('Index signature with a union value type', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.union_value_index));
  it('Object with a discriminated-union string property', () => assertGetTypeErrors(VALIDATION_SUITE.OBJECT.object_with_union_prop));

  it('all object getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.OBJECT).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('getTypeErrors / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Two-element tuple (string plus number)', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.string_number_pair));
  it('Six-element heterogeneous tuple (mion fixture)', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.full_mion_tuple));
  it('Tuple with trailing optional elements', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.tuple_with_optional));
  it('Tuple as array element (tuple inside array dependency call)', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.nested_tuple_in_array));
  it('Self-referential tuple via trailing optional self-ref', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.tuple_circular));
  it('Tuple with a function slot (must be undefined)', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.tuple_with_non_serializable));
  it('Tuple with a trailing rest segment', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.tuple_rest));
  it('Tuple with multiple trailing optional slots', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.tuple_multiple_trailing_optionals));
  it('Tuple with named element labels (labels erased at runtime)', () => assertGetTypeErrors(VALIDATION_SUITE.TUPLE.tuple_named_labels));

  it('all tuple getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.TUPLE).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('getTypeErrors / TEMPLATE_LITERAL', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Template literal URL with a number placeholder', () => assertGetTypeErrors(VALIDATION_SUITE.TEMPLATE_LITERAL.url_with_number_id));
  it('Template literal URL with multiple placeholders', () => assertGetTypeErrors(VALIDATION_SUITE.TEMPLATE_LITERAL.multi_segment_url));
  it('Template literal starting with a string placeholder', () => assertGetTypeErrors(VALIDATION_SUITE.TEMPLATE_LITERAL.leading_string_placeholder));
  it('Template literal with regex metacharacters in literal segments', () => assertGetTypeErrors(VALIDATION_SUITE.TEMPLATE_LITERAL.regex_special_chars));
  it('Object with a template-literal-typed string property', () => assertGetTypeErrors(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('Index signature whose key is a template literal pattern', () => assertGetTypeErrors(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_index_key));
  it('Template literal with a union-of-literals placeholder', () => assertGetTypeErrors(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.TEMPLATE_LITERAL).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('getTypeErrors / NATIVE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Map with string keys and number values', () => assertGetTypeErrors(VALIDATION_SUITE.NATIVE.map_string_number));
  it('Set of strings', () => assertGetTypeErrors(VALIDATION_SUITE.NATIVE.set_string));
  it('Promise — thenable check, wrapped type not validated', () => assertGetTypeErrors(VALIDATION_SUITE.NATIVE.promise_string));
  it('Awaited<Promise<T>> — resolves to the wrapped type', () => assertGetTypeErrors(VALIDATION_SUITE.NATIVE.awaited_promise));

  it('all native getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.NATIVE).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('getTypeErrors / CIRCULAR', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Self-referential object with optional self-ref and Date prop', () => assertGetTypeErrors(VALIDATION_SUITE.CIRCULAR.object_full_mion_shape));

  it('all circular getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.CIRCULAR).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('getTypeErrors / UNION', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Union of common atomic types (with Date and bigint)', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.atomic_union));
  it('Union of string literals (case-sensitive)', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.string_literal_union));
  it('Two-arm union of string and number', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.string_or_number));
  it('Union of array types (whole-array dispatch)', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.union_of_array_types));
  it('Array whose element type is a union', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.array_of_union));
  it('Union of disjoint object shapes', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.union_of_object_shapes));
  it('Discriminated union (shared kind literal, different payloads)', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.discriminated_union));
  it('Union of object arms each carrying a method', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.union_with_methods));
  it('Self-referential union via object and array arms', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.circular_union));
  it('Intersection of object shapes (resolved to one merged shape)', () => assertGetTypeErrors(VALIDATION_SUITE.UNION.intersection_to_object));

  it('all union getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.UNION).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('getTypeErrors / UTILITY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Exclude<U, X> on a string-literal union', () => assertGetTypeErrors(VALIDATION_SUITE.UTILITY.exclude_atomic));
  it('Extract<U, X> on a string-literal union', () => assertGetTypeErrors(VALIDATION_SUITE.UTILITY.extract_atomic));
  it('NonNullable<T> — strips null and undefined from a union', () => assertGetTypeErrors(VALIDATION_SUITE.UTILITY.non_nullable));
  it('ReturnType<F> — extracts the return type of a function', () => assertGetTypeErrors(VALIDATION_SUITE.UTILITY.return_type));

  it('all utility getTypeErrors tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.UTILITY).filter((c) => c.getTypeErrors).length;
    expect(ranTests).toBe(activeCount);
  });
});
