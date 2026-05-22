// Shared validation suite for atomic types — the single source of
// truth for every behavioral assertion ported from mion's
// packages/run-types/src/nodes/atomic/*.spec.ts on the mion-run-types
// branch.
//
// Shape per case:
//   - `title`         human label used in test reports
//   - `description?`  optional note pinning a bug-flavor behaviour
//   - `isType?`       thunk wrapping `createIsType<T>()` — the
//                     vite-plugin-runtypes plugin rewrites this call
//                     site at build time, injecting the runtype hash.
//                     Omit a thunk to opt a case out of the isType
//                     adapter (future per-API thunks: getTypeErrors,
//                     prepareForJson, mock, …).
//   - `getSamples`    pure data: valid + invalid arrays. Same samples
//                     drive every adapter — and a future docs renderer
//                     can consume them without spinning up a validator.
//
// Cases are organized by ReflectionFamily (currently just ATOMIC).
// Literal types live under sibling keys (`literal_2`, `literal_a`, …)
// since each literal flavour is a distinct case per mion's
// literal.spec.ts.
//
// noLiterals option variants are deferred until createIsType accepts
// options end-to-end (see plan file → step 2). They will land as
// parallel keys (`literal_2_noLiterals`, …) consuming the same
// samples shape.

import {createIsType, type IsTypeFn} from '@mionjs/ts-go-run-types';

/** One atomic-type case in the shared suite. */
export interface ValidationCase {
  title: string;
  description?: string;
  /** Plugin-rewritten thunk returning the isType validator. */
  isType?: () => Promise<IsTypeFn>;
  /** Pure sample data — same for every adapter. */
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
}

// Module-scope declarations referenced by case thunks AND by sample
// arrays — these must share scope so `typeof sym` in the type
// position resolves to the same runtime value used in samples.

enum Color {
  Red, // numeric: 0
  Green = 'green',
  Blue = 2,
}

