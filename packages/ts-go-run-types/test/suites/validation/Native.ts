import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const NATIVE = {
  map_string_number: {
    title: 'Map with string keys and number values',
    description:
      'mion native/map — `v instanceof Map` plus iteration over `v.entries()` checking each key and value against K / V.',
    isType: () => createIsType<Map<string, number>>(),
    isTypeDataOnly: () => createIsType<DataOnly<Map<string, number>>>(),
    isTypeSchema: () => createIsType(RT.map(RT.string(), RT.number())),
    deserializeIsType: () => deserializeIsType<Map<string, number>>(),
    isTypeReflect: () => {
      const v: Map<string, number> = new Map();
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Map<string, number> = new Map();
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Map<string, number>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Map<string, number>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.map(RT.string(), RT.number())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Map<string, number>>(),
    getTypeErrorsReflect: () => {
      const v: Map<string, number> = new Map();
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Map<string, number> = new Map();
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<Map<string, number>>(),
    mockTypeReflect: () => {
      const v: Map<string, number> = new Map();
      return createMockType(v);
    },
    getSamples: () => {
      const empty = new Map();
      const one = new Map([['a', 1]]);
      const many = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const wrongKey = new Map<any, number>([[1, 1]]);
      const wrongValue = new Map<string, any>([['a', 'not number']]);
      const nanValue = new Map<string, any>([['a', NaN]]);
      return {
        valid: [empty, one, many],
        invalid: [{}, [], null, 'not map', wrongKey, wrongValue, undefined, new Date(), nanValue, new Set()],
      };
    },
    getExpectedErrors: () => [
      [{path: [], expected: 'map'}],
      [{path: [], expected: 'map'}],
      [{path: [], expected: 'map'}],
      [{path: [], expected: 'map'}],
      // wrongKey: Map with key=1 (number not string). Path is the
      // mion-style {key, index, failed} segment object identifying
      // which side of which entry failed.
      [{path: [{key: 1, index: 0, failed: 'mapKey'}], expected: 'string'}],
      [{path: [{key: 'a', index: 0, failed: 'mapValue'}], expected: 'number'}],
      [{path: [], expected: 'map'}],
      [{path: [], expected: 'map'}],
      [{path: [{key: 'a', index: 0, failed: 'mapValue'}], expected: 'number'}],
      [{path: [], expected: 'map'}],
    ],
  },

  set_string: {
    title: 'Set of strings',
    description: 'mion native/set — `v instanceof Set` plus iteration over `v.values()`.',
    isType: () => createIsType<Set<string>>(),
    isTypeDataOnly: () => createIsType<DataOnly<Set<string>>>(),
    isTypeSchema: () => createIsType(RT.set(RT.string())),
    deserializeIsType: () => deserializeIsType<Set<string>>(),
    isTypeReflect: () => {
      const v: Set<string> = new Set();
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Set<string> = new Set();
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Set<string>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Set<string>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.set(RT.string())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Set<string>>(),
    getTypeErrorsReflect: () => {
      const v: Set<string> = new Set();
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Set<string> = new Set();
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<Set<string>>(),
    mockTypeReflect: () => {
      const v: Set<string> = new Set();
      return createMockType(v);
    },
    getSamples: () => {
      const empty = new Set<string>();
      const one = new Set(['a']);
      const many = new Set(['a', 'b', 'c']);
      const wrongType = new Set<any>([1]);
      const nullElement = new Set<any>([null]);
      return {
        valid: [empty, one, many],
        invalid: [{}, [], null, 'not set', wrongType, undefined, new Date(), new Map(), nullElement],
      };
    },
    getExpectedErrors: () => [
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      // wrongType: Set with item 1 (number not string). Set path is
      // {key: safe(item), index} — mion set.ts parity (T4); safe(1)=1.
      [{path: [{key: 1, index: 0}], expected: 'string'}],
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      [{path: [], expected: 'set'}],
      // nullElement: Set with item null (not string); safe(null)=null.
      [{path: [{key: null, index: 0}], expected: 'string'}],
    ],
  },

  promise_string: {
    title: 'Promise — thenable check, wrapped type not validated',
    // `DataOnly` STRIPS Promise (a thenable is not data — see DataOnly in
    // runtypes/types.ts), so `DataOnly<Promise<string>>` is `never` and the
    // DataOnly validator collapses to an always-throw, diverging from the bare
    // form's thenable check. (The matching emitter change — make `isType` itself
    // drop Promise like symbol/method — is tracked separately; until then the
    // bare `isType` still thenable-validates, so this stays divergent.)
    dataOnlyDivergent: true,
    description:
      "Promise validation is a thenable check — `typeof v === 'object' && v !== null && typeof v.then === 'function'`. The wrapped T cannot be validated synchronously (the promise hasn't resolved); callers use `Awaited<P>` for the resolved-value check (see `awaited_promise` below). prepareForJson/restoreFromJson throw at RT compile (mion's nodes/native/promise.ts).",
    isTypeNotes: [
      'TS DIVERGENCE: Promise validation is a "thenable" check — any object with a `then: function` PASSES, even if it is not an actual `Promise` instance.',
      'The wrapped type T is NOT validated — the promise has not resolved yet. Use `Awaited<P>` if you have the resolved value and want to validate it.',
    ],
    isType: () => createIsType<Promise<string>>(),
    isTypeDataOnly: () => createIsType<DataOnly<Promise<string>>>(),
    isTypeSchema: () => createIsType(RT.promise(RT.string())),
    deserializeIsType: () => deserializeIsType<Promise<string>>(),
    isTypeReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Promise<string>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Promise<string>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.promise(RT.string())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Promise<string>>(),
    getTypeErrorsReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<Promise<string>>(),
    mockTypeReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return createMockType(v);
    },
    getSamples: () => {
      const realPromise = Promise.resolve('x');
      const thenable = {then: () => null};
      // {then: 'not a function'} — fails the typeof === 'function' check
      const fakeThenable = {then: 'not a function'};
      return {
        valid: [realPromise, thenable],
        invalid: [null, 'string', 42, {}, [], undefined, true, fakeThenable],
      };
    },
    getExpectedErrors: () => [
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
      [{path: [], expected: 'promise'}],
    ],
  },

  awaited_promise: {
    title: 'Awaited<Promise<T>> — resolves to the wrapped type',
    description:
      "TypeScript's built-in `Awaited<P>` utility unwraps the promise to its resolved type; tsgo resolves it at compile time, so this case lands as plain `string` in our cache and reuses the atomic string emit. The test verifies the utility threads through correctly.",
    isTypeNotes:
      '`Awaited<P>` is resolved at the type-checker layer to the resolved value type — `Awaited<Promise<string>>` becomes plain `string`. The validator is identical to the atomic-string emit; a real Promise does NOT satisfy it.',
    isType: () => createIsType<Awaited<Promise<string>>>(),
    isTypeDataOnly: () => createIsType<DataOnly<Awaited<Promise<string>>>>(),
    isTypeSchema: () => createIsType(RT.string()),
    deserializeIsType: () => deserializeIsType<Awaited<Promise<string>>>(),
    isTypeReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Awaited<Promise<string>>>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Awaited<Promise<string>>>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Awaited<Promise<string>>>(),
    getTypeErrorsReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<Awaited<Promise<string>>>(),
    mockTypeReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [42, null, undefined, Promise.resolve('x'), true, {}, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
