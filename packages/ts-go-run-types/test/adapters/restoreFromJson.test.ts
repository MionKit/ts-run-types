// restoreFromJson adapter — runs every JitCase whose `restoreFromJson`
// thunk is defined against the precompiled transformer the Go binary emits
// via internal/caches/jitfn/restorefjson.go.
//
// Same success criterion as the prepareForJson adapter — the JSON
// round-trip:
//
//   restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))
//     ≅ v   (via normalizeForComparison + toEqual)
//
// The two adapter files are siblings — both exercise BOTH halves; the
// difference is which thunk gates each it(). This file's coverage guard
// counts cases whose restoreFromJson thunk is defined; the
// prepareForJson sibling counts the other. A future phase where the
// two halves diverge (e.g. a kind needing restore but not prepare)
// would surface here as a thunk-mismatch.

import {afterEach, describe, expect, it} from 'vitest';
import {JIT_SUITE, type JitCase} from '../suites/jit-suite.ts';
import {normalizeForComparison} from '../util/equalsHelpers.ts';

const identityFn = (v: unknown) => v;

function assertRoundTrip(label: string, prepare: (v: unknown) => unknown, restore: (v: unknown) => unknown, getValid: () => unknown[]) {
  // See prepareForJson.test.ts for the why-two-fetches rationale —
  // both serializers mutate input arrays / objects in place.
  const inputs = getValid();
  const references = getValid();
  inputs.forEach((v, i) => {
    const prepared = prepare(v);
    const serialized = JSON.stringify(prepared);
    // Top-level undefined cannot be JSON-encoded — JSON.stringify
    // returns `undefined`. Skip these samples.
    if (serialized === undefined) return;
    const parsed = JSON.parse(serialized);
    const restored = restore(parsed);
    const {actual, expected} = normalizeForComparison(restored, references[i]);
    expect(actual, `${label}: valid[${i}] round-trip should deep-equal original`).toEqual(expected);
  });
}

function assertRestoreFromJson(c: JitCase): void {
  if (!c.restoreFromJson) throw new Error(`case ${c.title}: missing restoreFromJson thunk`);
  // Use getRoundTripValid when defined — see prepareForJson.test.ts for
  // rationale (narrower set for broad types like `object`).
  const getValid = c.getRoundTripValid ?? (() => c.getSamples().valid);
  const prepareStatic = c.prepareForJson?.() ?? identityFn;
  const prepareReflect = c.prepareForJsonReflect?.() ?? identityFn;
  const prepareDeserStatic = c.deserializePrepareForJson?.() ?? identityFn;
  const prepareDeserReflect = c.deserializePrepareForJsonReflect?.() ?? identityFn;

  assertRoundTrip(`${c.title} [static]`, prepareStatic, c.restoreFromJson(), getValid);

  if (c.restoreFromJsonReflect) {
    assertRoundTrip(`${c.title} [reflect]`, prepareReflect, c.restoreFromJsonReflect(), getValid);
  }

  if (c.deserializeRestoreFromJson) {
    assertRoundTrip(`${c.title} [deserialize-static]`, prepareDeserStatic, c.deserializeRestoreFromJson(), getValid);
  }

  if (c.deserializeRestoreFromJsonReflect) {
    assertRoundTrip(`${c.title} [deserialize-reflect]`, prepareDeserReflect, c.deserializeRestoreFromJsonReflect(), getValid);
  }
}