const sym = Symbol('hello');
const reg = /abc/i;
const reg2 = /['"]\/ \\ \//;
function vd(): void {}

export const VALIDATION_SUITE = {
  ATOMIC: {
    any: {
      title: 'any',
      isType: () => createIsType<any>(),
      getSamples: () => ({
        valid: [null, undefined, 42, 'hello'],
        invalid: [],
      }),
    },

    bigint: {
      title: 'bigint',
      description: 'Infinity and -Infinity rejected (typeof gate)',
      isType: () => createIsType<bigint>(),
      getSamples: () => ({
        valid: [1n, BigInt(42)],
        invalid: [42, Infinity, -Infinity, 'hello'],
      }),
    },

    boolean: {
      title: 'boolean',
      isType: () => createIsType<boolean>(),
      getSamples: () => ({
        valid: [true, false],
        invalid: [42, 'hello'],
      }),
    },

    date: {
      title: 'Date',
      isType: () => createIsType<Date>(),
      getSamples: () => ({
        valid: [new Date()],
        invalid: ['hello'],
      }),
    },

    enum_mixed: {
      title: 'enum (mixed values)',
      description: 'enum Color {Red, Green="green", Blue=2} — numeric reverse-mapping + string values',
      isType: () => createIsType<Color>(),
      getSamples: () => ({
        valid: [Color.Red, Color.Green, Color.Blue, 0, 'green', 2],
        invalid: ['Red', 'Green', 'Blue'],
      }),
    },

    literal_2: {
      title: 'literal 2',
      isType: () => createIsType<2>(),
      getSamples: () => ({valid: [2], invalid: [4]}),
    },

    literal_a: {
      title: 'literal "a"',
      isType: () => createIsType<'a'>(),
      getSamples: () => ({valid: ['a'], invalid: ['b']}),
    },

    literal_regexp_simple: {
      title: 'literal /abc/i',
      isType: () => createIsType<typeof reg>(),
      getSamples: () => ({valid: [/abc/i], invalid: [/asdf/i]}),
    },

    literal_regexp_escaped: {
      title: 'literal /[\'"]\\/ \\\\ \\//',
      description: 'regexp with characters that can be problematic in jit code if not correctly scaped',
      isType: () => createIsType<typeof reg2>(),
      getSamples: () => ({valid: [/['"]\/ \\ \//], invalid: [true]}),
    },

    literal_true: {
      title: 'literal true',
      isType: () => createIsType<true>(),
      getSamples: () => ({valid: [true], invalid: [false]}),
    },

    literal_1n: {
      title: 'literal 1n',
      isType: () => createIsType<1n>(),
      getSamples: () => ({valid: [1n], invalid: [2n]}),
    },

    literal_symbol: {
      title: 'literal Symbol("hello")',
      description: 'symbol identity via description match (mion semantics)',
      isType: () => createIsType<typeof sym>(),
      getSamples: () => ({valid: [sym], invalid: [Symbol('nice')]}),
    },

    never: {
      title: 'never',
      isType: () => createIsType<never>(),
      getSamples: () => ({
        valid: [],
        invalid: [true, false, 1, '3', {}, 'hello'],
      }),
    },

    null: {
      title: 'null',
      description: 'null and undefined are distinct',
      isType: () => createIsType<null>(),
      getSamples: () => ({
        valid: [null],
        invalid: [undefined, 42, 'hello'],
      }),
    },

    number: {
      title: 'number',
      description: 'Infinity and -Infinity rejected (Number.isFinite)',
      isType: () => createIsType<number>(),
      getSamples: () => ({
        valid: [42],
        invalid: [Infinity, -Infinity, 'hello'],
      }),
    },

    object: {
      title: 'object',
      description: 'null rejected despite JS typeof null === "object"',
      isType: () => createIsType<object>(),
      getSamples: () => ({
        valid: [{}, {a: 42, b: 'hello'}],
        invalid: [null, undefined, 42, 'hello'],
      }),
    },

    regexp: {
      title: 'RegExp',
      isType: () => createIsType<RegExp>(),
      getSamples: () => ({
        valid: [/abc/, new RegExp('abc')],
        invalid: [undefined, 42, 'hello'],
      }),
    },

    string: {
      title: 'string',
      isType: () => createIsType<string>(),
      getSamples: () => ({
        valid: ['hello'],
        invalid: [2],
      }),
    },

    symbol: {
      title: 'symbol',
      isType: () => createIsType<symbol>(),
      getSamples: () => ({
        valid: [Symbol(), Symbol('foo')],
        invalid: [undefined, 42, 'hello'],
      }),
    },

    undefined: {
      title: 'undefined',
      description: 'undefined and null are distinct',
      isType: () => createIsType<undefined>(),
      getSamples: () => ({
        valid: [undefined],
        invalid: [null, 42, 'hello'],
      }),
    },

    void: {
      title: 'void',
      description: 'void accepts undefined (and bare function return); rejects null',
      isType: () => createIsType<void>(),
      getSamples: () => ({
        valid: [undefined, vd()],
        invalid: [null, 42, 'hello'],
      }),
    },

    // noLiterals variants — mirror the `noLiterals: true` block in
    // mion's literal.spec.ts. Each literal degrades to its base-type
    // check: the validator accepts any value of the base type instead
    // of only the exact literal. The Go-side resolver swaps the
    // literal type for its base via Checker_getBaseTypeOfLiteralType
    // before assigning the hash (see internal/resolver/scan.go), so
    // these cases reuse the existing base-kind emit code.

    literal_2_noLiterals: {
      title: 'literal 2 (noLiterals)',
      description: 'degrades to number — Number.isFinite check',
      isType: () => createIsType<2>({noLiterals: true}),
      getSamples: () => ({valid: [4], invalid: ['4']}),
    },

    literal_a_noLiterals: {
      title: 'literal "a" (noLiterals)',
      description: 'degrades to string — typeof check',
      isType: () => createIsType<'a'>({noLiterals: true}),
      getSamples: () => ({valid: ['c'], invalid: [1]}),
    },

    literal_regexp_noLiterals: {
      title: 'literal /abc/i (noLiterals)',
      description: 'degrades to RegExp — instanceof check',
      isType: () => createIsType<typeof reg>({noLiterals: true}),
      getSamples: () => ({valid: [/otherReg/], invalid: ['otherReg']}),
    },

    literal_true_noLiterals: {
      title: 'literal true (noLiterals)',
      description: 'degrades to boolean — typeof check',
      isType: () => createIsType<true>({noLiterals: true}),
      getSamples: () => ({valid: [false], invalid: [1]}),
    },

    literal_1n_noLiterals: {
      title: 'literal 1n (noLiterals)',
      description: 'degrades to bigint — typeof check',
      isType: () => createIsType<1n>({noLiterals: true}),
      getSamples: () => ({valid: [3n], invalid: [3]}),
    },

    literal_symbol_noLiterals: {
      title: 'literal Symbol("hello") (noLiterals)',
      description: 'degrades to symbol — typeof check',
      isType: () => createIsType<typeof sym>({noLiterals: true}),
      getSamples: () => ({valid: [Symbol('world')], invalid: ['world']}),
    },

    // mion has no unknown.spec.ts — UnknownRunType extends AnyRunType
    // with no spec coverage. Intentionally omitted.
  },

  // ARRAY — ported from mion's packages/run-types/src/nodes/member/array.spec.ts
  // (every `it()` block's `validate(…)` assertion is migrated, including
  // those embedded in non-isType blocks such as `hasUnknownKeys`, `mock`,
  // and `stripUnknownKeys`), plus every `ARRAYS.*` entry in
  // packages/run-types/src/jitCompilers/serialization-suite.ts that affects
  // isType behavior.
  //
  // Cases whose element kind isn't yet implemented in the Go port
  // (object literal / union / tuple / non-Date class / circular) omit
  // the `isType` thunk; the adapter renders them as `it.todo` so the
  // sample payloads survive intact for activation when each kind lands.
  //
  // Adapters out of scope for this PR (each has its own future test file
  // re-importing this suite):
  //   - mock          → mion array.spec.ts "mock" / "mock CircularArray"
  //   - typeErrors    → mion array.spec.ts "+ errors" variants
  //   - hasUnknownKeys / strip / undefined / visitUnknownKeyErrors
  //                   → mion array.spec.ts "test array strict modes"
  //   - prepareForJson / restoreFromJson / JSON round-trip
  //                   → mion jitCompilers/json/jsonSpec/02JsonArrays.spec.ts
  ARRAY: {
    string_array: {
      title: 'string[]',
      isType: () => createIsType<string[]>(),
      getSamples: () => ({
        valid: [[], ['hello', 'world']],
        // The mixed-types invalid `['hello', 'world', {hello: 'world'}]`
        // is the carry-over from mion's "simple array hasUnknownKeys on
        // array with non objects" block — the object element fails the
        // string check, so the whole array fails isType.
        invalid: ['hello', ['hello', 2], ['hello', 'world', {hello: 'world'}]],
      }),
    },

    number_array: {
      title: 'number[]',
      description: 'Infinity / -Infinity / NaN rejected per atomic-number port',
      isType: () => createIsType<number[]>(),
      getSamples: () => ({
        valid: [[], [1, 2, 3], [42]],
        invalid: [[1, '2'], 'not-array', [Infinity], [-Infinity], [NaN]],
      }),
    },

    boolean_array: {
      title: 'boolean[]',
      isType: () => createIsType<boolean[]>(),
      getSamples: () => ({
        valid: [[], [true, false]],
        invalid: [[true, 42], 'nope'],
      }),
    },

    bigint_array: {
      title: 'bigint[]',
      isType: () => createIsType<bigint[]>(),
      getSamples: () => ({
        valid: [[], [1n, 2n]],
        invalid: [[1n, 2], 'nope'],
      }),
    },

    date_array: {
      title: 'Date[]',
      description: 'from mion serialization-suite ARRAYS.array_date',
      isType: () => createIsType<Date[]>(),
      getSamples: () => ({
        valid: [[], [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')]],
        invalid: [['2024'], [42]],
      }),
    },

    regexp_array: {
      title: 'RegExp[]',
      isType: () => createIsType<RegExp[]>(),
      getSamples: () => ({
        valid: [[], [/abc/, new RegExp('abc')]],
        invalid: [['/abc/'], [42]],
      }),
    },

    undefined_array: {
      title: 'undefined[]',
      description: 'from mion serialization-suite ARRAYS.undefined_in_array',
      isType: () => createIsType<undefined[]>(),
      getSamples: () => ({
        valid: [[], [undefined, undefined]],
        invalid: [[null], [42]],
      }),
    },

    null_array: {
      title: 'null[]',
      isType: () => createIsType<null[]>(),
      getSamples: () => ({
        valid: [[], [null]],
        invalid: [[undefined], [42]],
      }),
    },

    array_generic: {
      title: 'Array<string>',
      description: 'TypeScript sugar — resolves identically to string[]; carried as a regression check on canonical-id collapse',
      isType: () => createIsType<Array<string>>(),
      getSamples: () => ({
        valid: [[], ['hello']],
        invalid: ['hello', [42]],
      }),
    },

    string_array_2d: {
      title: 'string[][]',
      description: 'first multi-level test — exercises the Go-side dependency-call layer (outer array invokes pre-compiled inner via utl.getJIT(...).fn(v[i0]))',
      isType: () => createIsType<string[][]>(),
      getSamples: () => ({
        valid: [[], [[]], [['hello', 'world'], ['a', 'b']]],
        // mion Block 5 path-error samples: top-level array-of-string
        // fails isType when the type is string[][], same for plain
        // string. `['hello']` is "first element is `'hello'` which is
        // not an array".
        invalid: [[['hello', 2]], ['hello'], ['hello', 'world'], 'hello'],
      }),
    },

    string_array_3d: {
      title: 'string[][][]',
      description: 'depth stress for the dependency-call layer',
      isType: () => createIsType<string[][][]>(),
      getSamples: () => ({
        valid: [[], [[[]]], [[['a', 'b'], ['c']]]],
        invalid: [[[['a', 2]]], [['a']], ['a']],
      }),
    },

    string_array_noIsArrayCheck: {
      title: 'string[] (noIsArrayCheck)',
      description: 'noIsArrayCheck strips the Array.isArray guard; hashes distinctly from plain string_array — same samples, different validator',
      isType: () => createIsType<string[]>({noIsArrayCheck: true}),
      getSamples: () => ({
        valid: [[], ['hello']],
        // Without the guard, non-array inputs may not be rejected by
        // the validator (mion's documented trade-off — the caller has
        // pre-verified arrayness). Only sample inputs that the loop
        // itself catches.
        invalid: [[42]],
      }),
    },

    // ---- DEFERRED — sample payloads carried for future activation ----

    object_array: {
      title: '{a: string}[]',
      description: "mion array.spec.ts 'test array strict modes' — array of objects. Extra keys on object elements still pass isType (unknown-key handling is a different adapter).",
      isType: () => createIsType<{a: string}[]>(),
      getSamples: () => ({
        valid: [
          [],
          [{a: 'hello'}, {a: 'world'}],
          [{a: 'hello', extraA: 'extraA'}, {a: 'world'}],
        ],
        invalid: ['not-an-array', [{a: 42}], [{}], [null]],
      }),
    },

    union_array: {
      title: '(string | number)[]',
      description: 'array of union — each element validates against the union OR-chain.',
      isType: () => createIsType<(string | number)[]>(),
      getSamples: () => ({
        valid: [[], ['a', 1, 'b', 2], [1], ['a']],
        invalid: [[true], 'a', [null], ['a', true]],
      }),
    },

    tuple_array: {
      title: '[string, number][]',
      description: 'array of tuples — exercises tuple under array dependency call.',
      isType: () => createIsType<[string, number][]>(),
      getSamples: () => ({
        valid: [[], [['a', 1], ['b', 2]]],
        invalid: [[['a']], [['a', 'b']], 'not-array', [[1, 'a']]],
      }),
    },

    circular_array: {
      title: 'CircularArray = CircularArray[]',
      description:
        "mion array.spec.ts 'Array circular ref'. Self-referential array — handled via the always-non-inlined KindArray policy plus the isSelf branch in EmitDependencyCall (emits the inner-function-name directly, no .fn).",
      isType: () => {
        type CircularArray = CircularArray[];
        return createIsType<CircularArray>();
      },
      getSamples: () => {
        // type CircularArray = CircularArray[]; const arr: CircularArray = [[[[]]], [[]], []];
        const arrA: any = [];
        arrA.push([[[]]], [[]], []);
        return {
          valid: [[], arrA],
          invalid: [[[[]], 'A'], 'not array', null],
        };
      },
    },

    circular_object_with_array: {
      title: 'ObjectType (mion Block 13)',
      description:
        'type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]} — same dependency-call mechanism as the basic circular interface; the array property d?: ObjectType[] closes the cycle via Array → Object.',
      isType: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return createIsType<ObjectType>();
      },
      getSamples: () => ({
        valid: [
          {a: 'hello'},
          {a: 'hello', deep: {b: 'world', c: 123}},
          {a: 'hello', d: [{a: 'world'}]},
          {a: 'hello', d: [{a: 'world', d: [{a: 'deep'}]}]},
        ],
        invalid: [{a: 42}, 'not-an-object', {a: 'hello', deep: {b: 1, c: 1}}, {a: 'hello', d: 'not-array'}],
      }),
    },

    symbol_array: {
      title: 'symbol[]',
      description:
        "mion ARRAYS.non_serializable_in_array — `Arrays can not have non serializable types` (nodes/member/array.ts:148). Mion throws at JIT compile time; we mirror the runtime-observable effect by emitting an always-false validator so any input is rejected.",
      isType: () => createIsType<symbol[]>(),
      getSamples: () => ({
        valid: [],
        invalid: [[Symbol('a')], [], 'not array', null, [42]],
      }),
    },
  },

  // OBJECT — ports `isType` test coverage from mion's object-shape
  // node specs:
  //   - packages/run-types/src/nodes/collection/interface.spec.ts
  //   - packages/run-types/src/nodes/collection/class.spec.ts
  //   - packages/run-types/src/nodes/collection/classRpcError.spec.ts
  //   - packages/run-types/src/nodes/member/indexProperty.spec.ts
  //   - packages/run-types/src/nodes/member/callSignature.spec.ts
  //   - packages/run-types/src/nodes/collection/circularRefs.spec.ts
  //   - packages/run-types/src/jitCompilers/serialization-suite.ts
  //     (OBJECTS / RECORDS / FUNCTIONS sections — entries that touch
  //     interface, class, index signature, method, or call signature)
  // and the validate(...) sanity-check assertions embedded in the
  // adjacent `mock` / `hasUnknownKeys` / `stripUnknownKeys` blocks.
  //
  // Tests for non-isType adapters (mock, typeErrors, hasUnknownKeys,
  // prepareForJson, …) land in their own future adapter files; this
  // block carries ONLY the isType-relevant assertions but preserves
  // the sample shapes so a future adapter can re-import them.
  OBJECT: {
    simple_interface: {
      title: '{a: string; b: number}',
      description: 'mion interface.spec.ts "validate object" (simplified to the atomic-prop subset that the current Go port can validate end-to-end)',
      isType: () => createIsType<{a: string; b: number}>(),
      getSamples: () => ({
        valid: [{a: 'hello', b: 1}, {a: '', b: 0}, {a: 'x', b: 42, extra: true}],
        invalid: ['hello', null, undefined, {a: 'x'}, {a: 1, b: 1}, {a: 'x', b: 'not number'}],
      }),
    },

    interface_with_optional: {
      title: '{a: string; b?: number}',
      description: 'optional property — `(v.b === undefined || Number.isFinite(v.b))` per PropertyRunType.emitIsType',
      isType: () => createIsType<{a: string; b?: number}>(),
      getSamples: () => ({
        valid: [{a: 'x'}, {a: 'x', b: 0}, {a: 'x', b: undefined}],
        invalid: [{a: 'x', b: 'not number'}, {a: 1}, null],
      }),
    },

    interface_with_date: {
      title: '{date: Date; name: string}',
      description: 'tests that Date child validates via instanceof inside the AND chain — mion interface.spec.ts ObjectType subset',
      isType: () => createIsType<{date: Date; name: string}>(),
      getSamples: () => ({
        valid: [{date: new Date(), name: 'x'}],
        invalid: [{date: 'not date', name: 'x'}, {date: new Date(), name: 1}, {name: 'x'}, null],
      }),
    },

    interface_with_method: {
      title: '{name: string; cb: () => any}',
      description: "mion: objectSkipProps — function-typed properties are skipped from isType (mion's `getJitChild → undefined` for function children). validate({name:'x'}) PASSES even without `cb`.",
      isType: () => createIsType<{name: string; cb: () => any}>(),
      getSamples: () => ({
        // No cb required because function-typed properties are skipped.
        valid: [{name: 'x'}, {name: 'x', cb: () => null}, {name: 'x', cb: 42}],
        invalid: [{name: 1}, null, undefined],
      }),
    },

    nested_object: {
      title: '{a: string; deep: {b: string; c: number}}',
      description: 'nested object — outer + inner AND-chains; mion ObjectType "deep" subset',
      isType: () => createIsType<{a: string; deep: {b: string; c: number}}>(),
      getSamples: () => ({
        valid: [{a: 'x', deep: {b: 'y', c: 1}}],
        invalid: [{a: 'x'}, {a: 'x', deep: {b: 1, c: 1}}, {a: 'x', deep: null}, null],
      }),
    },

    interface_string_array_prop: {
      title: '{tags: string[]}',
      description: 'an array-typed property — exercises the dependency-call layer through an object',
      isType: () => createIsType<{tags: string[]}>(),
      getSamples: () => ({
        valid: [{tags: []}, {tags: ['a', 'b']}],
        invalid: [{tags: ['a', 1]}, {tags: 'not array'}, null],
      }),
    },

    circular_interface: {
      title: 'ICircular = {name: string; child?: ICircular}',
      description: "mion interface.spec.ts 'validate circular object'. Exercises self-recursive dependency call (mion isSelf branch — `<innerFnName>(v.child)` without `.fn`).",
      isType: () => {
        type ICircular = {name: string; child?: ICircular};
        return createIsType<ICircular>();
      },
      getSamples: () => ({
        valid: [
          {name: 'root'},
          {name: 'root', child: {name: 'a'}},
          {name: 'root', child: {name: 'a', child: {name: 'b'}}},
        ],
        invalid: [
          {name: 1},
          {name: 'x', child: {name: 1}},
          {name: 'x', child: 'not object'},
          null,
        ],
      }),
    },

    circular_interface_on_array: {
      title: 'ICircularArray = {name: string; children?: ICircularArray[]}',
      description: "mion interface.spec.ts 'validate circular interface on array' — circular type traversed via an array property.",
      isType: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return createIsType<ICircularArray>();
      },
      getSamples: () => ({
        valid: [
          {name: 'r'},
          {name: 'r', children: []},
          {name: 'r', children: [{name: 'a'}, {name: 'b', children: [{name: 'c'}]}]},
        ],
        invalid: [
          {name: 'r', children: [{name: 1}]},
          {name: 'r', children: 'not array'},
          {name: 1},
        ],
      }),
    },

    circular_interface_on_nested_object: {
      title: 'ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}}',
      description: "mion interface.spec.ts 'validate circular interface on nested object' — circular reference deep inside a property.",
      isType: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return createIsType<ICircularDeep>();
      },
      getSamples: () => ({
        valid: [
          {name: 'r', embedded: {hello: 'h'}},
          {name: 'r', embedded: {hello: 'h', child: {name: 'c', embedded: {hello: 'h2'}}}},
        ],
        invalid: [
          {name: 'r'},
          {name: 'r', embedded: {hello: 1}},
          {name: 'r', embedded: null},
        ],
      }),
    },

    index_signature_string: {
      title: '{[key: string]: string}',
      description: "mion indexProperty.spec.ts 'validate index run type' — for-in loop over own keys, value must satisfy the value type.",
      isType: () => createIsType<{[key: string]: string}>(),
      getSamples: () => ({
        valid: [{}, {a: 'x'}, {a: 'x', b: 'y'}],
        invalid: [{a: 1}, {a: 'x', b: 2}, null, 'not object'],
      }),
    },

    index_signature_named_props: {
      title: '{a: string; b: number; [key: string]: string | number}',
      description: "mion indexProperty.spec.ts 'validate index run type + extra properties' — named props (a, b) AND the index signature both validate; extras (any key not a/b) must satisfy the union value type.",
      isType: () => createIsType<{a: string; b: number; [key: string]: string | number}>(),
      getSamples: () => ({
        valid: [{a: 'x', b: 1}, {a: 'x', b: 1, extra: 'y'}, {a: 'x', b: 1, extra: 7}],
        invalid: [{a: 1, b: 1}, {a: 'x'}, null, {a: 'x', b: 1, extra: true}],
      }),
    },

    index_signature_nested: {
      title: '{[key: string]: {[key: string]: number}}',
      description: "mion indexProperty.spec.ts nested rtNested — index sig pointing at another index sig.",
      isType: () => createIsType<{[key: string]: {[key: string]: number}}>(),
      getSamples: () => ({
        valid: [{}, {a: {x: 1, y: 2}}, {a: {}, b: {n: 0}}],
        invalid: [{a: 1}, {a: {x: 'not number'}}, null],
      }),
    },

    index_signature_date_value: {
      title: '{[key: string]: {[key: string]: Date}}',
      description: "mion indexProperty.spec.ts rtNested2 — Date as the leaf value type.",
      isType: () => createIsType<{[key: string]: {[key: string]: Date}}>(),
      getSamples: () => ({
        valid: [{}, {a: {x: new Date()}}],
        invalid: [{a: {x: 'not date'}}, {a: 'not object'}],
      }),
    },

    function_top_level: {
      title: '() => void',
      description: 'mion FunctionRunType.emitIsType — `typeof v === \'function\'`. Param-arity check is deferred (mion-level).',
      isType: () => createIsType<() => void>(),
      getSamples: () => ({
        valid: [() => {}, function () {}, async () => {}],
        invalid: [null, undefined, 42, 'function', {}],
      }),
    },

    // ---- DEFERRED — kept as data for future adapter activation ----

    interface_callable: {
      title: 'CallableInterface = {(a: number, b: boolean): string; extra: string}',
      description: 'mion interface.spec.ts "validate callable interface" — the emit detects a CallSignature child and switches the typeof guard from `object` to `function`, then AND-chains the remaining properties on top (JS functions can carry properties).',
      isType: () => createIsType<{(a: number, b: boolean): string; extra: string}>(),
      getSamples: () => ({
        valid: [
          Object.assign(function (_a: number, _b: boolean) {
            return 'x';
          }, {extra: 'x'}),
        ],
        invalid: [
          {extra: 'x'},                           // not a function
          () => {},                               // missing `extra` prop
          Object.assign(() => {}, {extra: 42}),   // extra wrong type
          null,
        ],
      }),
    },

    interface_all_optional: {
      title: '{a?: string; b?: number}',
      description: 'mion interface.spec.ts "validate empty object for ObjectAllOptional type". The `allOptionalCode` guard `(!Array.isArray(v) && Object.prototype.toString.call(v) === \'[object Object]\')` is added when every contributing child is optional, so arrays / Date / Map / Set are explicitly rejected (without the guard they\'d slip through the bare `typeof === \'object\'` check).',
      isType: () => createIsType<{a?: string; b?: number}>(),
      getSamples: () => ({
        valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: undefined, b: undefined}],
        invalid: [[], new Date(), new Map(), new Set(), null, 'hello', 42],
      }),
    },

    class_simple: {
      title: 'class MySerializableClass with two atomic props',
      description: "mion class.spec.ts 'validate class'. ClassRunType inherits InterfaceRunType.emitIsType in mion, so the KindClass+SubKindNone arm in istype.go falls through to emitObjectIsType. The serializer filters synthetic `prototype` members from class projections so the AND chain only includes user-declared properties + methods (methods drop out via the function-skip rule).",
      isType: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return createIsType<MySerializableClass>();
      },
      getSamples: () => {
        class Match {
          date = new Date();
          name = 'x';
          someMethod() {
            return 'unused';
          }
        }
        return {
          valid: [new Match(), {date: new Date(), name: 'x'}, {date: new Date(), name: 'x', someMethod: () => null}],
          invalid: [{date: 'not date', name: 'x'}, {date: new Date()}, {name: 'x'}, null, 'not object'],
        };
      },
    },

    rpc_error_class: {
      title: 'RpcError<"test-error"> — local equivalent shape',
      description: "mion classRpcError.spec.ts — verifies the standard class projection handles RpcError-shaped classes (the actual @mionjs/core RpcError isn't a built-in node kind; it's a regular class with a literal-true brand + generic type discriminator). We define a local equivalent here to exercise the same shape end-to-end without pulling in the @mionjs/core dependency for a single test.",
      isType: () => {
        // Mirrors @mionjs/core's RpcError public shape:
        //   - `mion@isΣrrθr: true` brand (literal true)
        //   - `type: ErrType` generic discriminator
        //   - `publicMessage: string`
        //   - `id?: string`
        // `message` / `name` / `stack` are intentionally NOT declared
        // as TS properties (they exist at runtime via Error) so isType
        // doesn't validate them.
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return createIsType<RpcError<'test-error'>>();
      },
      getSamples: () => {
        const validInstance = {
          'mion@isΣrrθr': true,
          type: 'test-error',
          publicMessage: 'error',
        };
        const validWithId = {...validInstance, id: 'error-123'};
        return {
          valid: [validInstance, validWithId],
          invalid: [
            // brand wrong
            {'mion@isΣrrθr': false, type: 'test-error', publicMessage: 'x'},
            // type discriminator wrong
            {'mion@isΣrrθr': true, type: 'other-error', publicMessage: 'x'},
            // missing publicMessage
            {'mion@isΣrrθr': true, type: 'test-error'},
            null,
            'not object',
          ],
        };
      },
    },

    call_signature_params: {
      title: 'CallSignature params via Parameters<F> (tuple)',
      description: "mion callSignature.spec.ts 'should validate correct parameters' — mion exposes this via `rt.getCallSignature().createJitParamsFunction(JitFunctions.isType)`; our pipeline uses TypeScript's built-in `Parameters<F>` to extract the param tuple as a first-class type and reuses the standard tuple emit. Same observable behavior: the validator accepts `[number, boolean]`, rejects wrong-type args, accepts missing trailing args (treats them as undefined per mion's `v.length <= N` policy), rejects excess args.",
      isType: () => {
        type CallSig = (a: number, b: boolean) => string;
        return createIsType<Parameters<CallSig>>();
      },
      getSamples: () => ({
        valid: [
          [1, true],
          [0, false],
          // mion: missing trailing args treated as undefined; if the
          // param type is `boolean` (not `boolean | undefined`) then
          // `[1]` fails because v[1] === undefined doesn't satisfy
          // typeof === 'boolean'. Same shape here.
        ],
        invalid: [
          [1, 'not boolean'],
          [1],                   // missing required boolean
          [1, true, 'extra'],    // excess args
          ['not number', true],
          'not array',
          null,
        ],
      }),
    },

    record_union_keys: {
      title: 'Record<"a" | "b", number>',
      description: "`Record<K, V>` with a literal-union key resolves to a fixed-property object literal (`{a: V; b: V}`) at the type-checker level — tsgo distributes the union over the property names. Same emit path as a hand-written object literal; each key is a required property of type V.",
      isType: () => createIsType<Record<'a' | 'b', number>>(),
      getSamples: () => ({
        valid: [
          {a: 1, b: 2},
          {a: 0, b: 0},
          // Extra props pass — Record<UnionKey, V> doesn't imply strict.
          {a: 1, b: 2, c: 3},
        ],
        invalid: [
          {a: 1},                  // missing 'b'
          {b: 1},                  // missing 'a'
          {},                      // empty
          {a: 'x', b: 1},          // wrong type
          null,
          'not object',
        ],
      }),
    },

    union_value_index: {
      title: '{[key: string]: string | number}',
      description: 'index signature with union value type — union emit landed; for-in loop applies the union check to every own key.',
      isType: () => createIsType<{[key: string]: string | number}>(),
      getSamples: () => ({
        valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: 1, b: 'x'}],
        invalid: [{a: true}, {a: 'x', b: null}, 'not object', null],
      }),
    },

    object_with_union_prop: {
      title: '{kind: "a" | "b"; n: number}',
      description: 'discriminated union as a property type — union emit handles the literal-string union as an OR-chain of `===` checks.',
      isType: () => createIsType<{kind: 'a' | 'b'; n: number}>(),
      getSamples: () => ({
        valid: [{kind: 'a', n: 1}, {kind: 'b', n: 0}],
        invalid: [{kind: 'c', n: 1}, {n: 1}, {kind: 'a', n: 'not number'}, null],
      }),
    },
  },
  // TUPLE — ports `isType` test coverage from mion's
  // packages/run-types/src/nodes/collection/tuple.spec.ts and
  // serialization-suite.ts TUPLES section.
  //
  // Adapters out of scope here (mock / typeErrors / prepareForJson)
  // get their own adapter file; this block carries the
  // isType-relevant assertions and the sample shapes those future
  // adapters will reuse.
  TUPLE: {
    string_number_pair: {
      title: '[string, number]',
      isType: () => createIsType<[string, number]>(),
      getSamples: () => ({
        valid: [['hello', 1], ['', 0]],
        invalid: [[], ['hello'], ['hello', 1, 'extra'], [1, 'hello'], 'not array', null],
      }),
    },

    full_mion_tuple: {
      title: '[Date, number, string, null, string[], bigint]',
      description: 'mion tuple.spec.ts "validate tuple"',
      isType: () => createIsType<[Date, number, string, null, string[], bigint]>(),
      getSamples: () => ({
        valid: [[new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
        invalid: [
          [new Date(), 123, 'hello', null, ['a', 'b', 'c']], // missing 6th elem
          [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34], // extra
          [new Date(), 123, 'hello', null, ['a', 'b', 'c'], 'not bigint'],
        ],
      }),
    },

    tuple_with_optional: {
      title: '[number, bigint?, boolean?, number?]',
      description: 'mion tuple.spec.ts "validate tuple with optional parameters"',
      isType: () => createIsType<[number, bigint?, boolean?, number?]>(),
      getSamples: () => ({
        valid: [[3, undefined, true, 4], [3], [3, 1n], [3, 1n, false]],
        invalid: [[], [3, 'not bigint'], [3, 1n, false, 4, 'extra'], 'not array'],
      }),
    },

    nested_tuple_in_array: {
      title: '[string, number][]',
      description: 'array of tuples — exercises tuple inside array dependency call',
      isType: () => createIsType<[string, number][]>(),
      getSamples: () => ({
        valid: [[], [['a', 1]], [['a', 1], ['b', 2]]],
        invalid: [[['a', 'b']], [['a']], ['not tuple']],
      }),
    },

    // ---- DEFERRED — features that aren't yet ported ----

    tuple_rest: {
      title: '[number, ...string[]]',
      description: "mion tuple.spec.ts 'validate tuple with rest parameter'. Rest TupleMembers (Flags=['rest']) emit a for-loop starting at the member's Position and iterating to v.length, validating every element against the wrapped type. The tuple's length-bound check is skipped (rest absorbs extras).",
      isType: () => createIsType<[number, ...string[]]>(),
      getSamples: () => ({
        valid: [[3], [3, 'a'], [3, 'a', 'b', 'c']],
        invalid: [[3, 'a', 4], ['not number'], [], 'not array', [3, 1]],
      }),
    },

    tuple_circular: {
      title: '[Date, number, string, null, string[], bigint, TupleCircular?]',
      description: 'mion tuple.spec.ts circular tuple. Same mechanism as circular array — Tuple is always non-inlined, the self-recursive dependency call closes the cycle via the isSelf branch.',
      isType: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createIsType<TupleCircular>();
      },
      getSamples: () => {
        const tc: any = [new Date(), 1, 'a', null, [], 1n];
        const tcRec: any = [new Date(), 1, 'a', null, [], 1n, [new Date(), 1, 'a', null, [], 1n]];
        return {
          valid: [tc, tcRec],
          invalid: [[], [new Date(), 1, 'a', null, [], 'not bigint'], 'not array'],
        };
      },
    },

    tuple_multiple_trailing_optionals: {
      title: '[number, bigint?, boolean?, number?]',
      description: "Multiple trailing optionals — TS grammar requires optionals to come after required elements (`[A, B?, C]` is a TS error), so the canonical 'optional middle' form is a chain of trailing optionals. Each TupleMember.Optional flag fires its own `(v[i] === undefined || childCheck)` wrap independently.",
      isType: () => createIsType<[number, bigint?, boolean?, number?]>(),
      getSamples: () => ({
        valid: [
          [3],
          [3, 1n],
          [3, 1n, true],
          [3, 1n, true, 4],
          [3, undefined, true, 4], // explicit undefined in the middle
          [3, 1n, undefined, 4],
          [3, undefined, undefined, 4],
        ],
        invalid: [
          [],                            // missing required first
          [3, 'not bigint'],             // wrong type at optional slot
          [3, 1n, true, 4, 'extra'],     // excess args
          'not array',
        ],
      }),
    },

    tuple_named_labels: {
      title: '[name: string, age: number]',
      description: "Named tuple labels — `[name: string, age: number]` is the same shape as `[string, number]` at runtime (labels are TS-only metadata, erased at emit). Carried as a regression check that label syntax doesn't affect the validator shape.",
      isType: () => createIsType<[name: string, age: number]>(),
      getSamples: () => ({
        valid: [['Alice', 30], ['', 0]],
        invalid: [[], ['Alice'], ['Alice', '30'], [30, 'Alice'], null, 'not array'],
      }),
    },

    tuple_with_non_serializable: {
      title: '[number, () => any]',
      description: 'mion serialization-suite TUPLES.tuple_with_non_serializable. Function-typed tuple members emit `v[i] === undefined` per mion\'s non-serializable handling. The function slot must be absent or explicitly undefined; any other value (a real function, a string, …) fails.',
      isType: () => createIsType<[number, () => any]>(),
      getSamples: () => ({
        // `[3]` is valid — v[1] is undefined which satisfies the
        // `v[1] === undefined` check the function slot emits.
        valid: [[3, undefined], [3]],
        invalid: [[3, () => null], [3, 42], ['not number'], 'not array'],
      }),
    },
  },

  // UNION — ports `isType` test coverage from
  // packages/run-types/src/nodes/collection/union.spec.ts and
  // serialization-suite.ts UNIONS section.
  //
  // Intersection has its own (deferred) entry — mion resolves
  // intersections to ObjectLiteral at compile time, so the isType
  // emit only needs to know about ObjectLiteral.
  UNION: {
    atomic_union: {
      title: 'Date | number | string | null | bigint',
      description: 'mion union.spec.ts "validate union" — Atomic Union suite',
      isType: () => createIsType<Date | number | string | null | bigint>(),
      getSamples: () => ({
        valid: [new Date(), 123, 'hello', null, 1n],
        invalid: [{}, [], true, undefined],
      }),
    },

    string_literal_union: {
      title: "'UNO' | 'DOS' | 'TRES'",
      description: 'mion union.spec.ts "validate union discriminator string"',
      isType: () => createIsType<'UNO' | 'DOS' | 'TRES'>(),
      getSamples: () => ({
        valid: ['UNO', 'DOS', 'TRES'],
        invalid: ['INVALID', 'uno', '', 42, null],
      }),
    },

    string_or_number: {
      title: 'string | number',
      isType: () => createIsType<string | number>(),
      getSamples: () => ({
        valid: ['hello', 42, 0, ''],
        invalid: [null, undefined, true, [], {}],
      }),
    },

    union_of_array_types: {
      title: 'string[] | number[] | boolean[]',
      description: 'mion union.spec.ts "Union Arr"',
      isType: () => createIsType<string[] | number[] | boolean[]>(),
      getSamples: () => ({
        valid: [['a'], [1], [true, false], [], ['a', 'b']],
        invalid: [['a', 1], [1, 'a'], 'not array', null],
      }),
    },

    array_of_union: {
      title: '(string | bigint | boolean | Date)[]',
      description: 'mion union.spec.ts "Arr with union of types"',
      isType: () => createIsType<(string | bigint | boolean | Date)[]>(),
      getSamples: () => ({
        valid: [[1n, 'b', new Date(), true]],
        invalid: [['a', false, 2]], // 2 is a number, not bigint
      }),
    },

    // ---- DEFERRED ----

    union_of_object_shapes: {
      title: '{a: string; aa: boolean} | {b: number} | {c: bigint}',
      description: "mion union.spec.ts 'Union Obj'. Object-typed union members go through the dependency-call layer with the shared `typeof === 'object' && !== null` guard lifted out of the OR-chain.",
      isType: () => createIsType<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      getSamples: () => ({
        // mion union.spec.ts uses loose matching — `{a, b, c}` passes
        // because `{b: number}` is satisfied. Our emit accepts any
        // object that satisfies AT LEAST one member's required props.
        valid: [{a: 'x', aa: true}, {b: 1}, {c: 1n}, {a: 'x', aa: true, b: 1}],
        invalid: [{a: 'x'}, {}, 'not object', null, [], 42],
      }),
    },

    discriminated_union: {
      title: '{kind: "a"; n: number} | {kind: "b"; s: string}',
      description: 'mion union.spec.ts "Union with discriminator property" — the OR-chain is semantically correct; the discriminator-aware optimization (early-return on the discriminator literal) is a separate emit-shape concern handled later.',
      isType: () => createIsType<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      getSamples: () => ({
        valid: [{kind: 'a', n: 1}, {kind: 'b', s: 'hello'}],
        invalid: [{kind: 'c', n: 1}, {kind: 'a', n: 'not number'}, {n: 1}, null, 'not object'],
      }),
    },

    circular_union: {
      title: 'UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[]',
      description: 'mion union.spec.ts "Union circular". Handled via always-non-inlined Union + Object + Array (no IsCircular detection needed; the dependency-call layer terminates via the lazy-init two-phase cache registration).',
      isType: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createIsType<UnionC>();
      },
      getSamples: () => ({
        valid: [
          new Date(),
          123,
          'hello',
          {},
          {a: {a: {}}},
          {b: 'hello'},
          [],
          [{a: {}}, [123, 'hello']],
        ],
        invalid: [true, null, undefined, {a: true}, [true]],
      }),
    },

    union_with_methods: {
      title: '{name: string; getName(): string} | {age: number; getAge(): number}',
      description: 'mion union.spec.ts "Union with objects containing methods" — methods are skipped from each branch via the property-emit function-skip rule (the AND chain inside each object reduces to the data-only props).',
      isType: () => createIsType<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      getSamples: () => ({
        valid: [{name: 'x', getName: () => 'x'}, {age: 1, getAge: () => 1}, {name: 'x'}, {age: 1}],
        invalid: [{}, null, 'not object', []],
      }),
    },

    intersection_to_object: {
      title: '{a: string} & {b: number}',
      description: "mion intersection.spec.ts — tsgo / deepkit resolves intersections to ObjectLiteral at the type-checker level, so the cache never carries a KindIntersection that needs validation. Runtime behavior matches `{a: string; b: number}` byte-for-byte.",
      isType: () => createIsType<{a: string} & {b: number}>(),
      getSamples: () => ({
        valid: [{a: 'x', b: 1}, {a: '', b: 0}],
        invalid: [{a: 'x'}, {b: 1}, null, {a: 1, b: 1}, {a: 'x', b: 'not number'}],
      }),
    },
  },
  // TEMPLATE_LITERAL — ports `isType` test coverage from
  // packages/run-types/src/nodes/collection/templateLiteral.spec.ts.
  //
  // Mion's emit compiles the template-literal type into a JS RegExp at
  // build time and calls `regex.test(v)`. Our port needs both
  // serializer-side projection (TypeFlagsTemplateLiteral; extract
  // literal text segments + placeholder kinds) and emit-side regex
  // composition. Today the serializer projects template literal types
  // as `KindUnknown` with the literal text in `typeName`, so neither
  // half exists yet — every case is `it.todo`. Sample payloads carry
  // over verbatim from mion so activation lands without per-case
  // research.
  TEMPLATE_LITERAL: {
    url_with_number_id: {
      title: '`api/user/${number}`',
      description: "mion templateLiteral.spec.ts 'URL pattern api/user/${number}'. Compiled to `^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$` at JIT-build time; isType emits `typeof v === 'string' && regex.test(v)`.",
      isType: () => createIsType<`api/user/${number}`>(),
      getSamples: () => ({
        valid: ['api/user/42', 'api/user/0', 'api/user/3.14', 'api/user/-7'],
        invalid: ['api/user/abc', '/api/user/42', 'api/user/', 42, null, 'api/user/42x'],
      }),
    },

    multi_segment_url: {
      title: '`/api/v${number}/user/${string}/posts/${number}`',
      description: "mion templateLiteral.spec.ts 'multi-segment URL'. Multiple placeholders + literal segments.",
      isType: () => createIsType<`/api/v${number}/user/${string}/posts/${number}`>(),
      getSamples: () => ({
        valid: ['/api/v1/user/jane/posts/7', '/api/v2/user/joe/posts/0'],
        invalid: ['api/v1/user/jane/posts/7', '/api/v1/user/jane/posts/abc', '/api/vx/user/jane/posts/7'],
      }),
    },

    leading_string_placeholder: {
      title: '`${string}/${number}`',
      description: "mion templateLiteral.spec.ts 'leading ${string} placeholder' — empty-string prefix accepted (string span uses `[\\s\\S]*`, not `+`).",
      isType: () => createIsType<`${string}/${number}`>(),
      getSamples: () => ({
        valid: ['/42', 'users/42'],
        invalid: ['users', '/abc'],
      }),
    },

    regex_special_chars: {
      title: '`(${number})`',
      description: "mion templateLiteral.spec.ts 'regex special chars in literal' — parens (and other regex metacharacters) in the literal segments must be escaped in the compiled regex.",
      isType: () => createIsType<`(${number})`>(),
      getSamples: () => ({
        valid: ['(42)', '(0)', '(-3.14)'],
        invalid: ['42', '(abc)', '()', '(42'],
      }),
    },

    template_literal_nested_in_object: {
      title: '{url: `api/user/${number}`; method: string}',
      description: "mion templateLiteral.spec.ts 'nested in object' — template literal as a property value; the parent object's AND chain composes the typeof+regex check against `v.url`.",
      isType: () => createIsType<{url: `api/user/${number}`; method: string}>(),
      getSamples: () => ({
        valid: [{url: 'api/user/42', method: 'GET'}],
        invalid: [{url: 'api/admin/42', method: 'GET'}, {url: 'api/user/42'}, null],
      }),
    },

    template_literal_index_key: {
      title: '{[key: `api/${string}`]: number}',
      description: "mion templateLiteral.spec.ts 'as index signature key' — index signature whose key type is a template literal pattern. The IndexSignature emit now compiles the key pattern to a regex (same path as standalone template literals) and adds a per-key `regex.test(k)` check to the for-in loop, mirroring mion's getKeyPatternVar.",
      isType: () => createIsType<{[key: `api/${string}`]: number}>(),
      getSamples: () => ({
        valid: [{}, {'api/users': 1}, {'api/users': 1, 'api/admin': 2}],
        invalid: [{foo: 1}, {'api/users': 'not number'}, {'api/users': 1, foo: 2}, null],
      }),
    },

    template_literal_union_placeholder: {
      title: "`${'a' | 'b'}-${number}`",
      description: 'Template literal with a union placeholder. tsgo distributes the union internally, so the type-checker hands the projector either a union span or a pre-distributed set of template literals; either way the compiled regex must constrain the placeholder to {a, b} — anything outside the union must be rejected.',
      isType: () => createIsType<`${'a' | 'b'}-${number}`>(),
      getSamples: () => ({
        valid: ['a-42', 'b-0', 'a--3.14'],
        invalid: ['c-1', 'a-', '-1', 'a-foo', 'ab-1'],
      }),
    },
  },

  // NATIVE — native JS / runtime container types that need bespoke
  // `instanceof` + element-iteration emits:
  //   - `Map<K, V>` → `instanceof Map` + iterate `.entries()`
  //   - `Set<T>`   → `instanceof Set` + iterate `.values()`
  //   - `Promise<T>` → thenable check (the wrapped T isn't validated
  //     synchronously; callers use `Awaited<P>` for the resolved value)
  // Mirrors mion's nodes/native/* runtype implementations. Date and
  // RegExp are also "native" but project as atomic kinds and live in
  // the ATOMIC block above.
  NATIVE: {
    map_string_number: {
      title: 'Map<string, number>',
      description: 'mion native/map — `v instanceof Map` plus iteration over `v.entries()` checking each key and value against K / V.',
      isType: () => createIsType<Map<string, number>>(),
      getSamples: () => {
        const empty = new Map();
        const one = new Map([['a', 1]]);
        const many = new Map([
          ['a', 1],
          ['b', 2],
        ]);
        const wrongKey = new Map<any, number>([[1, 1]]);
        const wrongValue = new Map<string, any>([['a', 'not number']]);
        return {
          valid: [empty, one, many],
          invalid: [{}, [], null, 'not map', wrongKey, wrongValue],
        };
      },
    },

    set_string: {
      title: 'Set<string>',
      description: 'mion native/set — `v instanceof Set` plus iteration over `v.values()`.',
      isType: () => createIsType<Set<string>>(),
      getSamples: () => {
        const empty = new Set<string>();
        const one = new Set(['a']);
        const many = new Set(['a', 'b', 'c']);
        const wrongType = new Set<any>([1]);
        return {
          valid: [empty, one, many],
          invalid: [{}, [], null, 'not set', wrongType],
        };
      },
    },

    promise_string: {
      title: 'Promise<string>',
      description: 'Promise validation is a thenable check — `typeof v === \'object\' && v !== null && typeof v.then === \'function\'`. The wrapped T cannot be validated synchronously (the promise hasn\'t resolved); callers use `Awaited<P>` for the resolved-value check (see `awaited_promise` below).',
      isType: () => createIsType<Promise<string>>(),
      getSamples: () => {
        const realPromise = Promise.resolve('x');
        const thenable = {then: () => null};
        return {
          valid: [realPromise, thenable],
          invalid: [null, 'string', 42, {}, []],
        };
      },
    },

    awaited_promise: {
      title: 'Awaited<Promise<string>>',
      description: "TypeScript's built-in `Awaited<P>` utility unwraps the promise to its resolved type; tsgo resolves it at compile time, so this case lands as plain `string` in our cache and reuses the atomic string emit. The test verifies the utility threads through correctly.",
      isType: () => createIsType<Awaited<Promise<string>>>(),
      getSamples: () => ({
        valid: ['hello', ''],
        invalid: [42, null, undefined, Promise.resolve('x')],
      }),
    },
  },

  // UTILITY — TypeScript's built-in utility types (Partial, Required,
  // Pick, Omit, Exclude, Extract, NonNullable, ReturnType, Readonly,
  // Uppercase / Lowercase / Capitalize / Uncapitalize, and combined
  // intersection-with-modifier forms). Mirrors mion's
  // packages/run-types/src/nodes/utility/*.spec.ts.
  //
  // **None of these need new emit code.** tsgo eagerly resolves each
  // utility at the type-checker layer to its concrete shape (Partial
  // becomes an object literal with all-optional props, Pick becomes
  // an object literal with a subset, etc.), so our existing object /
  // union / tuple / string emits handle the resolved forms. These
  // tests are regression coverage that the utilities thread through
  // the cache + emit pipeline without surprises.
  UTILITY: {
    partial: {
      title: 'Partial<Person>',
      description: 'mion utility/partial.spec.ts — all properties become optional. Resolves to {name?: string; age?: number; createdAt?: Date}; reuses the object emit with allOptionalCode array-rejection guard.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<Partial<Person>>();
      },
      getSamples: () => ({
        valid: [
          {},
          {name: 'John'},
          {createdAt: new Date()},
          {name: 'John', age: 30, createdAt: new Date()},
        ],
        invalid: [
          [],                              // allOptionalCode rejects arrays
          new Date(),                      // allOptionalCode rejects native objects
          {name: 42},                      // wrong type when prop is present
          {createdAt: 'not date'},
          null,
        ],
      }),
    },

    required: {
      title: 'Required<MaybePerson>',
      description: 'mion utility/required.spec.ts — all properties become required. Resolves to a plain object literal; reuses the object emit.',
      isType: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        return createIsType<Required<MaybePerson>>();
      },
      getSamples: () => ({
        valid: [{name: 'John', age: 30, createdAt: new Date()}],
        invalid: [
          {},
          {name: 'John'},                                 // missing age + createdAt
          {name: 'John', age: 30},                        // missing createdAt
          {name: 'John', age: 30, createdAt: 'not date'}, // wrong type
          null,
        ],
      }),
    },

    pick: {
      title: "Pick<Person, 'name' | 'createdAt'>",
      description: 'mion utility/pick.spec.ts — selects a subset of properties. Resolves to {name: string; createdAt: Date}.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<Pick<Person, 'name' | 'createdAt'>>();
      },
      getSamples: () => ({
        valid: [
          {name: 'John', createdAt: new Date()},
          // Extra props pass (Pick doesn't imply strict)
          {name: 'John', age: 30, createdAt: new Date()},
        ],
        invalid: [
          {name: 'John'},          // missing createdAt
          {createdAt: new Date()}, // missing name
          {name: 42, createdAt: new Date()},
          null,
        ],
      }),
    },

    omit: {
      title: "Omit<Person, 'age'>",
      description: 'mion utility/omit.spec.ts — removes selected properties. Resolves to {name: string; createdAt: Date}.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<Omit<Person, 'age'>>();
      },
      getSamples: () => ({
        valid: [
          {name: 'John', createdAt: new Date()},
          {name: 'John', age: 30, createdAt: new Date()}, // extra prop still passes
        ],
        invalid: [{name: 'John'}, {createdAt: new Date()}, null],
      }),
    },

    exclude_atomic: {
      title: "Exclude<'name' | 'age' | 'createdAt', 'age'>",
      description: 'mion utility/exclude.spec.ts (atomic case) — excludes union members. Resolves to "name" | "createdAt".',
      isType: () => createIsType<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
      getSamples: () => ({
        valid: ['name', 'createdAt'],
        invalid: ['age', 'other', 42, null],
      }),
    },

    extract_atomic: {
      title: "Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>",
      description: 'mion utility/extract.spec.ts (atomic case) — extracts matching union members. Resolves to "name" | "createdAt".',
      isType: () => createIsType<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      getSamples: () => ({
        valid: ['name', 'createdAt'],
        invalid: ['age', 'other', null],
      }),
    },

    exclude_from_object_union: {
      title: "Exclude<Shape, {kind: 'circle'}>",
      description: 'mion utility/exclude.spec.ts (object union) — excludes object members from a discriminated union.',
      isType: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        return createIsType<Exclude<Shape, {kind: 'circle'}>>();
      },
      getSamples: () => ({
        valid: [
          {kind: 'square', x: 5},
          {kind: 'triangle', base: 4, height: 3},
        ],
        invalid: [{kind: 'circle', radius: 3}, {}, null],
      }),
    },

    non_nullable: {
      title: 'NonNullable<string | number | null | undefined>',
      description: 'mion utility/nonNullable.spec.ts — removes null + undefined from a union.',
      isType: () => createIsType<NonNullable<string | number | null | undefined>>(),
      getSamples: () => ({
        valid: ['hello', 42, 0],
        invalid: [null, undefined, true, {}, []],
      }),
    },

    return_type: {
      title: 'ReturnType<(...) => Date>',
      description: 'mion utility/params-return.spec.ts — extracts a function\'s return type. Resolves to Date.',
      isType: () => {
        type Fn = (a: number, b: boolean) => Date;
        return createIsType<ReturnType<Fn>>();
      },
      getSamples: () => ({
        valid: [new Date()],
        invalid: ['not date', 42, null, undefined],
      }),
    },

    readonly: {
      title: 'Readonly<Person>',
      description: 'Readonly<T> marks properties readonly at the TS layer; the readonly bit is erased at runtime so the validator behaves identically to the source object. Regression check.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
        }
        return createIsType<Readonly<Person>>();
      },
      getSamples: () => ({
        valid: [{name: 'John', age: 30}, {name: '', age: 0}],
        invalid: [{name: 'John'}, {age: 30}, null],
      }),
    },

    uppercase: {
      title: "Uppercase<'foo'>",
      description: "TS's built-in Uppercase<S> maps the literal — resolves to the literal type 'FOO'. mion's utility/string.spec.ts is `.skip()`'d so this is bonus coverage on top of mion.",
      isType: () => createIsType<Uppercase<'foo'>>(),
      getSamples: () => ({
        valid: ['FOO'],
        invalid: ['foo', 'Foo', 'FOOBAR', 42, null],
      }),
    },

    intersection_with_required_override: {
      title: "Partial<Person> & Required<Pick<Person, 'name'>>",
      description: 'Intersection that flips a property\'s optionality — `Partial<Person>` makes all props optional, then `& Required<Pick<Person, "name">>` re-requires only `name`. tsgo resolves the intersection to {name: string; age?: number; createdAt?: Date}; reuses the object emit.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<Partial<Person> & Required<Pick<Person, 'name'>>>();
      },
      getSamples: () => ({
        valid: [
          {name: 'John'},
          {name: 'John', age: 30},
          {name: 'John', createdAt: new Date()},
          {name: 'John', age: 30, createdAt: new Date()},
        ],
        invalid: [
          {},                      // name is required
          {age: 30},               // name still required
          {name: 42},              // wrong type
          {name: 'John', age: '30'}, // wrong type at optional slot
          null,
        ],
      }),
    },

    omit_keeping_optional: {
      title: "Omit<{a: string; b?: number; c: boolean}, 'a'>",
      description: 'Omit preserves the optionality of remaining properties — resolves to {b?: number; c: boolean}.',
      isType: () => createIsType<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
      getSamples: () => ({
        valid: [{c: true}, {b: 1, c: false}, {c: true, b: undefined}],
        invalid: [{}, {b: 1}, {c: 'not boolean'}, null],
      }),
    },
  },
} as const satisfies {
  ATOMIC: Record<string, ValidationCase>;
  ARRAY: Record<string, ValidationCase>;
  OBJECT: Record<string, ValidationCase>;
  TUPLE: Record<string, ValidationCase>;
  UNION: Record<string, ValidationCase>;
  TEMPLATE_LITERAL: Record<string, ValidationCase>;
  NATIVE: Record<string, ValidationCase>;
  UTILITY: Record<string, ValidationCase>;
};
