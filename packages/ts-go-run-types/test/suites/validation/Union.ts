import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const UNION = {
  atomic_union: {
    title: 'Union of common atomic types (with Date and bigint)',
    description: 'mion union.spec.ts "validate union" — Atomic Union suite',
    isTypeNotes: [
      'Validates as an OR-chain — first matching arm wins.',
      'Each arm runs its full atomic check: numbers reject NaN / Infinity, Dates reject Invalid Date, etc.',
    ],
    isType: () => createIsType<Date | number | string | null | bigint>(),
    isTypeSchema: () => createIsType(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
    deserializeIsType: () => deserializeIsType<Date | number | string | null | bigint>(),
    isTypeReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Date | number | string | null | bigint>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Date | number | string | null | bigint>(),
    getTypeErrorsReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Date | number | string | null | bigint = 123;
      return deserializeGetTypeErrors(v);
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
    isTypeNotes: 'Literal string unions are case-sensitive. Only the exact strings declared in the union pass.',
    isType: () => createIsType<'UNO' | 'DOS' | 'TRES'>(),
    isTypeSchema: () => createIsType(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
    deserializeIsType: () => deserializeIsType<'UNO' | 'DOS' | 'TRES'>(),
    isTypeReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<'UNO' | 'DOS' | 'TRES'>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.union([RT.literal('UNO'), RT.literal('DOS'), RT.literal('TRES')])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<'UNO' | 'DOS' | 'TRES'>(),
    getTypeErrorsReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
      return deserializeGetTypeErrors(v);
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

  string_or_number: {
    title: 'Two-arm union of string and number',
    isType: () => createIsType<string | number>(),
    isTypeSchema: () => createIsType(RT.union([RT.string(), RT.number()])),
    deserializeIsType: () => deserializeIsType<string | number>(),
    isTypeReflect: () => {
      const v: string | number = 'hello';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string | number = 'hello';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<string | number>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.union([RT.string(), RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string | number>(),
    getTypeErrorsReflect: () => {
      const v: string | number = 'hello';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string | number = 'hello';
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      'Mixed-element arrays (e.g., `["a", 1]`) FAIL — no single arm matches the whole array. The union is over array types, not element types.',
    isType: () => createIsType<string[] | number[] | boolean[]>(),
    isTypeSchema: () => createIsType(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean())])),
    deserializeIsType: () => deserializeIsType<string[] | number[] | boolean[]>(),
    isTypeReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<string[] | number[] | boolean[]>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean())])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[] | number[] | boolean[]>(),
    getTypeErrorsReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string[] | number[] | boolean[] = ['a'];
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      'Each element runs the full union OR-chain independently. Mixed-type arrays pass as long as every element matches some arm.',
    isType: () => createIsType<(string | bigint | boolean | Date)[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
    deserializeIsType: () => deserializeIsType<(string | bigint | boolean | Date)[]>(),
    isTypeReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<(string | bigint | boolean | Date)[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<(string | bigint | boolean | Date)[]>(),
    getTypeErrorsReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: (string | bigint | boolean | Date)[] = [];
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    isTypeSchema: () =>
      createIsType(
        RT.union([RT.object({a: RT.string(), aa: RT.boolean()}), RT.object({b: RT.number()}), RT.object({c: RT.bigint()})])
      ),
    deserializeIsType: () => deserializeIsType<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    isTypeReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([RT.object({a: RT.string(), aa: RT.boolean()}), RT.object({b: RT.number()}), RT.object({c: RT.bigint()})])
      ),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
    getTypeErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      'Each arm is validated in full; the discriminator literal narrows which arm matches. A value passes if it fully satisfies AT LEAST ONE arm.',
    isType: () => createIsType<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    isTypeSchema: () =>
      createIsType(
        RT.union([RT.object({kind: RT.literal('a'), n: RT.number()}), RT.object({kind: RT.literal('b'), s: RT.string()})])
      ),
    deserializeIsType: () => deserializeIsType<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    isTypeReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([RT.object({kind: RT.literal('a'), n: RT.number()}), RT.object({kind: RT.literal('b'), s: RT.string()})])
      ),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
    getTypeErrorsReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
      return deserializeGetTypeErrors(v);
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
    isTypeNotes: 'Self-recursive unions traverse the cycle until the input value bottoms out at an atomic arm.',
    isTypeSchema: () => {
      const uc = RT.circular((self) =>
        RT.union([
          RT.date(),
          RT.number(),
          RT.string(),
          RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
          RT.array(self),
        ])
      );
      return createIsType(uc);
    },
    isType: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createIsType<UnionC>();
    },
    deserializeIsType: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return deserializeIsType<UnionC>();
    },
    isTypeReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createGetTypeErrors<UnionC>();
    },
    getTypeErrorsSchema: () => {
      const uc = RT.circular((self) =>
        RT.union([
          RT.date(),
          RT.number(),
          RT.string(),
          RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
          RT.array(self),
        ])
      );
      return createGetTypeErrors(uc);
    },
    deserializeGetTypeErrors: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return deserializeGetTypeErrors<UnionC>();
    },
    getTypeErrorsReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      const v: UnionC = 'hello';
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    isTypeSchema: () =>
      createIsType(
        RT.union([
          RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
          RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
        ])
      ),
    deserializeIsType: () => deserializeIsType<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    isTypeReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([
          RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
          RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
        ])
      ),
    deserializeGetTypeErrors: () =>
      deserializeGetTypeErrors<{name: string; getName(): string} | {age: number; getAge(): number}>(),
    getTypeErrorsReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
        name: 'x',
        getName: () => 'x',
      };
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<{a: string} & {b: number}>(),
    isTypeSchema: () => createIsType(RT.intersection(RT.object({a: RT.string()}), RT.object({b: RT.number()}))),
    deserializeIsType: () => deserializeIsType<{a: string} & {b: number}>(),
    isTypeReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: string} & {b: number}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.intersection(RT.object({a: RT.string()}), RT.object({b: RT.number()}))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string} & {b: number}>(),
    getTypeErrorsReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: string} & {b: number} = {a: 'x', b: 1};
      return deserializeGetTypeErrors(v);
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
    // Intersection resolved to `{a: string; b: number}` — typeErrors
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
    isType: () => createIsType<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    isTypeSchema: () =>
      createIsType(
        RT.union([
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.bigint()), RT.object({c: RT.bigint()})),
        ])
      ),
    deserializeIsType: () => deserializeIsType<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    isTypeReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.bigint()), RT.object({c: RT.bigint()})),
        ])
      ),
    deserializeGetTypeErrors: () =>
      deserializeGetTypeErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
    getTypeErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    isTypeSchema: () =>
      createIsType(
        RT.union([
          RT.object({type: RT.literal('a'), prop: RT.boolean()}),
          RT.object({type: RT.literal('b'), prop: RT.number()}),
          RT.object({type: RT.literal('c'), prop: RT.string()}),
        ])
      ),
    deserializeIsType: () =>
      deserializeIsType<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    isTypeReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return deserializeIsType(v);
    },
    getTypeErrors: () =>
      createGetTypeErrors<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([
          RT.object({type: RT.literal('a'), prop: RT.boolean()}),
          RT.object({type: RT.literal('b'), prop: RT.number()}),
          RT.object({type: RT.literal('c'), prop: RT.string()}),
        ])
      ),
    deserializeGetTypeErrors: () =>
      deserializeGetTypeErrors<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
    getTypeErrorsReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
        type: 'a',
        prop: true,
      };
      return deserializeGetTypeErrors(v);
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
    isType: () =>
      createIsType<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    isTypeSchema: () =>
      createIsType(
        RT.union([
          RT.array(RT.string()),
          RT.array(RT.number()),
          RT.array(RT.boolean()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint(), aa: RT.literal('string')}),
        ])
      ),
    deserializeIsType: () =>
      deserializeIsType<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    isTypeReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return deserializeIsType(v);
    },
    getTypeErrors: () =>
      createGetTypeErrors<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([
          RT.array(RT.string()),
          RT.array(RT.number()),
          RT.array(RT.boolean()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint(), aa: RT.literal('string')}),
        ])
      ),
    deserializeGetTypeErrors: () =>
      deserializeGetTypeErrors<
        string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
      >(),
    getTypeErrorsReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
        'a',
        'b',
        'c',
      ];
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<{a: boolean} | {a: number}>(),
    isTypeSchema: () => createIsType(RT.union([RT.object({a: RT.boolean()}), RT.object({a: RT.number()})])),
    deserializeIsType: () => deserializeIsType<{a: boolean} | {a: number}>(),
    isTypeReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: boolean} | {a: number}>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.union([RT.object({a: RT.boolean()}), RT.object({a: RT.number()})])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: boolean} | {a: number}>(),
    getTypeErrorsReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: boolean} | {a: number} = {a: true};
      return deserializeGetTypeErrors(v);
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
    isType: () =>
      createIsType<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    isTypeSchema: () =>
      createIsType(
        RT.union([
          RT.array(RT.string()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
          RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
        ])
      ),
    deserializeIsType: () =>
      deserializeIsType<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    isTypeReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return deserializeIsType(v);
    },
    getTypeErrors: () =>
      createGetTypeErrors<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([
          RT.array(RT.string()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
          RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
        ])
      ),
    deserializeGetTypeErrors: () =>
      deserializeGetTypeErrors<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    getTypeErrorsReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v:
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint} = ['a'];
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      '`T | any` collapses to `any` at the type-checker layer — the validator becomes a no-op that always returns true. `T | unknown` behaves the same way. If you want a real fallback that still narrows, use a concrete sibling type.',
    isType: () => createIsType<string | any>(),
    isTypeSchema: () => createIsType(RT.any()),
    deserializeIsType: () => deserializeIsType<string | any>(),
    isTypeReflect: () => {
      const v: string | any = 'hello';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string | any = 'hello';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<string | any>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.any()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string | any>(),
    getTypeErrorsReflect: () => {
      const v: string | any = 'hello';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string | any = 'hello';
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<string | unknown>(),
    isTypeSchema: () => createIsType(RT.unknown()),
    deserializeIsType: () => deserializeIsType<string | unknown>(),
    isTypeReflect: () => {
      const v: string | unknown = 'hello';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string | unknown = 'hello';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<string | unknown>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.unknown()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string | unknown>(),
    getTypeErrorsReflect: () => {
      const v: string | unknown = 'hello';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string | unknown = 'hello';
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      'When one arm is a subset of another (e.g., `{a}` and `{a; b}`), any value satisfying the smaller arm passes — even if extra props would also satisfy the larger arm. Order in the type union does not affect the result.',
    isType: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createIsType<SmallObj | LargeObj>();
    },
    isTypeSchema: () => createIsType(RT.union([RT.object({a: RT.string()}), RT.object({a: RT.string(), b: RT.number()})])),
    deserializeIsType: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return deserializeIsType<SmallObj | LargeObj>();
    },
    isTypeReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return createGetTypeErrors<SmallObj | LargeObj>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.union([RT.object({a: RT.string()}), RT.object({a: RT.string(), b: RT.number()})])),
    deserializeGetTypeErrors: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      return deserializeGetTypeErrors<SmallObj | LargeObj>();
    },
    getTypeErrorsReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface SmallObj {
        a: string;
      }
      interface LargeObj {
        a: string;
        b: number;
      }
      const v: SmallObj | LargeObj = {a: 'hello'};
      return deserializeGetTypeErrors(v);
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
    isType: () => {
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
      return createIsType<Tiny | Medium | Large>();
    },
    isTypeSchema: () =>
      createIsType(
        RT.union([
          RT.object({x: RT.string()}),
          RT.object({x: RT.string(), y: RT.number()}),
          RT.object({x: RT.string(), y: RT.number(), z: RT.boolean()}),
        ])
      ),
    deserializeIsType: () => {
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
      return deserializeIsType<Tiny | Medium | Large>();
    },
    isTypeReflect: () => {
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
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
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
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
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
      return createGetTypeErrors<Tiny | Medium | Large>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([
          RT.object({x: RT.string()}),
          RT.object({x: RT.string(), y: RT.number()}),
          RT.object({x: RT.string(), y: RT.number(), z: RT.boolean()}),
        ])
      ),
    deserializeGetTypeErrors: () => {
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
      return deserializeGetTypeErrors<Tiny | Medium | Large>();
    },
    getTypeErrorsReflect: () => {
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
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
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
      return deserializeGetTypeErrors(v);
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
    isType: () => {
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
      return createIsType<Base | Extended | Unrelated>();
    },
    isTypeSchema: () =>
      createIsType(
        RT.union([RT.object({id: RT.string()}), RT.object({id: RT.string(), name: RT.string()}), RT.object({value: RT.number()})])
      ),
    deserializeIsType: () => {
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
      return deserializeIsType<Base | Extended | Unrelated>();
    },
    isTypeReflect: () => {
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
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
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
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
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
      return createGetTypeErrors<Base | Extended | Unrelated>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.union([RT.object({id: RT.string()}), RT.object({id: RT.string(), name: RT.string()}), RT.object({value: RT.number()})])
      ),
    deserializeGetTypeErrors: () => {
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
      return deserializeGetTypeErrors<Base | Extended | Unrelated>();
    },
    getTypeErrorsReflect: () => {
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
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
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
      return deserializeGetTypeErrors(v);
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
