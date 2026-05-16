// isType adapter — runs every ValidationCase whose `isType` thunk is
// defined against the precompiled validator the Go binary emits via
// internal/caches/jitfn/istype.go.
//
// Shape mirrors mion-run-types:packages/run-types/src/jitCompilers/json/jsonSpec/01JsonAtomic.spec.ts:
// one explicit `it(...)` per case (no for-loop registration — keeps
// the failure surface readable and lets the IDE jump to each test),
// an `afterEach` counter per category, and a final coverage-guard
// test per category that fails if a new case lands in the suite
// without a matching `it()` here.
//
// To add a new case: declare it in test/suites/validation-suite.ts AND
// add a one-line `it(<key>, …)` in suite-declaration order inside the
// matching `describe(...)` block below. The per-describe counter
// surfaces the drift if you only do one. Vitest's `it.todo` does NOT
// invoke `afterEach`, so deferred cases (no thunk) naturally fall out
// of the active-count comparison.

import {afterEach, describe, expect, it} from 'vitest';
import {VALIDATION_SUITE, type ValidationCase} from '../suites/validation-suite.ts';

async function assertIsType(c: ValidationCase): Promise<void> {
  if (!c.isType) throw new Error(`case ${c.title}: missing isType thunk`);
  const {valid, invalid} = c.getSamples();

  // Static form: createIsType<T>().
  const isTypeStatic = await c.isType();
  valid.forEach((v, i) => {
    expect(isTypeStatic(v), `${c.title} [static]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isTypeStatic(v), `${c.title} [static]: invalid[${i}] should fail`).toBe(false);
  });

  // Reflect form: createIsType(value). Optional — cases that omit
  // `isTypeReflect` (typically because of a documented divergence with
  // the static form) skip the second pass.
  if (c.isTypeReflect) {
    const isTypeReflect = await c.isTypeReflect();
    valid.forEach((v, i) => {
      expect(isTypeReflect(v), `${c.title} [reflect]: valid[${i}] should pass`).toBe(true);
    });
    invalid.forEach((v, i) => {
      expect(isTypeReflect(v), `${c.title} [reflect]: invalid[${i}] should fail`).toBe(false);
    });
  }
}

describe('isType / ATOMIC', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('any', () => assertIsType(VALIDATION_SUITE.ATOMIC.any));
  it('bigint', () => assertIsType(VALIDATION_SUITE.ATOMIC.bigint));
  it('boolean', () => assertIsType(VALIDATION_SUITE.ATOMIC.boolean));
  it('Date', () => assertIsType(VALIDATION_SUITE.ATOMIC.date));
  it('enum (mixed values)', () => assertIsType(VALIDATION_SUITE.ATOMIC.enum_mixed));
  it('literal 2', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_2));
  it('literal "a"', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_a));
  it('literal /abc/i', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_regexp_simple));
  it('literal /[\'"]\\/ \\\\ \\//', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_regexp_escaped));
  it('literal true', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_true));
  it('literal 1n', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_1n));
  it('literal Symbol("hello")', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_symbol));
  it('never', () => assertIsType(VALIDATION_SUITE.ATOMIC.never));
  it('null', () => assertIsType(VALIDATION_SUITE.ATOMIC.null));
  it('number', () => assertIsType(VALIDATION_SUITE.ATOMIC.number));
  it('object', () => assertIsType(VALIDATION_SUITE.ATOMIC.object));
  it('RegExp', () => assertIsType(VALIDATION_SUITE.ATOMIC.regexp));
  it('string', () => assertIsType(VALIDATION_SUITE.ATOMIC.string));
  it('symbol', () => assertIsType(VALIDATION_SUITE.ATOMIC.symbol));
  it('undefined', () => assertIsType(VALIDATION_SUITE.ATOMIC.undefined));
  it('void', () => assertIsType(VALIDATION_SUITE.ATOMIC.void));

  // noLiterals variants — literal types degrade to their base kind.
  it('literal 2 (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_2_noLiterals));
  it('literal "a" (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_a_noLiterals));
  it('literal /abc/i (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('literal true (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_true_noLiterals));
  it('literal 1n (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_1n_noLiterals));
  it('literal Symbol("hello") (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_symbol_noLiterals));

  // Coverage guard. Mirrors 01JsonAtomic.spec.ts's final `it('all test
  // ran', …)`. Fails if the suite gains a new atomic case without a
  // matching `it(...)` line above. Using a runtime counter (not a
  // key-set comparison) means filtered runs (--testNamePattern) will
  // skip this guard alongside the filtered tests; full runs catch drift.
  it('all atomic isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.ATOMIC).length);
  });
});

describe('isType / ARRAY', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  // Active cases — element kind is supported by the Go emit.
  it('string[]', () => assertIsType(VALIDATION_SUITE.ARRAY.string_array));
  it('number[]', () => assertIsType(VALIDATION_SUITE.ARRAY.number_array));
  it('boolean[]', () => assertIsType(VALIDATION_SUITE.ARRAY.boolean_array));
  it('bigint[]', () => assertIsType(VALIDATION_SUITE.ARRAY.bigint_array));
  it('Date[]', () => assertIsType(VALIDATION_SUITE.ARRAY.date_array));
  it('RegExp[]', () => assertIsType(VALIDATION_SUITE.ARRAY.regexp_array));
  it('undefined[]', () => assertIsType(VALIDATION_SUITE.ARRAY.undefined_array));
  it('null[]', () => assertIsType(VALIDATION_SUITE.ARRAY.null_array));
  it('Array<string>', () => assertIsType(VALIDATION_SUITE.ARRAY.array_generic));
  it('string[][]', () => assertIsType(VALIDATION_SUITE.ARRAY.string_array_2d));
  it('string[][][]', () => assertIsType(VALIDATION_SUITE.ARRAY.string_array_3d));
  it('string[] (noIsArrayCheck)', () => assertIsType(VALIDATION_SUITE.ARRAY.string_array_noIsArrayCheck));

  it('{a: string}[]', () => assertIsType(VALIDATION_SUITE.ARRAY.object_array));
  it('(string | number)[]', () => assertIsType(VALIDATION_SUITE.ARRAY.union_array));
  it('[string, number][]', () => assertIsType(VALIDATION_SUITE.ARRAY.tuple_array));

  it('CircularArray = CircularArray[]', () => assertIsType(VALIDATION_SUITE.ARRAY.circular_array));
  it('ObjectType (Block 13) — recursive object with array prop', () => assertIsType(VALIDATION_SUITE.ARRAY.circular_object_with_array));
  it('symbol[] — non-serializable, always-false validator', () => assertIsType(VALIDATION_SUITE.ARRAY.symbol_array));

  it('all array isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.ARRAY).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('isType / OBJECT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  // Active cases — kinds in scope for the current Go emit.
  it('{a: string; b: number}', () => assertIsType(VALIDATION_SUITE.OBJECT.simple_interface));
  it('{readonly name: "john"; readonly age: 30} — as const', () => assertIsType(VALIDATION_SUITE.OBJECT.object_as_const_literals));
  it('{id; name} via ReturnType<typeof fn>', () => assertIsType(VALIDATION_SUITE.OBJECT.object_via_return_type_utility));
  it('{id; name} via property access', () => assertIsType(VALIDATION_SUITE.OBJECT.object_via_property_access));
  it('{id; name} via array element access', () => assertIsType(VALIDATION_SUITE.OBJECT.object_via_array_access));
  it('{a: string; b?: number}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_with_optional));
  it('{date: Date; name: string}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_with_date));
  it('{name: string; cb: () => any} — methods skipped', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_with_method));
  it('{a: string; deep: {b: string; c: number}}', () => assertIsType(VALIDATION_SUITE.OBJECT.nested_object));
  it('{tags: string[]}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_string_array_prop));
  it('ICircular self-referential', () => assertIsType(VALIDATION_SUITE.OBJECT.circular_interface));
  it('ICircularArray via array', () => assertIsType(VALIDATION_SUITE.OBJECT.circular_interface_on_array));
  it('ICircularDeep nested', () => assertIsType(VALIDATION_SUITE.OBJECT.circular_interface_on_nested_object));
  it('{[key: string]: string}', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_string));
  it('{a: string; b: number; [str|num]} index w/ union value', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_named_props));
  it('{[key: string]: {[key: string]: number}}', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_nested));
  it('{[key: string]: {[key: string]: Date}}', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_date_value));
  it('Obj2 { b; c: Obj1 } — index signature on nested object', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_non_root));
  it('() => void', () => assertIsType(VALIDATION_SUITE.OBJECT.function_top_level));

  it('Record<"a" | "b", number>', () => assertIsType(VALIDATION_SUITE.OBJECT.record_union_keys));
  it('{[key: string]: string | number}', () => assertIsType(VALIDATION_SUITE.OBJECT.union_value_index));
  it('{kind: "a" | "b"; n: number}', () => assertIsType(VALIDATION_SUITE.OBJECT.object_with_union_prop));

  it('{a?: string; b?: number}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_all_optional));

  it('CallableInterface = {(...): ret; extra: string}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_callable));

  it('class MySerializableClass with two atomic props', () => assertIsType(VALIDATION_SUITE.OBJECT.class_simple));
  it('RpcError<"test-error"> shape (local equivalent)', () => assertIsType(VALIDATION_SUITE.OBJECT.rpc_error_class));
  it('CallSignature params via Parameters<F>', () => assertIsType(VALIDATION_SUITE.OBJECT.call_signature_params));
  it('Parameters<(a, b, c?) => Date> — trailing optional', () => assertIsType(VALIDATION_SUITE.OBJECT.call_signature_params_with_optional));
  it('Parameters<(a, b, ...c: Date[]) => Date> — rest', () => assertIsType(VALIDATION_SUITE.OBJECT.call_signature_params_with_rest));

  it('all object isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.OBJECT).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('isType / TUPLE', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('[string, number]', () => assertIsType(VALIDATION_SUITE.TUPLE.string_number_pair));
  it('[Date, number, string, null, string[], bigint]', () => assertIsType(VALIDATION_SUITE.TUPLE.full_mion_tuple));
  it('[number, bigint?, boolean?, number?]', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_with_optional));
  it('[string, number][]', () => assertIsType(VALIDATION_SUITE.TUPLE.nested_tuple_in_array));

  it('TupleCircular = [..., TupleCircular?]', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_circular));
  it('[number, () => any] — function slot must be undefined', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_with_non_serializable));
  it('[number, ...string[]] — Rest tuple member', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_rest));
  it('[number, bigint?, boolean?, number?] — multiple trailing optionals', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_multiple_trailing_optionals));
  it('[name: string, age: number] — named labels', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_named_labels));

  it('all tuple isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.TUPLE).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});

describe('isType / UNION', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('Date | number | string | null | bigint', () => assertIsType(VALIDATION_SUITE.UNION.atomic_union));
  it("'UNO' | 'DOS' | 'TRES'", () => assertIsType(VALIDATION_SUITE.UNION.string_literal_union));
  it('string | number', () => assertIsType(VALIDATION_SUITE.UNION.string_or_number));
  it('string[] | number[] | boolean[]', () => assertIsType(VALIDATION_SUITE.UNION.union_of_array_types));
  it('(string | bigint | boolean | Date)[]', () => assertIsType(VALIDATION_SUITE.UNION.array_of_union));

  it('{a: string; aa: boolean} | {b: number} | {c: bigint}', () => assertIsType(VALIDATION_SUITE.UNION.union_of_object_shapes));
  it('{kind: "a"; n: number} | {kind: "b"; s: string}', () => assertIsType(VALIDATION_SUITE.UNION.discriminated_union));
  it('{name; getName()} | {age; getAge()} — methods skipped', () => assertIsType(VALIDATION_SUITE.UNION.union_with_methods));

  it('UnionC = Date|number|string|{a?:UnionC;b?:string}|UnionC[]', () => assertIsType(VALIDATION_SUITE.UNION.circular_union));
  it('{a: string} & {b: number} — resolved to ObjectLiteral', () => assertIsType(VALIDATION_SUITE.UNION.intersection_to_object));

  // mion union.spec.ts ports — additional arms / shapes
  it('{a;aa} | {b} | {c; [k]: bigint} — union with index arm', () => assertIsType(VALIDATION_SUITE.UNION.union_with_index_arm));
  it("{type:'a';prop:bool} | {type:'b';prop:num} | {type:'c';prop:str}", () => assertIsType(VALIDATION_SUITE.UNION.union_same_prop_different_types));
  it('string[] | number[] | boolean[] | {a;aa} | {b} | {c;aa:"string"}', () => assertIsType(VALIDATION_SUITE.UNION.union_mixed_arrays_and_objects));
  it('{a: boolean} | {a: number} — merged property', () => assertIsType(VALIDATION_SUITE.UNION.union_merged_property));
  it('string[] | {a;aa} | {b} | {a;[k]:str} | {[k]:bigint;b}', () => assertIsType(VALIDATION_SUITE.UNION.union_mixed_with_index));
  it('string | any — any fallback collapses union to any', () => assertIsType(VALIDATION_SUITE.UNION.union_with_any_fallback));
  it('string | unknown — unknown fallback collapses union to unknown', () => assertIsType(VALIDATION_SUITE.UNION.union_with_unknown_fallback));
  it('SmallObj | LargeObj — subset relationship', () => assertIsType(VALIDATION_SUITE.UNION.union_subset_small_first));
  it('Tiny | Medium | Large — multi-level subset', () => assertIsType(VALIDATION_SUITE.UNION.union_subset_nested_levels));
  it('Base | Extended | Unrelated — mixed subset/disjoint', () => assertIsType(VALIDATION_SUITE.UNION.union_subset_mixed_related_unrelated));

  it('all union isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.UNION).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});

// Template literal types (`\`api/user/${number}\``) project as
// KindTemplateLiteral with the literal text + placeholder spans on
// rt.Literal; the emit compiles to an anchored RegExp at JIT-build
// time and hoists it into the closure prologue as a context-item
// const, then validator-call runs `typeof v === 'string' &&
// regex.test(v)`.
describe('isType / TEMPLATE_LITERAL', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('`api/user/${number}`', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.url_with_number_id));
  it('`/api/v${number}/user/${string}/posts/${number}`', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.multi_segment_url));
  it('`${string}/${number}`', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.leading_string_placeholder));
  it('`(${number})`', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.regex_special_chars));
  it('{url: `api/user/${number}`; method: string}', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_nested_in_object));
  it('{[key: `api/${string}`]: number}', () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_index_key));
  it("`${'a' | 'b'}-${number}` (union placeholder)", () => assertIsType(VALIDATION_SUITE.TEMPLATE_LITERAL.template_literal_union_placeholder));

  it('all template-literal isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.TEMPLATE_LITERAL).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
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

  it('Map<string, number>', () => assertIsType(VALIDATION_SUITE.NATIVE.map_string_number));
  it('Set<string>', () => assertIsType(VALIDATION_SUITE.NATIVE.set_string));
  it('Promise<string> — thenable check', () => assertIsType(VALIDATION_SUITE.NATIVE.promise_string));
  it('Awaited<Promise<string>> — resolves to string', () => assertIsType(VALIDATION_SUITE.NATIVE.awaited_promise));

  it('all native isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.NATIVE).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
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

  it('Circular { n; s; c?: Circular; d?: Date }', () => assertIsType(VALIDATION_SUITE.CIRCULAR.object_full_mion_shape));
  it('CuArray = (CuArray | Date | number | string)[]', () => assertIsType(VALIDATION_SUITE.CIRCULAR.array_of_union_with_self_ref));
  it('CircularTuple { tuple: [bigint, CircularTuple?] }', () => assertIsType(VALIDATION_SUITE.CIRCULAR.object_with_tuple_prop));
  it('CircularIndex { index: { [k]: CircularIndex } }', () => assertIsType(VALIDATION_SUITE.CIRCULAR.object_with_index_prop));
  it('CircularDeep { deep1: { deep2: { deep3: { deep4?: CircularDeep } } } }', () => assertIsType(VALIDATION_SUITE.CIRCULAR.object_deeply_nested));

  it('all circular isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.CIRCULAR).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
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

  it('Partial<Person>', () => assertIsType(VALIDATION_SUITE.UTILITY.partial));
  it('Required<MaybePerson>', () => assertIsType(VALIDATION_SUITE.UTILITY.required));
  it("Pick<Person, 'name' | 'createdAt'>", () => assertIsType(VALIDATION_SUITE.UTILITY.pick));
  it("Omit<Person, 'age'>", () => assertIsType(VALIDATION_SUITE.UTILITY.omit));
  it("Exclude<'name' | 'age' | 'createdAt', 'age'>", () => assertIsType(VALIDATION_SUITE.UTILITY.exclude_atomic));
  it("Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>", () => assertIsType(VALIDATION_SUITE.UTILITY.extract_atomic));
  it("Exclude<Shape, {kind: 'circle'}>", () => assertIsType(VALIDATION_SUITE.UTILITY.exclude_from_object_union));
  it('NonNullable<string | number | null | undefined>', () => assertIsType(VALIDATION_SUITE.UTILITY.non_nullable));
  it('ReturnType<(...) => Date>', () => assertIsType(VALIDATION_SUITE.UTILITY.return_type));
  it('Readonly<Person>', () => assertIsType(VALIDATION_SUITE.UTILITY.readonly));
  // Note: Uppercase / Lowercase / Capitalize / Uncapitalize are NOT
  // covered as isType constraints — they belong in the future
  // validation-constraints library (alongside number brand types).
  // See the comment above `intersection_with_required_override` in
  // validation-suite.ts.
  it("Partial<Person> & Required<Pick<Person, 'name'>>", () => assertIsType(VALIDATION_SUITE.UTILITY.intersection_with_required_override));
  it("Omit<{a; b?; c}, 'a'> — preserves optional flag on remaining props", () => assertIsType(VALIDATION_SUITE.UTILITY.omit_keeping_optional));

  it('all utility isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.UTILITY).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});
