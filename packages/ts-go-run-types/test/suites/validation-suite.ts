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
      description: "mion array.spec.ts 'test array strict modes' — needs interface/object literal support before isType activates",
      // No isType thunk → rendered as `it.todo` in the adapter.
      getSamples: () => ({
        valid: [
          [],
          [{a: 'hello'}, {a: 'world'}],
          // mion Block 7: arrWithExtraDeep — array of objects with
          // extra keys still PASSES isType in mion (unknown keys are
          // a separate concern). Captured here so the future object
          // adapter's expectations are correct.
          [{a: 'hello', extraA: 'extraA'}, {a: 'world'}],
        ],
        invalid: ['not-an-array', [{a: 42}]],
      }),
    },

    union_array: {
      title: '(string | number)[]',
      description: 'needs union support',
      getSamples: () => ({
        valid: [[], ['a', 1, 'b', 2]],
        invalid: [[true], 'a'],
      }),
    },

    tuple_array: {
      title: '[string, number][]',
      description: 'needs tuple support',
      getSamples: () => ({
        valid: [[], [['a', 1], ['b', 2]]],
        invalid: [[['a']], [['a', 'b']]],
      }),
    },

    circular_array: {
      title: 'CircularArray',
      description:
        "mion array.spec.ts 'Array circular ref' — needs circular-type detection in the serializer + self-recursive dependency call (mion emits ${hash}(args) without .fn for self)",
      getSamples: () => {
        // type CircularArray = CircularArray[]; const arr: CircularArray = [[[[]]], [[]], []];
        const arrA: any = [];
        arrA.push([[[]]], [[]], []);
        const arrInvalidNested: any = [];
        arrInvalidNested.push([[['A']]]); // mion Block 17 invalid case
        return {
          valid: [[], arrA],
          invalid: [[[[]], 'A'], arrInvalidNested],
        };
      },
    },

    circular_object_with_array: {
      title: 'ObjectType (mion Block 13)',
      description:
        'type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]} — needs object + recursive-type support',
      getSamples: () => ({
        valid: [
          {a: 'hello'},
          {a: 'hello', deep: {b: 'world', c: 123}},
          {a: 'hello', d: [{a: 'world'}]},
        ],
        invalid: [{a: 42}, 'not-an-object'],
      }),
    },

    symbol_array: {
      title: 'symbol[]',
      description:
        "mion ARRAYS.non_serializable_in_array — emits a compile-time error in mion ('Arrays can not have non serializable types'). Not testable via runtime samples; the Go-side guard lives in serialize/emit",
      getSamples: () => ({
        valid: [],
        invalid: [[Symbol('a')]],
      }),
    },
  },
} as const satisfies {ATOMIC: Record<string, ValidationCase>; ARRAY: Record<string, ValidationCase>};