describe('restoreFromJson / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Any type — every value passes', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.any));
  it('BigInt primitive', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.bigint));
  it('Boolean primitive (strict typeof)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.boolean));
  it('Date instance (rejects Invalid Date)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.date));
  it('Enum with mixed numeric and string members', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.enum_mixed));
  it('Numeric literal type (strict equality)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_2));
  it('String literal type (case-sensitive)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_a));
  it('RegExp literal type (matched by source plus flags)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_regexp_simple));
  it('RegExp literal with regex-metacharacters in the source', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_regexp_escaped));
  it('Boolean literal type (only true)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_true));
  it('BigInt literal type (only 1n)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_1n));
  it('Symbol literal type (matched by description)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_symbol));
  it('Never — no value passes', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.never));
  it('Null primitive (distinct from undefined)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.null));
  it('Number primitive (rejects NaN and Infinity)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.number));
  it('Object type — any non-null non-primitive value', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.object));
  it('RegExp instance', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.regexp));
  it('String primitive', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.string));
  it('Symbol primitive', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.symbol));
  it('Undefined primitive (distinct from null)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.undefined));
  it('Void — accepts undefined, rejects null', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.void));
  it('Unknown type — every value passes', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.unknown));
  it('Numeric literal with noLiterals (degrades to number)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_2_noLiterals));
  it('String literal with noLiterals (degrades to string)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_a_noLiterals));
  it('RegExp literal with noLiterals (degrades to RegExp)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('Boolean literal with noLiterals (degrades to boolean)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_true_noLiterals));
  it('BigInt literal with noLiterals (degrades to bigint)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_1n_noLiterals));
  it('Symbol literal with noLiterals (degrades to symbol)', () => assertRestoreFromJson(JIT_SUITE.ATOMIC.literal_symbol_noLiterals));

  it('all atomic restoreFromJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.ATOMIC).length);
  });
});

describe('restoreFromJson / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Array of strings', () => assertRestoreFromJson(JIT_SUITE.ARRAY.string_array));
  it('Array of numbers (rejects Infinity / NaN per element)', () => assertRestoreFromJson(JIT_SUITE.ARRAY.number_array));
  it('Array of booleans', () => assertRestoreFromJson(JIT_SUITE.ARRAY.boolean_array));
  it('Array of bigints', () => assertRestoreFromJson(JIT_SUITE.ARRAY.bigint_array));
  it('Array of Dates (rejects Invalid Date per element)', () => assertRestoreFromJson(JIT_SUITE.ARRAY.date_array));
  it('Array of RegExps', () => assertRestoreFromJson(JIT_SUITE.ARRAY.regexp_array));
  it('Array of undefined values', () => assertRestoreFromJson(JIT_SUITE.ARRAY.undefined_array));
  it('Array of nulls', () => assertRestoreFromJson(JIT_SUITE.ARRAY.null_array));
  it('Generic Array<T> form (same emit as T[])', () => assertRestoreFromJson(JIT_SUITE.ARRAY.array_generic));
  it('Two-dimensional string array (multi-level dependency call)', () => assertRestoreFromJson(JIT_SUITE.ARRAY.string_array_2d));
  it('Three-dimensional string array (depth stress)', () => assertRestoreFromJson(JIT_SUITE.ARRAY.string_array_3d));
  it('Array with noIsArrayCheck (Array.isArray guard stripped)', () => assertRestoreFromJson(JIT_SUITE.ARRAY.string_array_noIsArrayCheck));
  it('Array of object literals', () => assertRestoreFromJson(JIT_SUITE.ARRAY.object_array));
  it('Array of unions (OR-chain per element)', () => assertRestoreFromJson(JIT_SUITE.ARRAY.union_array));
  it('Array of tuples', () => assertRestoreFromJson(JIT_SUITE.ARRAY.tuple_array));
  it('Self-referential array (CircularArray = CircularArray[])', () => assertRestoreFromJson(JIT_SUITE.ARRAY.circular_array));
  it('Recursive object whose cycle closes via an array property', () => assertRestoreFromJson(JIT_SUITE.ARRAY.circular_object_with_array));
  it('Array of symbols (non-serializable — always rejected)', () => assertRestoreFromJson(JIT_SUITE.ARRAY.symbol_array));
  it('Readonly array (ReadonlyArray<T> / readonly T[])', () => assertRestoreFromJson(JIT_SUITE.ARRAY.readonly_string_array));

  it('all array restoreFromJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.ARRAY).length);
  });
});

