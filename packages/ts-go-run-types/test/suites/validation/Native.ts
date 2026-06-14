import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const NATIVE = {
  map_string_number: {
    title: 'Map with string keys and number values',
    description:
      'mion native/map — `v instanceof Map` plus iteration over `v.entries()` checking each key and value against K / V.',
    validateNotes: [
      'Must be an actual `Map` instance — a plain object, array, or `Set` is rejected.',
      'The value side reuses the atomic `number` check, so a `NaN` value is rejected (path `{key, index, failed: "mapValue"}`).',
    ],
    validate: () => createValidate<Map<string, number>>(),
    validateDataOnly: () => createValidate<DataOnly<Map<string, number>>>(),
    validateSchema: () => createValidate(RT.map(RT.string(), RT.number())),
    deserializeValidate: () => deserializeValidate<Map<string, number>>(),
    validateReflect: () => {
      const v: Map<string, number> = new Map();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Map<string, number> = new Map();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Map<string, number>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Map<string, number>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.map(RT.string(), RT.number())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Map<string, number>>(),
    getValidationErrorsReflect: () => {
      const v: Map<string, number> = new Map();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Map<string, number> = new Map();
      return deserializeGetValidationErrors(v);
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
    validateNotes:
      'Must be an actual `Set` instance — a plain object, array, or `Map` is rejected; each element is checked against the element type (set path is `{key: safe(item), index}`).',
    validate: () => createValidate<Set<string>>(),
    validateDataOnly: () => createValidate<DataOnly<Set<string>>>(),
    validateSchema: () => createValidate(RT.set(RT.string())),
    deserializeValidate: () => deserializeValidate<Set<string>>(),
    validateReflect: () => {
      const v: Set<string> = new Set();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Set<string> = new Set();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Set<string>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Set<string>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.set(RT.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Set<string>>(),
    getValidationErrorsReflect: () => {
      const v: Set<string> = new Set();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Set<string> = new Set();
      return deserializeGetValidationErrors(v);
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
    // form's thenable check. (The matching emitter change — make `validate` itself
    // drop Promise like symbol/method — is tracked separately; until then the
    // bare `validate` still thenable-validates, so this stays divergent.)
    dataOnlyDivergent: true,
    description:
      "Promise validation is a thenable check — `typeof v === 'object' && v !== null && typeof v.then === 'function'`. The wrapped T cannot be validated synchronously (the promise hasn't resolved); callers use `Awaited<P>` for the resolved-value check (see `awaited_promise` below). prepareForJson/restoreFromJson throw at RT compile (mion's nodes/native/promise.ts).",
    validateNotes: [
      'TS DIVERGENCE: Promise validation is a "thenable" check — any object with a `then: function` PASSES, even if it is not an actual `Promise` instance.',
      'The wrapped type T is NOT validated — the promise has not resolved yet. Use `Awaited<P>` if you have the resolved value and want to validate it.',
    ],
    validate: () => createValidate<Promise<string>>(),
    validateDataOnly: () => createValidate<DataOnly<Promise<string>>>(),
    validateSchema: () => createValidate(RT.promise(RT.string())),
    deserializeValidate: () => deserializeValidate<Promise<string>>(),
    validateReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Promise<string>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Promise<string>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.promise(RT.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Promise<string>>(),
    getValidationErrorsReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Promise<string> = Promise.resolve('x');
      return deserializeGetValidationErrors(v);
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
    validateNotes:
      '`Awaited<P>` is resolved at the type-checker layer to the resolved value type — `Awaited<Promise<string>>` becomes plain `string`. The validator is identical to the atomic-string emit; a real Promise does NOT satisfy it.',
    validate: () => createValidate<Awaited<Promise<string>>>(),
    validateDataOnly: () => createValidate<DataOnly<Awaited<Promise<string>>>>(),
    validateSchema: () => createValidate(RT.string()),
    deserializeValidate: () => deserializeValidate<Awaited<Promise<string>>>(),
    validateReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Awaited<Promise<string>>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Awaited<Promise<string>>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Awaited<Promise<string>>>(),
    getValidationErrorsReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Awaited<Promise<string>> = 'hello';
      return deserializeGetValidationErrors(v);
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
