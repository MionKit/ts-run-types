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
} as const satisfies {ATOMIC: Record<string, ValidationCase>};