describe('restoreFromJson / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Simple interface with string and number props', () => assertRestoreFromJson(JIT_SUITE.OBJECT.simple_interface));
  it('Object pinned with `as const` (readonly literal props)', () => assertRestoreFromJson(JIT_SUITE.OBJECT.object_as_const_literals));
  it('Object inferred via ReturnType<typeof factory>', () => assertRestoreFromJson(JIT_SUITE.OBJECT.object_via_return_type_utility));
  it('Object inferred via property access on a parent shape', () => assertRestoreFromJson(JIT_SUITE.OBJECT.object_via_property_access));
  it('Object inferred via array element access', () => assertRestoreFromJson(JIT_SUITE.OBJECT.object_via_array_access));
  it('Interface with one optional property', () => assertRestoreFromJson(JIT_SUITE.OBJECT.interface_with_optional));
  it('Interface with a Date property', () => assertRestoreFromJson(JIT_SUITE.OBJECT.interface_with_date));
  it('Interface with a method (function prop skipped from check)', () => assertRestoreFromJson(JIT_SUITE.OBJECT.interface_with_method));
  it('Interface with a nested object property', () => assertRestoreFromJson(JIT_SUITE.OBJECT.nested_object));
  it('Interface with a string-array property', () => assertRestoreFromJson(JIT_SUITE.OBJECT.interface_string_array_prop));
  it('Self-referential interface (linked-list shape)', () => assertRestoreFromJson(JIT_SUITE.OBJECT.circular_interface));
  it('Self-referential interface via an array-of-self property', () => assertRestoreFromJson(JIT_SUITE.OBJECT.circular_interface_on_array));
  it('Self-referential interface buried in a nested object', () => assertRestoreFromJson(JIT_SUITE.OBJECT.circular_interface_on_nested_object));
  it('Index signature with string values', () => assertRestoreFromJson(JIT_SUITE.OBJECT.index_signature_string));
  it('Index signature combined with named properties', () => assertRestoreFromJson(JIT_SUITE.OBJECT.index_signature_named_props));
  it('Nested index signatures (number leaf values)', () => assertRestoreFromJson(JIT_SUITE.OBJECT.index_signature_nested));
  it('Nested index signatures with Date leaf values', () => assertRestoreFromJson(JIT_SUITE.OBJECT.index_signature_date_value));
  it('Index signature on a nested (non-root) object property', () => assertRestoreFromJson(JIT_SUITE.OBJECT.index_signature_non_root));
  it('Function type at top level (any function passes)', () => assertRestoreFromJson(JIT_SUITE.OBJECT.function_top_level));
  it('Record<UnionKey, V> — resolves to a fixed-property shape', () => assertRestoreFromJson(JIT_SUITE.OBJECT.record_union_keys));
  it('Index signature with a union value type', () => assertRestoreFromJson(JIT_SUITE.OBJECT.union_value_index));
  it('Object with a discriminated-union string property', () => assertRestoreFromJson(JIT_SUITE.OBJECT.object_with_union_prop));
  it('Interface that extends a parent interface', () => assertRestoreFromJson(JIT_SUITE.OBJECT.interface_inheritance));
  it('Class that extends a parent class', () => assertRestoreFromJson(JIT_SUITE.OBJECT.class_inheritance));
  it('Index signature with a number key', () => assertRestoreFromJson(JIT_SUITE.OBJECT.index_signature_number_key));
  it('Interface with every property optional (plain-object guard)', () => assertRestoreFromJson(JIT_SUITE.OBJECT.interface_all_optional));
  it('Callable interface (function plus data properties)', () => assertRestoreFromJson(JIT_SUITE.OBJECT.interface_callable));
  it('Class with two atomic props (instance or plain match)', () => assertRestoreFromJson(JIT_SUITE.OBJECT.class_simple));
  it('RpcError-shaped class with branded discriminator', () => assertRestoreFromJson(JIT_SUITE.OBJECT.rpc_error_class));
  it('Function parameters extracted via Parameters<F>', () => assertRestoreFromJson(JIT_SUITE.OBJECT.call_signature_params));
  it('Parameters<F> tuple with a trailing optional argument', () => assertRestoreFromJson(JIT_SUITE.OBJECT.call_signature_params_with_optional));
  it('Parameters<F> tuple with a trailing rest segment', () => assertRestoreFromJson(JIT_SUITE.OBJECT.call_signature_params_with_rest));

  it('all object restoreFromJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.OBJECT).length);
  });
});

describe('restoreFromJson / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Two-element tuple (string plus number)', () => assertRestoreFromJson(JIT_SUITE.TUPLE.string_number_pair));
  it('Six-element heterogeneous tuple (mion fixture)', () => assertRestoreFromJson(JIT_SUITE.TUPLE.full_mion_tuple));
  it('Tuple with trailing optional elements', () => assertRestoreFromJson(JIT_SUITE.TUPLE.tuple_with_optional));
  it('Tuple as array element (tuple inside array dependency call)', () => assertRestoreFromJson(JIT_SUITE.TUPLE.nested_tuple_in_array));
  it('Self-referential tuple via trailing optional self-ref', () => assertRestoreFromJson(JIT_SUITE.TUPLE.tuple_circular));
  it('Tuple with a function slot (must be undefined)', () => assertRestoreFromJson(JIT_SUITE.TUPLE.tuple_with_non_serializable));
  it('Tuple with a trailing rest segment', () => assertRestoreFromJson(JIT_SUITE.TUPLE.tuple_rest));
  it('Tuple with multiple trailing optional slots', () => assertRestoreFromJson(JIT_SUITE.TUPLE.tuple_multiple_trailing_optionals));
  it('Tuple with named element labels (labels erased at runtime)', () => assertRestoreFromJson(JIT_SUITE.TUPLE.tuple_named_labels));
  it('Empty tuple `[]` (only the empty array passes)', () => assertRestoreFromJson(JIT_SUITE.TUPLE.empty_tuple));
  it('Single-element tuple `[T]`', () => assertRestoreFromJson(JIT_SUITE.TUPLE.single_element_tuple));
  it('Readonly tuple (readonly [T, U])', () => assertRestoreFromJson(JIT_SUITE.TUPLE.readonly_tuple));

  it('all tuple restoreFromJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.TUPLE).length);
  });
});

describe('restoreFromJson / NATIVE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Map with string keys and number values', () => assertRestoreFromJson(JIT_SUITE.NATIVE.map_string_number));
  it('Set of strings', () => assertRestoreFromJson(JIT_SUITE.NATIVE.set_string));
  it('Promise — thenable check, wrapped type not validated', () => assertRestoreFromJson(JIT_SUITE.NATIVE.promise_string));
  it('Awaited<Promise<T>> — resolves to the wrapped type', () => assertRestoreFromJson(JIT_SUITE.NATIVE.awaited_promise));

  it('all native restoreFromJson tests ran', () => {
    expect(ranTests).toBe(Object.keys(JIT_SUITE.NATIVE).length);
  });
});
