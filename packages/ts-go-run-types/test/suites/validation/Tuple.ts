import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const TUPLE = {
  string_number_pair: {
    title: 'Two-element tuple (string plus number)',
    isTypeNotes: [
      'Tuples enforce exact length — both fewer (missing required) and more (excess) elements fail.',
      'Each slot runs the atomic check for its declared type.',
    ],
    isType: () => createIsType<[string, number]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[string, number]>>(),
    isTypeSchema: () => createIsType(RT.tuple([RT.string(), RT.number()])),
    deserializeIsType: () => deserializeIsType<[string, number]>(),
    isTypeReflect: () => {
      const v: [string, number] = ['hello', 1];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [string, number] = ['hello', 1];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[string, number]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[string, number]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([RT.string(), RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[string, number]>(),
    getTypeErrorsReflect: () => {
      const v: [string, number] = ['hello', 1];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [string, number] = ['hello', 1];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[string, number]>(),
    mockTypeReflect: () => {
      const v: [string, number] = ['hello', 1];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        ['hello', 1],
        ['', 0],
      ],
      invalid: [
        [],
        ['hello'],
        ['hello', 1, 'extra'],
        [1, 'hello'],
        'not array',
        null,
        undefined,
        ['hello', NaN], // NaN fails Number.isFinite
        [null, 1],
        ['hello', null],
      ],
    }),
    getExpectedErrors: () => [
      // [] — falls into else (length 0 ≤ 2); both slots are
      // undefined → both fail their atomic checks.
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      // ['hello'] — slot 0 OK; slot 1 undefined → number check fails.
      [{path: [1], expected: 'number'}],
      // ['hello', 1, 'extra'] — length > 2 fails outer tuple check.
      [{path: [], expected: 'tuple'}],
      // [1, 'hello'] — both slots wrong type.
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [1], expected: 'number'}],
      [{path: [0], expected: 'string'}],
      [{path: [1], expected: 'number'}],
    ],
  },

  full_mion_tuple: {
    title: 'Six-element heterogeneous tuple (mion fixture)',
    description: 'mion tuple.spec.ts "validate tuple"',
    isType: () => createIsType<[Date, number, string, null, string[], bigint]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[Date, number, string, null, string[], bigint]>>(),
    isTypeSchema: () =>
      createIsType(RT.tuple([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.array(RT.string()), RT.bigint()])),
    deserializeIsType: () => deserializeIsType<[Date, number, string, null, string[], bigint]>(),
    isTypeReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[Date, number, string, null, string[], bigint]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[Date, number, string, null, string[], bigint]>>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.tuple([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.array(RT.string()), RT.bigint()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[Date, number, string, null, string[], bigint]>(),
    getTypeErrorsReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[Date, number, string, null, string[], bigint]>(),
    mockTypeReflect: () => {
      const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
      invalid: [
        [new Date(), 123, 'hello', null, ['a', 'b', 'c']], // missing 6th elem
        [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34], // extra
        [new Date(), 123, 'hello', null, ['a', 'b', 'c'], 'not bigint'],
        null,
        undefined,
        [new Date('invalid'), 123, 'hello', null, ['a'], 1n], // Invalid Date
        [new Date(), NaN, 'hello', null, ['a'], 1n], // NaN
        [new Date(), 123, 'hello', undefined, ['a'], 1n], // undefined ≠ null literal
      ],
    }),
    getExpectedErrors: () => [
      [{path: [5], expected: 'bigint'}],
      [{path: [], expected: 'tuple'}],
      [{path: [5], expected: 'bigint'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'date'}],
      [{path: [1], expected: 'number'}],
      [{path: [3], expected: 'null'}],
    ],
  },

  tuple_with_optional: {
    title: 'Tuple with trailing optional elements',
    description: 'mion tuple.spec.ts "validate tuple with optional parameters"',
    isTypeNotes:
      'Optional tuple slots may be absent OR explicitly `undefined`. Trailing-only — TS grammar disallows `[A, B?, C]` (required after optional).',
    isType: () => createIsType<[number, bigint?, boolean?, number?]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[number, bigint?, boolean?, number?]>>(),
    isTypeSchema: () => createIsType(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
    deserializeIsType: () => deserializeIsType<[number, bigint?, boolean?, number?]>(),
    isTypeReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[number, bigint?, boolean?, number?]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[number, bigint?, boolean?, number?]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[number, bigint?, boolean?, number?]>(),
    getTypeErrorsReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[number, bigint?, boolean?, number?]>(),
    mockTypeReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[3, undefined, true, 4], [3], [3, 1n], [3, 1n, false]],
      invalid: [[], [3, 'not bigint'], [3, 1n, false, 4, 'extra'], 'not array', null, undefined, [NaN], ['not number']],
    }),
    getExpectedErrors: () => [
      // [] — slot 0 (required number) undefined → fails.
      [{path: [0], expected: 'number'}],
      // [3, 'not bigint'] — slot 1 is non-undefined non-bigint.
      [{path: [1], expected: 'bigint'}],
      // [3, 1n, false, 4, 'extra'] — length 5 > 4.
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'number'}],
      [{path: [0], expected: 'number'}],
    ],
  },

  nested_tuple_in_array: {
    title: 'Tuple as array element (tuple inside array dependency call)',
    description: 'array of tuples — exercises tuple inside array dependency call',
    isType: () => createIsType<[string, number][]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[string, number][]>>(),
    isTypeSchema: () => createIsType(RT.array(RT.tuple([RT.string(), RT.number()]))),
    deserializeIsType: () => deserializeIsType<[string, number][]>(),
    isTypeReflect: () => {
      const v: [string, number][] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [string, number][] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[string, number][]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[string, number][]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.tuple([RT.string(), RT.number()]))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[string, number][]>(),
    getTypeErrorsReflect: () => {
      const v: [string, number][] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [string, number][] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[string, number][]>(),
    mockTypeReflect: () => {
      const v: [string, number][] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        [],
        [['a', 1]],
        [
          ['a', 1],
          ['b', 2],
        ],
      ],
      invalid: [[['a', 'b']], [['a']], ['not tuple'], null, undefined, [['a', NaN]], [[null, 1]]],
    }),
    getExpectedErrors: () => [
      // [['a', 'b']] — outer array, inner [a, b]: slot 1 'b' not number.
      [{path: [0, 1], expected: 'number'}],
      // [['a']] — outer array, inner ['a']: slot 0 OK, slot 1 undefined fails number.
      [{path: [0, 1], expected: 'number'}],
      // ['not tuple'] — element 0 'not tuple' fails tuple check.
      [{path: [0], expected: 'tuple'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      // [['a', NaN]] — slot 1 NaN fails number.
      [{path: [0, 1], expected: 'number'}],
      // [[null, 1]] — slot 0 null fails string.
      [{path: [0, 0], expected: 'string'}],
    ],
  },

  // ---- DEFERRED — features that aren't yet ported ----

  tuple_rest: {
    title: 'Tuple with a trailing rest segment',
    // DataOnly's homomorphic tuple mapping can't preserve a trailing rest
    // (`...T[]`) element — the reconstructed shape widens and accepts inputs the
    // emitter rejects.
    dataOnlyDivergent: true,
    description:
      "mion tuple.spec.ts 'validate tuple with rest parameter'. Rest TupleMembers (Flags=['rest']) emit a for-loop starting at the member's Position and iterating to v.length, validating every element against the wrapped type. The tuple's length-bound check is skipped (rest absorbs extras).",
    isTypeNotes:
      'A trailing rest segment absorbs any number of trailing elements (including zero). Each trailing element must satisfy the rest type.',
    isType: () => createIsType<[number, ...string[]]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[number, ...string[]]>>(),
    isTypeSchema: () => createIsType(RT.tuple([RT.number()], RT.string())),
    deserializeIsType: () => deserializeIsType<[number, ...string[]]>(),
    isTypeReflect: () => {
      const v: [number, ...string[]] = [3];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [number, ...string[]] = [3];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[number, ...string[]]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[number, ...string[]]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([RT.number()], RT.string())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[number, ...string[]]>(),
    getTypeErrorsReflect: () => {
      const v: [number, ...string[]] = [3];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [number, ...string[]] = [3];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[number, ...string[]]>(),
    mockTypeReflect: () => {
      const v: [number, ...string[]] = [3];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[3], [3, 'a'], [3, 'a', 'b', 'c']],
      invalid: [[3, 'a', 4], ['not number'], [], 'not array', [3, 1], null, undefined, [NaN, 'a'], [3, null]],
    }),
    getExpectedErrors: () => [
      // [3, 'a', 4] — slot 0 OK; rest at iVar=1 'a' OK; iVar=2 4 fails string.
      [{path: [2], expected: 'string'}],
      // ['not number'] — slot 0 'not number' fails; rest iterates 0 times.
      [{path: [0], expected: 'number'}],
      // [] — slot 0 missing → number check fails on undefined.
      [{path: [0], expected: 'number'}],
      [{path: [], expected: 'tuple'}],
      // [3, 1] — slot 0 OK; rest iVar=1 1 fails string.
      [{path: [1], expected: 'string'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      // [NaN, 'a'] — slot 0 NaN fails; rest at 1 'a' OK.
      [{path: [0], expected: 'number'}],
      // [3, null] — slot 0 OK; rest iVar=1 null fails string.
      [{path: [1], expected: 'string'}],
    ],
  },

  tuple_circular: {
    title: 'Self-referential tuple via trailing optional self-ref',
    // The self-referential tuple shape doesn't survive DataOnly's recursive
    // homomorphic mapping (the self-ref slot widens), so verdicts diverge.
    dataOnlyDivergent: true,
    description:
      'mion tuple.spec.ts circular tuple. Same mechanism as circular array — Tuple is always non-inlined, the self-recursive dependency call closes the cycle via the isSelf branch.',
    isType: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createIsType<TupleCircular>();
    },
    // DataOnly equivalence is `'not-supported'` for this case: writing
    // `DataOnly<TupleCircular>` as an explicit type argument forces TS to
    // EAGERLY instantiate the recursive mapped type, which exceeds the
    // instantiation-depth cap (TS2589). `DataOnly<TupleCircular>` is anyway
    // structurally identical to `TupleCircular` (every element is serialisable),
    // so the bare `isType` above already covers the recursive-tuple shape.
    isTypeDataOnly: 'not-supported',
    // A ROOT-level recursive tuple can't be authored value-first — `Recursive<[…,
    // Self?]>` hits TS2589 (TS can't build a recursive tuple type via the mapping).
    // Covered type-first here; the object→tuple cycle is covered value-first by
    // CIRCULAR.object_with_tuple_prop.
    isTypeSchema: 'not-supported',
    getTypeErrorsSchema: 'not-supported',
    deserializeIsType: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return deserializeIsType<TupleCircular>();
    },
    isTypeReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createGetTypeErrors<TupleCircular>();
    },
    // `'not-supported'` for the same TS2589 reason as `isTypeDataOnly` above:
    // `DataOnly<TupleCircular>` as an explicit type argument blows the recursive
    // instantiation-depth cap, and is structurally identical to `TupleCircular`
    // (covered by the bare `getTypeErrors` above) anyway.
    getTypeErrorsDataOnly: 'not-supported',
    deserializeGetTypeErrors: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return deserializeGetTypeErrors<TupleCircular>();
    },
    getTypeErrorsReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createMockType<TupleCircular>();
    },
    mockTypeReflect: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
      return createMockType(v);
    },
    getSamples: () => {
      const tc: any = [new Date(), 1, 'a', null, [], 1n];
      const tcRec: any = [new Date(), 1, 'a', null, [], 1n, [new Date(), 1, 'a', null, [], 1n]];
      return {
        valid: [tc, tcRec],
        invalid: [
          [],
          [new Date(), 1, 'a', null, [], 'not bigint'],
          'not array',
          null,
          undefined,
          [new Date('invalid'), 1, 'a', null, [], 1n],
          [new Date(), NaN, 'a', null, [], 1n],
        ],
      };
    },
    getExpectedErrors: () => [
      // [] — every required slot fails atomic check (slot 6 is optional, skipped).
      [
        {path: [0], expected: 'date'},
        {path: [1], expected: 'number'},
        {path: [2], expected: 'string'},
        {path: [3], expected: 'null'},
        {path: [4], expected: 'array'},
        {path: [5], expected: 'bigint'},
      ],
      [{path: [5], expected: 'bigint'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'date'}],
      [{path: [1], expected: 'number'}],
    ],
  },

  tuple_multiple_trailing_optionals: {
    title: 'Tuple with multiple trailing optional slots',
    description:
      "Multiple trailing optionals — TS grammar requires optionals to come after required elements (`[A, B?, C]` is a TS error), so the canonical 'optional middle' form is a chain of trailing optionals. Each TupleMember.Optional flag fires its own `(v[i] === undefined || childCheck)` wrap independently.",
    isType: () => createIsType<[number, bigint?, boolean?, number?]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[number, bigint?, boolean?, number?]>>(),
    isTypeSchema: () => createIsType(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
    deserializeIsType: () => deserializeIsType<[number, bigint?, boolean?, number?]>(),
    isTypeReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[number, bigint?, boolean?, number?]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[number, bigint?, boolean?, number?]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[number, bigint?, boolean?, number?]>(),
    getTypeErrorsReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[number, bigint?, boolean?, number?]>(),
    mockTypeReflect: () => {
      const v: [number, bigint?, boolean?, number?] = [3];
      return createMockType(v);
    },
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
        [], // missing required first
        [3, 'not bigint'], // wrong type at optional slot
        [3, 1n, true, 4, 'extra'], // excess args
        'not array',
        null,
        undefined,
        [NaN], // NaN at required first
        [3, 1n, 'not boolean'], // wrong type at second optional
      ],
    }),
    getExpectedErrors: () => [
      [{path: [0], expected: 'number'}],
      [{path: [1], expected: 'bigint'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'number'}],
      // [3, 1n, 'not boolean'] — slot 2 (boolean?) is non-undefined
      // non-boolean. The resolver expands `boolean?` to a union
      // (undefined | true | false), so the error is reported as
      // 'union' not 'boolean'.
      [{path: [2], expected: 'union'}],
    ],
  },

  tuple_named_labels: {
    title: 'Tuple with named element labels (labels erased at runtime)',
    description:
      "Named tuple labels — `[name: string, age: number]` is the same shape as `[string, number]` at runtime (labels are TS-only metadata, erased at emit). Carried as a regression check that label syntax doesn't affect the validator shape.",
    isType: () => createIsType<[name: string, age: number]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[name: string, age: number]>>(),
    isTypeSchema: () => createIsType(RT.tuple([RT.string(), RT.number()])),
    deserializeIsType: () => deserializeIsType<[name: string, age: number]>(),
    isTypeReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[name: string, age: number]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[name: string, age: number]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([RT.string(), RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[name: string, age: number]>(),
    getTypeErrorsReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[name: string, age: number]>(),
    mockTypeReflect: () => {
      const v: [name: string, age: number] = ['Alice', 30];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        ['Alice', 30],
        ['', 0],
      ],
      invalid: [[], ['Alice'], ['Alice', '30'], [30, 'Alice'], null, 'not array', undefined, ['Alice', NaN], [null, 30]],
    }),
    getExpectedErrors: () => [
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [1], expected: 'number'}],
      [{path: [1], expected: 'number'}],
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [1], expected: 'number'}],
      [{path: [0], expected: 'string'}],
    ],
  },

  tuple_with_non_serializable: {
    title: 'Tuple with a function slot (must be undefined)',
    // The emitter keeps a function tuple slot as a `notSupported` node that
    // validates `undefined`; DataOnly maps the slot to `never`, so the projected
    // tuple `[string, never]` rejects the valid `[..., undefined]` samples.
    dataOnlyDivergent: true,
    description:
      "mion serialization-suite TUPLES.tuple_with_non_serializable. Function-typed tuple members emit `v[i] === undefined` per mion's non-serializable handling. The function slot must be absent or explicitly undefined; any other value (a real function, a string, …) fails.",
    isTypeNotes: [
      'TS DIVERGENCE: A function-typed tuple slot must be MISSING or explicitly `undefined`. A real function FAILS the check.',
      'This is the opposite of the object-property case (where function-typed props are skipped entirely): tuples enforce `=== undefined` because tuple position is structural.',
    ],
    isType: () => createIsType<[number, () => any]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[number, () => any]>>(),
    isTypeSchema: () => createIsType(RT.tuple([RT.number(), RT.func([], RT.any())])),
    deserializeIsType: () => deserializeIsType<[number, () => any]>(),
    isTypeReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[number, () => any]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[number, () => any]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([RT.number(), RT.func([], RT.any())])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[number, () => any]>(),
    getTypeErrorsReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[number, () => any]>(),
    mockTypeReflect: () => {
      const v: [number, () => any] = [3, () => null];
      return createMockType(v);
    },
    getSamples: () => ({
      // `[3]` is valid — v[1] is undefined which satisfies the
      // `v[1] === undefined` check the function slot emits.
      valid: [[3, undefined], [3]],
      invalid: [
        [3, () => null],
        [3, 42],
        ['not number'],
        'not array',
        null,
        undefined,
        [3, null], // null is NOT undefined — strict `=== undefined` check
        [NaN, undefined],
      ],
    }),
    getExpectedErrors: () => [
      [{path: [1], expected: 'undefined'}],
      [{path: [1], expected: 'undefined'}],
      [{path: [0], expected: 'number'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [1], expected: 'undefined'}],
      [{path: [0], expected: 'number'}],
    ],
  },

  empty_tuple: {
    title: 'Empty tuple `[]` (only the empty array passes)',
    description:
      "Zero-length tuple — the validator accepts only `[]` (Array.isArray + length === 0). Edge case for the tuple emit; mirrors mion's `children.length === 0` branch.",
    isType: () => createIsType<[]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[]>>(),
    isTypeSchema: () => createIsType(RT.tuple([])),
    deserializeIsType: () => deserializeIsType<[]>(),
    isTypeReflect: () => {
      const v: [] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[]>(),
    getTypeErrorsReflect: () => {
      const v: [] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[]>(),
    mockTypeReflect: () => {
      const v: [] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[]],
      invalid: [['extra'], [1], null, undefined, {}, 'not array', [null]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
    ],
  },

  single_element_tuple: {
    title: 'Single-element tuple `[T]`',
    description:
      'One-slot tuple — corner case for the length-bound check (length must be exactly 1 modulo optional / rest). Exercises the same emit shape as multi-element tuples but with a single member.',
    isType: () => createIsType<[string]>(),
    isTypeDataOnly: () => createIsType<DataOnly<[string]>>(),
    isTypeSchema: () => createIsType(RT.tuple([RT.string()])),
    deserializeIsType: () => deserializeIsType<[string]>(),
    isTypeReflect: () => {
      const v: [string] = ['x'];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [string] = ['x'];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[string]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<[string]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([RT.string()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[string]>(),
    getTypeErrorsReflect: () => {
      const v: [string] = ['x'];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [string] = ['x'];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[string]>(),
    mockTypeReflect: () => {
      const v: [string] = ['x'];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [['hello'], ['']],
      invalid: [[], [42], ['hello', 'extra'], null, undefined, [null], 'not array'],
    }),
    getExpectedErrors: () => [
      // [] — length 0, falls into else; slot 0 (undefined) fails string.
      [{path: [0], expected: 'string'}],
      // [42] — slot 0 wrong type.
      [{path: [0], expected: 'string'}],
      // ['hello', 'extra'] — length 2 > 1.
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [0], expected: 'string'}],
      [{path: [], expected: 'tuple'}],
    ],
  },

  readonly_tuple: {
    title: 'Readonly tuple (readonly [T, U])',
    description:
      '`readonly [T, U]` — readonly modifier on a tuple type. As with arrays, the readonly bit is TS-only and erased at runtime; the validator is identical to the bare `[T, U]` shape.',
    isType: () => createIsType<readonly [string, number]>(),
    isTypeDataOnly: () => createIsType<DataOnly<readonly [string, number]>>(),
    isTypeSchema: () => createIsType(RT.tuple([RT.string(), RT.number()])),
    deserializeIsType: () => deserializeIsType<readonly [string, number]>(),
    isTypeReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<readonly [string, number]>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<readonly [string, number]>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.tuple([RT.string(), RT.number()])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<readonly [string, number]>(),
    getTypeErrorsReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<readonly [string, number]>(),
    mockTypeReflect: () => {
      const v: readonly [string, number] = ['x', 1];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        ['x', 1],
        ['', 0],
      ],
      invalid: [[], ['x'], [1, 'x'], null, undefined, 'not array', ['x', 1, 'extra']],
    }),
    getExpectedErrors: () => [
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [1], expected: 'number'}],
      [
        {path: [0], expected: 'string'},
        {path: [1], expected: 'number'},
      ],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
      [{path: [], expected: 'tuple'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
