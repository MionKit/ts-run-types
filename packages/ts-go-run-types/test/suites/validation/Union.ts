import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const UNION = {
  atomic_union: {
    title: 'Union of common atomic types (with Date and bigint)',
    description: 'mion union.spec.ts "validate union" — Atomic Union suite',
    validateNotes: [
      'Validates as an OR-chain — first matching arm wins.',
      'Each arm runs its full atomic check: numbers reject NaN / Infinity, Dates reject Invalid Date, etc.',
    ],
    validate: () => createValidate<Date | number | string | null | bigint>(),
    validateDataOnly: () => createValidate<DataOnly<Date | number | string | null | bigint>>(),
    validateSchema: () => createValidate(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
    deserializeValidate: () => deserializeValidate<Date | number | string | null | bigint>(),
    validateReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Date | number | string | null | bigint>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Date | number | string | null | bigint>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Date | number | string | null | bigint>(),
    getValidationErrorsReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Date | number | string | null | bigint>(),
    mockTypeReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [new Date(), 123, 'hello', null, 1n],
      invalid: [{}, [], true, undefined, new Date('invalid'), Infinity, Symbol(), () => null],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  string_literal_union: {
    title: 'Union of string literals (case-sensitive)',
    description: 'mion union.spec.ts "validate union discriminator string"',
    validateNotes: 'Literal string unions are case-sensitive. Only the exact strings declared in the union pass.',
    validate: () => createValidate<'UNO' | 'DOS' | 'TRES'>(),
    validateDataOnly: () => createValidate<DataOnly<'UNO' | 'DOS' | 'TRES'>>(),
    validateSchema: () => createValidate(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
    deserializeValidate: () => deserializeValidate<'UNO' | 'DOS' | 'TRES'>(),
    validateReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<'UNO' | 'DOS' | 'TRES'>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<'UNO' | 'DOS' | 'TRES'>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<'UNO' | 'DOS' | 'TRES'>(),
    getValidationErrorsReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<'UNO' | 'DOS' | 'TRES'>(),
    mockTypeReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['UNO', 'DOS', 'TRES'],
      invalid: ['INVALID', 'uno', '', 42, null, undefined, true, 'Uno', {}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  large_union_eight_arms: {
    title: 'Large union (8 heterogeneous arms) — value-first infer fallback',
    description:
      'Past the 4 positional union() overloads, the value-first builder routes through the recursive UnionOf<T> infer fallback. 8 arms (literals + primitives + a {a}/{a;b} subset+superset pair) verify the fallback BOTH generates a correct validator AND converges on the type-first union id — preserving the subset/superset arms (no subtype collapse) at depth 8.',
    validate: () => createValidate<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    validateDataOnly: () =>
      createValidate<DataOnly<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>>(),
    validateSchema: () =>
      createValidate(
        RT.union([
          RT.literal('a'),
          RT.literal('b'),
          RT.number(),
          RT.boolean(),
          RT.literal(null),
          RT.object({a: RT.string()}),
          RT.object({a: RT.string(), b: RT.number()}),
          RT.object({c: RT.bigint()}),
        ])
      ),
    deserializeValidate: () =>
      deserializeValidate<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    validateReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrors<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([
          RT.literal('a'),
          RT.literal('b'),
          RT.number(),
          RT.boolean(),
          RT.literal(null),
          RT.object({a: RT.string()}),
          RT.object({a: RT.string(), b: RT.number()}),
          RT.object({c: RT.bigint()}),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    getValidationErrorsReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint}>(),
    mockTypeReflect: () => {
      const v: 'a' | 'b' | number | boolean | null | {a: string} | {a: string; b: number} | {c: bigint} = 'a';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['a', 'b', 42, true, null, {a: 'x'}, {a: 'x', b: 1}, {c: 10n}],
      invalid: ['z', 'true', undefined, [], {}, {b: 1}, {a: 1}, {c: 'x'}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  string_or_number: {
    title: 'Two-arm union of string and number',
    validate: () => createValidate<string | number>(),
    validateDataOnly: () => createValidate<DataOnly<string | number>>(),
    validateSchema: () => createValidate(RT.union([RT.string(), RT.number()])),
    deserializeValidate: () => deserializeValidate<string | number>(),
    validateReflect: () => {
      const v: string | number = 'hello';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string | number = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<string | number>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string | number>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.union([RT.string(), RT.number()])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string | number>(),
    getValidationErrorsReflect: () => {
      const v: string | number = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string | number = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<string | number>(),
    mockTypeReflect: () => {
      const v: string | number = 'hello';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['hello', 42, 0, ''],
      invalid: [null, undefined, true, [], {}, NaN, Infinity, BigInt(1)],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_of_array_types: {
    title: 'Union of array types (whole-array dispatch)',
    description: 'mion union.spec.ts "Union Arr"',
    validateNotes:
      'Mixed-element arrays (e.g., `["a", 1]`) FAIL — no single arm matches the whole array. The union is over array types, not element types.',
    validate: () => createValidate<string[] | number[] | boolean[]>(),
    validateDataOnly: () => createValidate<DataOnly<string[] | number[] | boolean[]>>(),
    validateSchema: () => createValidate(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean())])),
    deserializeValidate: () => deserializeValidate<string[] | number[] | boolean[]>(),
    validateReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<string[] | number[] | boolean[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string[] | number[] | boolean[]>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean())])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string[] | number[] | boolean[]>(),
    getValidationErrorsReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<string[] | number[] | boolean[]>(),
    mockTypeReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [['a'], [1], [true, false], [], ['a', 'b']],
      invalid: [['a', 1], [1, 'a'], 'not array', null, undefined, [Infinity], [null], [BigInt(1)]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  array_of_union: {
    title: 'Array whose element type is a union',
    description: 'mion union.spec.ts "Arr with union of types"',
    validateNotes:
      'Each element runs the full union OR-chain independently. Mixed-type arrays pass as long as every element matches some arm.',
    validate: () => createValidate<(string | bigint | boolean | Date)[]>(),
    validateDataOnly: () => createValidate<DataOnly<(string | bigint | boolean | Date)[]>>(),
    validateSchema: () => createValidate(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
    deserializeValidate: () => deserializeValidate<(string | bigint | boolean | Date)[]>(),
    validateReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<(string | bigint | boolean | Date)[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<(string | bigint | boolean | Date)[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<(string | bigint | boolean | Date)[]>(),
    getValidationErrorsReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<(string | bigint | boolean | Date)[]>(),
    mockTypeReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[1n, 'b', new Date(), true]],
      invalid: [
        ['a', false, 2], // 2 is a number, not bigint
        null,
        undefined,
        [new Date('invalid')], // Invalid Date inside union
        [null], // null not in union
        [{}],
      ],
    }),
    getExpectedErrors: () => [
      // Element at index 2 (the number 2) fails the union check.
      [{path: [2], expected: 'union'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'union'}],
      [{path: [0], expected: 'union'}],
      [{path: [0], expected: 'union'}],
    ],
  },

  // ---- DEFERRED ----

  union_of_object_shapes: {
    title: 'Union of disjoint object shapes',
    description:
      "mion union.spec.ts 'Union Obj'. Object-typed union members go through the dependency-call layer with the shared `typeof === 'object' && !== null` guard lifted out of the OR-chain.",
    validate: () => createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    validateDataOnly: () => createValidate<DataOnly<{a: string; aa: boolean} | {b: number} | {c: bigint}>>(),
    validateSchema: () =>
      createValidate(
        RT.union([RT.object({a: RT.string(), aa: RT.boolean()}), RT.object({b: RT.number()}), RT.object({c: RT.bigint()})])
      ),
    deserializeValidate: () => deserializeValidate<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    validateReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{a: string; aa: boolean} | {b: number} | {c: bigint}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([RT.object({a: RT.string(), aa: RT.boolean()}), RT.object({b: RT.number()}), RT.object({c: RT.bigint()})])
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    mockTypeReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return createMockType(v);
    },
    getSamples: () => ({
      // mion union.spec.ts uses loose matching — `{a, b, c}` passes
      // because `{b: number}` is satisfied. Our emit accepts any
      // object that satisfies AT LEAST one member's required props.
      valid: [{a: 'x', aa: true}, {b: 1}, {c: 1n}, {a: 'x', aa: true, b: 1}],
      invalid: [{a: 'x'}, {}, 'not object', null, [], 42, undefined, {b: 'not number'}, {c: 1}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  discriminated_union: {
    title: 'Discriminated union (shared kind literal, different payloads)',
    description:
      'mion union.spec.ts "Union with discriminator property" — the OR-chain is semantically correct; the discriminator-aware optimization (early-return on the discriminator literal) is a separate emit-shape concern handled later.',
    validateNotes:
      'Each arm is validated in full; the discriminator literal narrows which arm matches. A value passes if it fully satisfies AT LEAST ONE arm.',
    validate: () => createValidate<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    validateDataOnly: () => createValidate<DataOnly<{kind: 'a'; n: number} | {kind: 'b'; s: string}>>(),
    validateSchema: () =>
      createValidate(
        RT.union([RT.object({kind: RT.literal('a'), n: RT.number()}), RT.object({kind: RT.literal('b'), s: RT.string()})])
      ),
    deserializeValidate: () => deserializeValidate<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    validateReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{kind: 'a'; n: number} | {kind: 'b'; s: string}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([RT.object({kind: RT.literal('a'), n: RT.number()}), RT.object({kind: RT.literal('b'), s: RT.string()})])
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    getValidationErrorsReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    mockTypeReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {kind: 'a', n: 1},
        {kind: 'b', s: 'hello'},
      ],
      invalid: [
        {kind: 'c', n: 1},
        {kind: 'a', n: 'not number'},
        {n: 1},
        null,
        'not object',
        undefined,
        {kind: 'a'}, // missing n
        {kind: 'a', n: NaN},
        {kind: 'b'}, // missing s
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  circular_union: {
    title: 'Self-referential union via object and array arms',
    description:
      'mion union.spec.ts "Union circular". Handled via always-non-inlined Union + Object + Array (no IsCircular detection needed; the dependency-call layer terminates via the lazy-init two-phase cache registration).',
    validateNotes: 'Self-recursive unions traverse the cycle until the input value bottoms out at an atomic arm.',
    validateSchema: () => {
      const uc = RT.circular((self) =>
        RT.union([
          RT.date(),
          RT.number(),
          RT.string(),
          RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
          RT.array(self),
        ])
      );
      return createValidate(uc);
    },
    validate: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createValidate<UnionC>();
    },
    validateDataOnly: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createValidate<DataOnly<UnionC>>();
    },
    deserializeValidate: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return deserializeValidate<UnionC>();
    },
    validateReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createGetValidationErrors<UnionC>();
    },
    getValidationErrorsDataOnly: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createGetValidationErrors<DataOnly<UnionC>>();
    },
    getValidationErrorsSchema: () => {
      const uc = RT.circular((self) =>
        RT.union([
          RT.date(),
          RT.number(),
          RT.string(),
          RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
          RT.array(self),
        ])
      );
      return createGetValidationErrors(uc);
    },
    deserializeGetValidationErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return deserializeGetValidationErrors<UnionC>();
    },
    getValidationErrorsReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createMockType<UnionC>();
    },
    mockTypeReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [new Date(), 123, 'hello', {}, {a: {a: {}}}, {b: 'hello'}, [], [{a: {}}, [123, 'hello']]],
      invalid: [true, null, undefined, {a: true}, [true], new Date('invalid'), Infinity, Symbol()],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_with_methods: {
    title: 'Union of object arms each carrying a method',
    description:
      'mion union.spec.ts "Union with objects containing methods" — methods are skipped from each branch via the property-emit function-skip rule (the AND chain inside each object reduces to the data-only props).',
    validate: () => createValidate<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    validateDataOnly: () => createValidate<DataOnly<{name: string; getName(): string} | {age: number; getAge(): number}>>(),
    validateSchema: () =>
      createValidate(
        RT.union([
          RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
          RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
        ])
      ),
    deserializeValidate: () => deserializeValidate<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    validateReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<{name: string; getName(): string} | {age: number; getAge(): number}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([
          RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
          RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    getValidationErrorsReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    mockTypeReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{name: 'x', getName: () => 'x'}, {age: 1, getAge: () => 1}, {name: 'x'}, {age: 1}],
      invalid: [{}, null, 'not object', [], undefined, true, 42, {name: 1}, {age: 'x'}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  intersection_to_object: {
    title: 'Intersection of object shapes (resolved to one merged shape)',
    description:
      'mion intersection.spec.ts — tsgo / deepkit resolves intersections to ObjectLiteral at the type-checker level, so the cache never carries a KindIntersection that needs validation. Runtime behavior matches `{a: string; b: number}` byte-for-byte.',
    validate: () => createValidate<{a: string} & {b: number}>(),
    validateDataOnly: () => createValidate<DataOnly<{a: string} & {b: number}>>(),
    validateSchema: () => createValidate(RT.intersection(RT.object({a: RT.string()}), RT.object({b: RT.number()}))),
    deserializeValidate: () => deserializeValidate<{a: string} & {b: number}>(),
    validateReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: string} & {b: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{a: string} & {b: number}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.intersection(RT.object({a: RT.string()}), RT.object({b: RT.number()}))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: string} & {b: number}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{a: string} & {b: number}>(),
    mockTypeReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: '', b: 0},
      ],
      invalid: [{a: 'x'}, {b: 1}, null, {a: 1, b: 1}, {a: 'x', b: 'not number'}, undefined, {a: 'x', b: NaN}, {}],
    }),
    // Intersection resolved to `{a: string; b: number}` — validationErrors
    // is the merged object shape's per-property check.
    getExpectedErrors: () => [
      [{path: ['b'], expected: 'number'}],
      [{path: ['a'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['a'], expected: 'string'}],
      [{path: ['b'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['b'], expected: 'number'}],
      [
        {path: ['a'], expected: 'string'},
        {path: ['b'], expected: 'number'},
      ],
    ],
  },

  // ---- additions migrated 1:1 from mion union.spec.ts ----

  union_with_index_arm: {
    title: 'Union where one arm carries an index signature',
    description:
      "mion union.spec.ts 'validate an union with index property' — arm carries a named prop AND an index signature; index-typed extras are accepted alongside the named prop.",
    validate: () => createValidate<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    validateDataOnly: () => createValidate<DataOnly<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>>(),
    validateSchema: () =>
      createValidate(
        RT.union([
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.bigint()), RT.object({c: RT.bigint()})),
        ])
      ),
    deserializeValidate: () => deserializeValidate<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    validateReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.bigint()), RT.object({c: RT.bigint()})),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    getValidationErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    mockTypeReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{a: 'hello', aa: true}, {b: 123}, {c: 1n, d: 2n}],
      invalid: [
        {a: 'hello'}, // missing aa, no b, no c
        {b: 'hello'}, // wrong type for b
        {a: 'hello', d: 'extra'}, // doesn't match any arm
        {c: 1n, d: 'hello'}, // index value wrong type
        null,
        undefined,
        {}, // empty matches no arm
        {b: NaN}, // b is number but NaN fails
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_same_prop_different_types: {
    title: 'Discriminated union sharing one prop with arm-dependent type',
    description:
      "mion union.spec.ts 'validate union same prop with different types' — same prop name (`prop`) carries an arm-dependent value type, gated by the literal-string discriminator.",
    validate: () => createValidate<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    validateDataOnly: () =>
      createValidate<DataOnly<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>>(),
    validateSchema: () =>
      createValidate(
        RT.union([
          RT.object({type: RT.literal('a'), prop: RT.boolean()}),
          RT.object({type: RT.literal('b'), prop: RT.number()}),
          RT.object({type: RT.literal('c'), prop: RT.string()}),
        ])
      ),
    deserializeValidate: () =>
      deserializeValidate<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    validateReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrors<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([
          RT.object({type: RT.literal('a'), prop: RT.boolean()}),
          RT.object({type: RT.literal('b'), prop: RT.number()}),
          RT.object({type: RT.literal('c'), prop: RT.string()}),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    getValidationErrorsReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    mockTypeReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {type: 'a', prop: true},
        {type: 'b', prop: 123},
        {type: 'c', prop: 'hello'},
      ],
      invalid: [
        {type: 'a', prop: 123},
        {type: 'b', prop: 'hello'},
        {type: 'c', prop: true},
        null,
        undefined,
        {type: 'a'}, // missing prop
        {prop: true}, // missing type
        {type: 'd', prop: true}, // invalid discriminator
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_mixed_arrays_and_objects: {
    title: 'Union mixing array types and object shapes',
    description:
      "mion union.spec.ts 'Union Mixed' — arrays and objects in the same union; the OR-chain dispatches on shape (Array.isArray vs object typeof).",
    validate: () =>
      createValidate<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    validateDataOnly: () =>
      createValidate<
        DataOnly<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>
      >(),
    validateSchema: () =>
      createValidate(
        RT.union([
          RT.array(RT.string()),
          RT.array(RT.number()),
          RT.array(RT.boolean()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint(), aa: RT.literal('string')}),
        ])
      ),
    deserializeValidate: () =>
      deserializeValidate<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    validateReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrors<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([
          RT.array(RT.string()),
          RT.array(RT.number()),
          RT.array(RT.boolean()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint(), aa: RT.literal('string')}),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >(),
    getValidationErrorsReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return deserializeGetValidationErrors(v);
    },
    mockType: () =>
      createMockType<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    mockTypeReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        ['a', 'b', 'c'],
        [1, 2, 3],
        [true, false],
        {a: 'hello', aa: true},
        {b: 123, c: 123n}, // matches {b: number}, extra c allowed
      ],
      invalid: [
        [1, 'b'], // mixed-type array — no array arm matches
        {}, // empty object
        {a: 'hello', d: 'world'}, // missing aa, no other match
        null,
        undefined,
        [null],
        'not in any arm',
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_merged_property: {
    title: 'Union of shapes sharing a prop with different value types',
    description:
      "mion union.spec.ts 'validate union with merged properties' — single shared prop with different value types; `a` accepts boolean OR number.",
    validate: () => createValidate<{a: boolean} | {a: number}>(),
    validateDataOnly: () => createValidate<DataOnly<{a: boolean} | {a: number}>>(),
    validateSchema: () => createValidate(RT.union([RT.object({a: RT.boolean()}), RT.object({a: RT.number()})])),
    deserializeValidate: () => deserializeValidate<{a: boolean} | {a: number}>(),
    validateReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: boolean} | {a: number}>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{a: boolean} | {a: number}>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.union([RT.object({a: RT.boolean()}), RT.object({a: RT.number()})])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: boolean} | {a: number}>(),
    getValidationErrorsReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<{a: boolean} | {a: number}>(),
    mockTypeReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{a: true}, {a: false}, {a: 123}, {a: 0}],
      invalid: [{a: 'hello'}, {}, null, undefined, {a: 'string not boolean or number'}, {a: null}, {a: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_mixed_with_index: {
    title: 'Union mixing arrays, plain objects, and index-signature shapes',
    description:
      "mion union.spec.ts 'Union mixed with index property' — arrays + objects (some with index signatures) in the same union.",
    validate: () =>
      createValidate<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    validateDataOnly: () =>
      createValidate<
        DataOnly<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >
      >(),
    validateSchema: () =>
      createValidate(
        RT.union([
          RT.array(RT.string()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
          RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
        ])
      ),
    deserializeValidate: () =>
      deserializeValidate<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    validateReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return deserializeValidate(v);
    },
    getValidationErrors: () =>
      createGetValidationErrors<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([
          RT.array(RT.string()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
          RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
        ])
      ),
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    getValidationErrorsReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return deserializeGetValidationErrors(v);
    },
    mockType: () =>
      createMockType<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    mockTypeReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        ['a', 'b', 'c'],
        {a: 'hello', aa: true},
        {b: 123, a: 'world'}, // matches {b: number}
        {b: 1n, c: 2n}, // matches {[k]: bigint; b: bigint}
        {a: 'hello', aa: true, j: 'extra'},
      ],
      invalid: [[1, 'b'], {}, {a: 'hello', b: 123n}, null, undefined, [null]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_with_any_fallback: {
    title: 'Union with an `any` arm (collapses to any)',
    description:
      "mion union.spec.ts 'support union with any type' — tsgo collapses `T | any` to `any`, so any value passes (the validator is effectively a no-op true).",
    validateNotes:
      '`T | any` collapses to `any` at the type-checker layer — the validator becomes a no-op that always returns true. `T | unknown` behaves the same way. If you want a real fallback that still narrows, use a concrete sibling type.',
    validate: () => createValidate<string | any>(),
    validateDataOnly: () => createValidate<DataOnly<string | any>>(),
    validateSchema: () => createValidate(RT.any()),
    deserializeValidate: () => deserializeValidate<string | any>(),
    validateReflect: () => {
      const v: string | any = 'hello';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string | any = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<string | any>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string | any>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.any()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string | any>(),
    getValidationErrorsReflect: () => {
      const v: string | any = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string | any = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<string | any>(),
    mockTypeReflect: () => {
      const v: string | any = 'hello';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['hello', 123, {foo: 'bar'}, null, undefined, true, []],
      invalid: [],
    }),
    // `T | any` collapses to `any` — no errors are emitted for any input.
    getExpectedErrors: () => [],
  },

  union_with_unknown_fallback: {
    title: 'Union with an `unknown` arm (collapses to unknown)',
    description:
      "mion union.spec.ts 'support union with unknown type' — tsgo collapses `T | unknown` to `unknown`, so any value passes.",
    validate: () => createValidate<string | unknown>(),
    validateDataOnly: () => createValidate<DataOnly<string | unknown>>(),
    validateSchema: () => createValidate(RT.unknown()),
    deserializeValidate: () => deserializeValidate<string | unknown>(),
    validateReflect: () => {
      const v: string | unknown = 'hello';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string | unknown = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<string | unknown>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string | unknown>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.unknown()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string | unknown>(),
    getValidationErrorsReflect: () => {
      const v: string | unknown = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string | unknown = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<string | unknown>(),
    mockTypeReflect: () => {
      const v: string | unknown = 'hello';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['hello', 123, {foo: 'bar'}, null, undefined, true, []],
      invalid: [],
    }),
    getExpectedErrors: () => [],
  },

  union_subset_small_first: {
    title: 'Union with the smaller arm declared before its superset',
    description:
      "mion union.spec.ts 'sortUnreachableTypes' — `{a}` defined before `{a; b}`. Both arms must be reachable: matching SmallObj must not swallow LargeObj-shaped inputs (semantically the same since either arm matching returns true, but pins the regression).",
    validateNotes:
      'When one arm is a subset of another (e.g., `{a}` and `{a; b}`), any value satisfying the smaller arm passes — even if extra props would also satisfy the larger arm. Order in the type union does not affect the result.',
    validate: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createValidate<SmallObj | LargeObj>();
    },
    validateDataOnly: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createValidate<DataOnly<SmallObj | LargeObj>>();
    },
    validateSchema: () => createValidate(RT.union([RT.object({a: RT.string()}), RT.object({a: RT.string(), b: RT.number()})])),
    deserializeValidate: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return deserializeValidate<SmallObj | LargeObj>();
    },
    validateReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createGetValidationErrors<SmallObj | LargeObj>();
    },
    getValidationErrorsDataOnly: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createGetValidationErrors<DataOnly<SmallObj | LargeObj>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.union([RT.object({a: RT.string()}), RT.object({a: RT.string(), b: RT.number()})])),
    deserializeGetValidationErrors: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return deserializeGetValidationErrors<SmallObj | LargeObj>();
    },
    getValidationErrorsReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createMockType<SmallObj | LargeObj>();
    },
    mockTypeReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{a: 'hello'}, {a: 'hello', b: 123}],
      // Note: `{a: 'hello', b: <anything>}` passes the SmallObj arm
      // (structural typing — extra props allowed). Only samples that
      // miss BOTH arms' required-prop sets belong here.
      invalid: [{b: 123}, {a: 123}, {}, null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_subset_nested_levels: {
    title: 'Union with a three-level subset chain',
    description:
      "mion union.spec.ts 'multiple levels of subset relationships' — three arms, each a strict superset of the previous.",
    validate: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createValidate<Tiny | Medium | Large>();
    },
    validateDataOnly: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createValidate<DataOnly<Tiny | Medium | Large>>();
    },
    validateSchema: () =>
      createValidate(
        RT.union([
          RT.object({x: RT.string()}),
          RT.object({x: RT.string(), y: RT.number()}),
          RT.object({x: RT.string(), y: RT.number(), z: RT.boolean()}),
        ])
      ),
    deserializeValidate: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return deserializeValidate<Tiny | Medium | Large>();
    },
    validateReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createGetValidationErrors<Tiny | Medium | Large>();
    },
    getValidationErrorsDataOnly: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createGetValidationErrors<DataOnly<Tiny | Medium | Large>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([
          RT.object({x: RT.string()}),
          RT.object({x: RT.string(), y: RT.number()}),
          RT.object({x: RT.string(), y: RT.number(), z: RT.boolean()}),
        ])
      ),
    deserializeGetValidationErrors: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return deserializeGetValidationErrors<Tiny | Medium | Large>();
    },
    getValidationErrorsReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      return createMockType<Tiny | Medium | Large>();
    },
    mockTypeReflect: () => {
      interface Tiny {
        x: string;
      }
      interface Medium {
        x: string;
        y: number;
      }
      interface Large {
        x: string;
        y: number;
        z: boolean;
      }
      const v: Tiny | Medium | Large = {x: 'hello'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{x: 'hello'}, {x: 'hello', y: 123}, {x: 'hello', y: 123, z: true}],
      // Note: `{x: 'hello', ...}` passes the Tiny arm regardless of
      // y/z values (structural typing — extra props allowed). Only
      // samples that miss EVERY arm's required-prop set belong here.
      invalid: [{}, {y: 123}, {z: true}, {x: 1}, null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  union_subset_mixed_related_unrelated: {
    title: 'Union mixing a subset pair with a disjoint arm',
    description:
      "mion union.spec.ts 'mixed related and unrelated types' — Base and Extended are subset-related, Unrelated is disjoint.",
    validate: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createValidate<Base | Extended | Unrelated>();
    },
    validateDataOnly: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createValidate<DataOnly<Base | Extended | Unrelated>>();
    },
    validateSchema: () =>
      createValidate(
        RT.union([RT.object({id: RT.string()}), RT.object({id: RT.string(), name: RT.string()}), RT.object({value: RT.number()})])
      ),
    deserializeValidate: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return deserializeValidate<Base | Extended | Unrelated>();
    },
    validateReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createGetValidationErrors<Base | Extended | Unrelated>();
    },
    getValidationErrorsDataOnly: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createGetValidationErrors<DataOnly<Base | Extended | Unrelated>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.union([RT.object({id: RT.string()}), RT.object({id: RT.string(), name: RT.string()}), RT.object({value: RT.number()})])
      ),
    deserializeGetValidationErrors: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return deserializeGetValidationErrors<Base | Extended | Unrelated>();
    },
    getValidationErrorsReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      return createMockType<Base | Extended | Unrelated>();
    },
    mockTypeReflect: () => {
      interface Base {
        id: string;
      }
      interface Extended {
        id: string;
        name: string;
      }
      interface Unrelated {
        value: number;
      }
      const v: Base | Extended | Unrelated = {id: '123'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{id: '123'}, {id: '123', name: 'test'}, {value: 42}],
      invalid: [{}, {name: 'test'}, {id: 123}, {value: 'not number'}, null, undefined, {value: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
