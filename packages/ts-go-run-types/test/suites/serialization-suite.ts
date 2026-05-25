// Serialization suite ported from
// mion/packages/run-types/src/jitCompilers/serialization-suite.ts.
//
// Runs ALONGSIDE validation-suite.ts as a separate, JSON-specific driver.
// validation-suite covers isType / getTypeErrors with broad
// validator-oriented samples; this suite
// goes deeper into JSON serialization edge cases (richer Date/BigInt
// samples, more union shapes, dedicated ITERABLES + RECORDS +
// CIRCULAR_REFS buckets, function-shape variants via TS utility types).
//
// Mion lays the cases out as `{rt, values, deserializedValues?}` —
// the spec files build the serialize/deserialize functions from `rt`
// at test time. Our adapter pattern uses plugin-rewritten thunks
// instead: each case holds factory functions that already encode the
// runtype id (the marker scanner injects the hash at build time), so
// the suite never needs the raw RunType object.
//
// FUNCTIONS bucket: mion uses bespoke createSerializationParamsFn /
// createSerializationReturnFn helpers. We use TypeScript's native
// Parameters<typeof fn> and ReturnType<typeof fn> utilities — same
// type-level slicing, no extra factories required.

import {
  createPrepareForJson,
  createRestoreFromJson,
  createStringifyJson,
  type PrepareForJsonFn,
  type RestoreFromJsonFn,
  type StringifyJsonFn,
} from '@mionjs/ts-go-run-types';
import {deserializePrepareForJson, deserializeRestoreFromJson} from '../util/deserializeJitFunctions.ts';

// ========================================================================
// SERIALIZATION_SPEC — single source of truth for the round-trip cases.
// Every test type / class / enum / helper used by a case lives inside that
// case's factory thunks (mirrors validation-suite). The doc-gen pipeline
// (cmd/extract-fn-bodies) pulls each thunk body as a self-contained
// snippet, so consumers see the shape being serialised right next to the
// call that serialises it.
// ========================================================================

/** One case in the JSON serialization suite. Mirrors mion's `SingleTest`
 *  but with our marker-based thunks in place of the raw RunType. **/
export interface SerializationCase {
  title: string;
  description?: string;

  // Round-trip thunks. Static is required; the deserialize/restore
  // variant is optional. Reflect-marker resolution is exercised by the
  // validation-suite adapters (isType / getTypeErrors), so the
  // serialization suite covers only the static (and deserialize) form.
  prepareForJson: () => PrepareForJsonFn;
  deserializePrepareForJson?: () => PrepareForJsonFn;
  /** stringifyJson factory — single-pass serialiser ported from
   *  mion's stringifyJson JIT family. Same T as `prepareForJson`;
   *  the merged adapter drives the safe-mode loop with this. **/
  stringifyJson: () => StringifyJsonFn;

  /** Safe-mode only: when set, the case's input produces a JSON string
   *  that is not parseable by `JSON.parse` — e.g. number-at-root
   *  with `Infinity` (mion's `String(Infinity)` = `"Infinity"`).
   *  Mirrors mion's number-not-supported spec, which accepts either
   *  a throw OR a non-matching round-trip as a "value not supported
   *  by JSON" signal. The safe loop asserts the parse-throws instead
   *  of a deep-equal round-trip. The unsafe loop ignores this flag —
   *  on that path `JSON.stringify(Infinity)` returns `"null"` (not a
   *  throw) and the case's own `deserializedValues` already handles
   *  the round-trip. **/
  safeAdapterStringifyJsonNotParseable?: boolean;
  restoreFromJson: () => RestoreFromJsonFn;
  deserializeRestoreFromJson?: () => RestoreFromJsonFn;

  /** Sample values to round-trip via the **unsafe** path
   *  (`prepareForJson + JSON.stringify` / `JSON.parse + restoreFromJson`).
   *  Required for every case.
   *
   *  Returns valid inputs for `prepareForJson`: the unsafe path
   *  mutates `v` in place, walks declared children only, and lets
   *  `JSON.stringify` see any extras (which then pass through,
   *  throw on bigint extras, or get silently dropped for
   *  symbol/function-valued extras).
   *
   *  `deserializedValues` is set only when the restored shape is
   *  asymmetric — class instances decode to plain objects,
   *  functions in tuples decode to undefined, JSON.stringify drops
   *  symbol-keyed extras, etc.
   *
   *  Mirrors mion's `getTestData` shape. **/
  getTestData: () => {values: unknown[]; deserializedValues?: unknown[]};

  /** Optional override consumed by the **safe** path adapter
   *  (`stripUnknownKeys + prepareForJson + JSON.stringify` /
   *  `JSON.parse + (stripUnknownKeys | unknownKeyErrors) + restoreFromJson`).
   *
   *  Provide only when the safe path produces a different observable
   *  than the unsafe path — typically when an input carries extras
   *  that are stripped pre-serialise (so `deserializedValues`
   *  reflects the cleaned shape). For ~90% of cases (no extras,
   *  identical behaviour between paths) leave this unset; the safe
   *  adapter falls back to `getTestData`.
   *
   *  Mirrors the split between mion's jsonSpec (prepareForJson +
   *  JSON.stringify) and stringifySpec (stringifyJson) test
   *  helpers. **/
  getTestDataForStringify?: () => {values: unknown[]; deserializedValues?: unknown[]};

  /** Broad types (any / unknown / object) where the round-trip is
   *  best-effort via JSON. The adapter weakens the assertion: succeed
   *  when JSON.stringify(prepared) is a non-undefined string, without
   *  requiring deep-equal back to the original. **/
  roundTripBestEffort?: boolean;

  /** When the prepareForJson / restoreFromJson factory creation itself
   *  is expected to throw (e.g. `never` type, non-serializable
   *  primitives, Promise top-level). Tests verify a throw at thunk
   *  invocation time rather than a successful round-trip. **/
  throwsAtCompile?: boolean;

  /** When the factory builds successfully but `JSON.stringify(prepared)`
   *  is expected to throw at runtime. Documents mion's "extras pass
   *  through" semantic: prepareForJson does NOT strip structural extras
   *  (see comment in mion's `jsonSpec/03JsonObjects.spec.ts` strip
   *  extra params test — "native JSON.stringify do not strip extra
   *  params"). When an input carries an extra prop holding a
   *  non-serializable value (bigint, symbol, circular ref), prepareForJson
   *  preserves it and JSON.stringify throws. The contract: shape inputs
   *  to match the declared type, or apply a future `stripUnknownProps`
   *  pass before serialize. Tests assert the throw at JSON.stringify
   *  time instead of attempting a round-trip. **/
  jsonStringifyThrows?: boolean;
}

export const SERIALIZATION_SPEC = {
  ATOMIC: {
    string: {
      title: 'string',
      prepareForJson: () => createPrepareForJson<string>(),
      stringifyJson: () => createStringifyJson<string>(),
      restoreFromJson: () => createRestoreFromJson<string>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string>(),
      getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
    },
    number: {
      title: 'number',
      prepareForJson: () => createPrepareForJson<number>(),
      stringifyJson: () => createStringifyJson<number>(),
      restoreFromJson: () => createRestoreFromJson<number>(),
      deserializePrepareForJson: () => deserializePrepareForJson<number>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<number>(),
      getTestData: () => ({
        values: [
          0,
          99,
          -1,
          1.1,
          -1.1,
          1988,
          2045,
          2 ** 31,
          Number.MAX_SAFE_INTEGER,
          Number.MIN_SAFE_INTEGER,
          Number.MIN_VALUE,
          Number.MAX_VALUE,
        ],
      }),
    },
    number_not_supported: {
      title: 'number values not supported by all protocols',
      description: 'Infinity / NaN do not survive JSON encoding (become null on restore).',
      prepareForJson: () => createPrepareForJson<number>(),
      stringifyJson: () => createStringifyJson<number>(),
      restoreFromJson: () => createRestoreFromJson<number>(),
      getTestData: () => ({
        values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
        // After JSON.stringify(Infinity) === 'null', restore yields null.
        deserializedValues: [null, null, null],
      }),
      // Safe-path adapter: stringifyJson at root uses `String(v)` per
      // mion (stringifyJson.ts:97). `String(Infinity) === "Infinity"`
      // which is not valid JSON — JSON.parse throws. The flag opts the
      // safe adapter into mion's loose "throw OR non-equal" semantic
      // for this case.
      safeAdapterStringifyJsonNotParseable: true,
    },
    regexp: {
      title: 'regexp',
      prepareForJson: () => createPrepareForJson<RegExp>(),
      stringifyJson: () => createStringifyJson<RegExp>(),
      restoreFromJson: () => createRestoreFromJson<RegExp>(),
      deserializePrepareForJson: () => deserializePrepareForJson<RegExp>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<RegExp>(),
      getTestData: () => ({values: [/abc/, /xyz/i, /\d+/g, /^[a-z]+$/]}),
    },
    bigint: {
      title: 'bigint',
      prepareForJson: () => createPrepareForJson<bigint>(),
      stringifyJson: () => createStringifyJson<bigint>(),
      restoreFromJson: () => createRestoreFromJson<bigint>(),
      deserializePrepareForJson: () => deserializePrepareForJson<bigint>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<bigint>(),
      getTestData: () => ({values: [1n]}),
    },
    boolean: {
      title: 'boolean',
      prepareForJson: () => createPrepareForJson<boolean>(),
      stringifyJson: () => createStringifyJson<boolean>(),
      restoreFromJson: () => createRestoreFromJson<boolean>(),
      deserializePrepareForJson: () => deserializePrepareForJson<boolean>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<boolean>(),
      getTestData: () => ({values: [true]}),
    },
    any: {
      title: 'any',
      prepareForJson: () => createPrepareForJson<any>(),
      stringifyJson: () => createStringifyJson<any>(),
      restoreFromJson: () => createRestoreFromJson<any>(),
      deserializePrepareForJson: () => deserializePrepareForJson<any>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]]}),
    },
    not_supported_any: {
      title: 'not supported in JSON stringify when any type is used',
      description:
        'undefined / Date / BigInt are not natively JSON-encodable when the type is `any` (no per-kind transform applies).',
      prepareForJson: () => createPrepareForJson<any>(),
      stringifyJson: () => createStringifyJson<any>(),
      restoreFromJson: () => createRestoreFromJson<any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
    },
    null: {
      title: 'null',
      prepareForJson: () => createPrepareForJson<null>(),
      stringifyJson: () => createStringifyJson<null>(),
      restoreFromJson: () => createRestoreFromJson<null>(),
      deserializePrepareForJson: () => deserializePrepareForJson<null>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<null>(),
      getTestData: () => ({values: [null]}),
    },
    undefined: {
      title: 'undefined',
      prepareForJson: () => createPrepareForJson<undefined>(),
      stringifyJson: () => createStringifyJson<undefined>(),
      restoreFromJson: () => createRestoreFromJson<undefined>(),
      deserializePrepareForJson: () => deserializePrepareForJson<undefined>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<undefined>(),
      getTestData: () => ({values: [undefined]}),
    },
    date: {
      title: 'date',
      prepareForJson: () => createPrepareForJson<Date>(),
      stringifyJson: () => createStringifyJson<Date>(),
      restoreFromJson: () => createRestoreFromJson<Date>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Date>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Date>(),
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
    },
    enum_color: {
      title: 'enum',
      prepareForJson: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createPrepareForJson<Color>();
      },
      stringifyJson: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createStringifyJson<Color>();
      },
      restoreFromJson: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createRestoreFromJson<Color>();
      },
      deserializePrepareForJson: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return deserializePrepareForJson<Color>();
      },
      deserializeRestoreFromJson: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return deserializeRestoreFromJson<Color>();
      },
      getTestData: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return {values: [Color.Red, Color.Green]};
      },
    },
    symbol: {
      title: 'symbol',
      prepareForJson: () => createPrepareForJson<symbol>(),
      stringifyJson: () => createStringifyJson<symbol>(),
      restoreFromJson: () => createRestoreFromJson<symbol>(),
      deserializePrepareForJson: () => deserializePrepareForJson<symbol>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<symbol>(),
      getTestData: () => ({values: [Symbol('foo'), Symbol()]}),
    },
    object: {
      title: 'object',
      prepareForJson: () => createPrepareForJson<object>(),
      stringifyJson: () => createStringifyJson<object>(),
      restoreFromJson: () => createRestoreFromJson<object>(),
      deserializePrepareForJson: () => deserializePrepareForJson<object>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<object>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
    },
    void: {
      title: 'void',
      prepareForJson: () => createPrepareForJson<void>(),
      stringifyJson: () => createStringifyJson<void>(),
      restoreFromJson: () => createRestoreFromJson<void>(),
      deserializePrepareForJson: () => deserializePrepareForJson<void>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<void>(),
      getTestData: () => ({values: [undefined]}),
    },
    never: {
      title: 'never',
      description: 'never type cannot be JSON-encoded or decoded — invoking the factory throws.',
      prepareForJson: () => createPrepareForJson<never>(),
      stringifyJson: () => createStringifyJson<never>(),
      restoreFromJson: () => createRestoreFromJson<never>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    literal_string: {
      title: 'string literal',
      prepareForJson: () => createPrepareForJson<'hello'>(),
      stringifyJson: () => createStringifyJson<'hello'>(),
      restoreFromJson: () => createRestoreFromJson<'hello'>(),
      deserializePrepareForJson: () => deserializePrepareForJson<'hello'>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<'hello'>(),
      getTestData: () => ({values: ['hello']}),
    },
    literal_number: {
      title: 'number literal',
      prepareForJson: () => createPrepareForJson<42>(),
      stringifyJson: () => createStringifyJson<42>(),
      restoreFromJson: () => createRestoreFromJson<42>(),
      deserializePrepareForJson: () => deserializePrepareForJson<42>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<42>(),
      getTestData: () => ({values: [42]}),
    },
    literal_boolean: {
      title: 'boolean literal',
      prepareForJson: () => createPrepareForJson<true>(),
      stringifyJson: () => createStringifyJson<true>(),
      restoreFromJson: () => createRestoreFromJson<true>(),
      deserializePrepareForJson: () => deserializePrepareForJson<true>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<true>(),
      getTestData: () => ({values: [true]}),
    },
    literal_regexp: {
      title: 'regexp literal',
      prepareForJson: () => {
        const reg = /abc/;
        return createPrepareForJson<typeof reg>();
      },
      stringifyJson: () => {
        const reg = /abc/;
        return createStringifyJson<typeof reg>();
      },
      restoreFromJson: () => {
        const reg = /abc/;
        return createRestoreFromJson<typeof reg>();
      },
      getTestData: () => ({values: [/abc/]}),
    },
  },

  ARRAYS: {
    array: {
      title: 'array',
      prepareForJson: () => createPrepareForJson<string[]>(),
      stringifyJson: () => createStringifyJson<string[]>(),
      restoreFromJson: () => createRestoreFromJson<string[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[]>(),
      getTestData: () => ({values: [['hello', 'world'], []]}),
    },
    array_date: {
      title: 'array of dates',
      prepareForJson: () => createPrepareForJson<Date[]>(),
      stringifyJson: () => createStringifyJson<Date[]>(),
      restoreFromJson: () => createRestoreFromJson<Date[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Date[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Date[]>(),
      getTestData: () => ({
        values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
      }),
    },
    undefined_in_array: {
      title: 'undefined is serialized as null in array',
      prepareForJson: () => createPrepareForJson<undefined[]>(),
      stringifyJson: () => createStringifyJson<undefined[]>(),
      restoreFromJson: () => createRestoreFromJson<undefined[]>(),
      getTestData: () => ({values: [[undefined, undefined]]}),
    },
    multi_dimensional: {
      title: 'multi dimensional array',
      prepareForJson: () => createPrepareForJson<string[][]>(),
      stringifyJson: () => createStringifyJson<string[][]>(),
      restoreFromJson: () => createRestoreFromJson<string[][]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string[][]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[][]>(),
      getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
    },
    non_serializable_in_array: {
      title: 'non serializable items throws an error',
      description: 'symbol[] should throw at JIT-compile time per mion semantic.',
      prepareForJson: () => createPrepareForJson<symbol[]>(),
      stringifyJson: () => createStringifyJson<symbol[]>(),
      restoreFromJson: () => createRestoreFromJson<symbol[]>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    array_circular: {
      title: 'array circular',
      prepareForJson: () => {
        type CircularArray = CircularArray[];
        return createPrepareForJson<CircularArray>();
      },
      stringifyJson: () => {
        type CircularArray = CircularArray[];
        return createStringifyJson<CircularArray>();
      },
      restoreFromJson: () => {
        type CircularArray = CircularArray[];
        return createRestoreFromJson<CircularArray>();
      },
      getTestData: () => {
        type CircularArray = CircularArray[];
        const arr: CircularArray = [];
        arr.push([]);
        arr[0].push([]);
        arr[0][0].push([]);
        return {values: [arr, []]};
      },
    },
  },

  OBJECTS: {
    interface: {
      title: 'interface',
      prepareForJson: () =>
        createPrepareForJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(),
      stringifyJson: () =>
        createStringifyJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(),
      restoreFromJson: () =>
        createRestoreFromJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(),
      getTestData: () => {
        const value = {
          startDate: new Date('2000-08-06T02:13:00.000Z'),
          quantity: 123,
          name: 'hello',
          nullValue: null,
          big: BigInt(123),
          stringArray: ['a', 'b', 'c'],
          "weird prop name \n?>'\\\t\r": 'hello2',
        };
        const valueWithOptional = {...value, optionalString: 'hello3'};
        return {values: [value, valueWithOptional]};
      },
    },
    many_optional_props: {
      title: 'many optional properties',
      prepareForJson: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createPrepareForJson<ManyOptional>();
      },
      stringifyJson: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createStringifyJson<ManyOptional>();
      },
      restoreFromJson: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createRestoreFromJson<ManyOptional>();
      },
      getTestData: () => ({
        values: [{a0: 0, a1: 1, b0: 16, a8: 8, b7: 23, b15: 31}, {a0: 0, b8: 24}, {}],
      }),
    },
    class: {
      title: 'class',
      prepareForJson: () => {
        class MySerializableClass {
          name: string;
          surname: string;
          id: number;
          startDate: Date;
          constructor() {
            this.name = 'John';
            this.surname = 'Doe';
            this.id = 0;
            this.startDate = new Date('2000-08-06T02:13:00.000Z');
          }
          getFullName() {
            return `${this.name} ${this.surname}`;
          }
        }
        return createPrepareForJson<MySerializableClass>();
      },
      stringifyJson: () => {
        class MySerializableClass {
          name: string;
          surname: string;
          id: number;
          startDate: Date;
          constructor() {
            this.name = 'John';
            this.surname = 'Doe';
            this.id = 0;
            this.startDate = new Date('2000-08-06T02:13:00.000Z');
          }
          getFullName() {
            return `${this.name} ${this.surname}`;
          }
        }
        return createStringifyJson<MySerializableClass>();
      },
      restoreFromJson: () => {
        class MySerializableClass {
          name: string;
          surname: string;
          id: number;
          startDate: Date;
          constructor() {
            this.name = 'John';
            this.surname = 'Doe';
            this.id = 0;
            this.startDate = new Date('2000-08-06T02:13:00.000Z');
          }
          getFullName() {
            return `${this.name} ${this.surname}`;
          }
        }
        return createRestoreFromJson<MySerializableClass>();
      },
      getTestData: () => {
        class MySerializableClass {
          name: string;
          surname: string;
          id: number;
          startDate: Date;
          constructor() {
            this.name = 'John';
            this.surname = 'Doe';
            this.id = 0;
            this.startDate = new Date('2000-08-06T02:13:00.000Z');
          }
          getFullName() {
            return `${this.name} ${this.surname}`;
          }
        }
        const item = new MySerializableClass();
        const restored = {name: item.name, surname: item.surname, id: item.id, startDate: item.startDate};
        return {values: [new MySerializableClass()], deserializedValues: [restored]};
      },
    },
    extended_class: {
      title: 'extended class',
      prepareForJson: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createPrepareForJson<ExtendedClass>();
      },
      stringifyJson: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createStringifyJson<ExtendedClass>();
      },
      restoreFromJson: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createRestoreFromJson<ExtendedClass>();
      },
      getTestData: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return {values: [new ExtendedClass()]};
      },
    },
    non_serializable_class: {
      title: 'non-serializable class via deserialize function',
      description:
        'mion registers a deserialize fn so the class instance can be reconstructed; without that registration, JSON yields a plain object.',
      prepareForJson: () => {
        class NonSerializableClass {
          constructor(
            public name: string,
            public surname: string,
            public id: number,
            public startDate: Date
          ) {}
          getFullName() {
            return `${this.name} ${this.surname}`;
          }
        }
        return createPrepareForJson<NonSerializableClass>();
      },
      stringifyJson: () => {
        class NonSerializableClass {
          constructor(
            public name: string,
            public surname: string,
            public id: number,
            public startDate: Date
          ) {}
          getFullName() {
            return `${this.name} ${this.surname}`;
          }
        }
        return createStringifyJson<NonSerializableClass>();
      },
      restoreFromJson: () => {
        class NonSerializableClass {
          constructor(
            public name: string,
            public surname: string,
            public id: number,
            public startDate: Date
          ) {}
          getFullName() {
            return `${this.name} ${this.surname}`;
          }
        }
        return createRestoreFromJson<NonSerializableClass>();
      },
      getTestData: () => {
        class NonSerializableClass {
          constructor(
            public name: string,
            public surname: string,
            public id: number,
            public startDate: Date
          ) {}
          getFullName() {
            return `${this.name} ${this.surname}`;
          }
        }
        const item = new NonSerializableClass('John', 'Doe', 0, new Date('2000-08-06T02:13:00.000Z'));
        const restored = {name: item.name, surname: item.surname, id: item.id, startDate: item.startDate};
        return {values: [item], deserializedValues: [restored]};
      },
    },
    undefined_in_object: {
      title: 'undefined is omitted in object prop',
      prepareForJson: () => createPrepareForJson<{a: string; b: number; c: undefined}>(),
      stringifyJson: () => createStringifyJson<{a: string; b: number; c: undefined}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; b: number; c: undefined}>(),
      getTestData: () => ({
        values: [{a: 'hello', b: 42, c: undefined}],
        deserializedValues: [{a: 'hello', b: 42}],
      }),
    },
    optional_properties_order: {
      title: 'optional properties order',
      prepareForJson: () => createPrepareForJson<{a: string; b?: string}>(),
      stringifyJson: () => createStringifyJson<{a: string; b?: string}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; b?: string}>(),
      getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}]}),
    },
    all_optional_fields: {
      title: 'all optional fields',
      prepareForJson: () => createPrepareForJson<{a?: string; b?: string}>(),
      stringifyJson: () => createStringifyJson<{a?: string; b?: string}>(),
      restoreFromJson: () => createRestoreFromJson<{a?: string; b?: string}>(),
      getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}, {}]}),
    },
    extras_passthrough_unsafe: {
      title: 'unsafe path preserves extras (mion semantic — JSON.stringify does not strip)',
      description:
        "Canonical baseline for the `prepareForJson + JSON.stringify` path: declared children get transformed, structural extras (both top-level and nested-in-declared-composites) pass through unchanged. Mirrors mion's `03JsonObjects.spec.ts` strip-extras case where the strip expectation is explicitly commented out (`// native JSON.stringify do not strip extra params`). The safe path (`stripUnknownKeys + prepareForJson + JSON.stringify`) strips the extras — that divergence is exercised in EXTRA_PARAMS.",
      prepareForJson: () =>
        createPrepareForJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          stringArray: string[];
          bigInt: bigint;
          optionalString?: string;
          "weird prop name \n?>'\\\t\r": string;
          deep: {a: string; b: number};
          '?other weird p': {c: string; d: number};
        }>(),
      stringifyJson: () =>
        createStringifyJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          stringArray: string[];
          bigInt: bigint;
          optionalString?: string;
          "weird prop name \n?>'\\\t\r": string;
          deep: {a: string; b: number};
          '?other weird p': {c: string; d: number};
        }>(),
      restoreFromJson: () =>
        createRestoreFromJson<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          stringArray: string[];
          bigInt: bigint;
          optionalString?: string;
          "weird prop name \n?>'\\\t\r": string;
          deep: {a: string; b: number};
          '?other weird p': {c: string; d: number};
        }>(),
      getTestData: () => {
        const startDate = new Date('2000-08-06T02:13:00.000Z');
        const objectWithExtraParams = {
          startDate,
          quantity: 123,
          name: 'hello',
          nullValue: null,
          stringArray: ['a', 'b', 'c'],
          bigInt: BigInt(123),
          "weird prop name \n?>'\\\t\r": 'hello2',
          deep: {a: 'hello', b: 123, cExtra: true},
          '?other weird p': {c: 'hello', d: 123, eExtra: true},
          extraA: 'hello',
          extraB: 123,
          extraC: true,
        };
        // Unsafe path: extras preserved through round-trip — expected
        // result equals the input (no `deserializedValues` override).
        return {values: [objectWithExtraParams]};
      },
      getTestDataForStringify: () => {
        const startDate = new Date('2000-08-06T02:13:00.000Z');
        const objectWithExtraParams = {
          startDate,
          quantity: 123,
          name: 'hello',
          nullValue: null,
          stringArray: ['a', 'b', 'c'],
          bigInt: BigInt(123),
          "weird prop name \n?>'\\\t\r": 'hello2',
          deep: {a: 'hello', b: 123, cExtra: true},
          '?other weird p': {c: 'hello', d: 123, eExtra: true},
          extraA: 'hello',
          extraB: 123,
          extraC: true,
        };
        const noExtraParams = {
          startDate,
          quantity: 123,
          name: 'hello',
          nullValue: null,
          stringArray: ['a', 'b', 'c'],
          bigInt: BigInt(123),
          "weird prop name \n?>'\\\t\r": 'hello2',
          deep: {a: 'hello', b: 123},
          '?other weird p': {c: 'hello', d: 123},
        };
        // Safe path: extras are stripped before serialise, so the
        // round-trip restores the declared-only shape.
        return {values: [objectWithExtraParams], deserializedValues: [noExtraParams]};
      },
    },
    interface_circular: {
      title: 'interface circular',
      prepareForJson: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createPrepareForJson<ICircular>();
      },
      stringifyJson: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createStringifyJson<ICircular>();
      },
      restoreFromJson: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createRestoreFromJson<ICircular>();
      },
      getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
    },
    interface_circular_array: {
      title: 'interface circular array',
      prepareForJson: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createPrepareForJson<ICircularArray>();
      },
      stringifyJson: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createStringifyJson<ICircularArray>();
      },
      restoreFromJson: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createRestoreFromJson<ICircularArray>();
      },
      getTestData: () => ({
        values: [
          {name: 'hello', children: []},
          {name: 'hello', children: [{name: 'world'}]},
        ],
      }),
    },
    interface_circular_deep: {
      title: 'interface circular deep',
      prepareForJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createPrepareForJson<ICircularDeep>();
      },
      stringifyJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createStringifyJson<ICircularDeep>();
      },
      restoreFromJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createRestoreFromJson<ICircularDeep>();
      },
      getTestData: () => ({
        values: [
          {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          {
            name: 'hello',
            big: 2n,
            embedded: {hello: 'world', child: {name: 'world1', big: 3n, embedded: {hello: 'world2'}}},
          },
        ],
      }),
    },
    interface_root_not_circular: {
      title: 'interface root not circular',
      prepareForJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createPrepareForJson<RootNotCircular>();
      },
      stringifyJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createStringifyJson<RootNotCircular>();
      },
      restoreFromJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createRestoreFromJson<RootNotCircular>();
      },
      getTestData: () => ({
        values: [
          {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 2n,
              embedded: {hello: 'world', child: {name: 'world1', big: 2n, embedded: {hello: 'world2'}}},
            },
          },
        ],
      }),
    },
    interface_multiple_circular: {
      title: 'interface multiple circular',
      prepareForJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        return createPrepareForJson<RootCircular>();
      },
      stringifyJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        return createStringifyJson<RootCircular>();
      },
      restoreFromJson: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        return createRestoreFromJson<RootCircular>();
      },
      getTestData: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        const ciDate: ICircularDate = {date: new Date('2000-08-06T02:13:00.000Z'), month: 1, year: 2021};
        return {
          values: [
            {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}, ciDate},
            {
              isRoot: true,
              ciChild: {
                name: 'hello',
                big: 1n,
                embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
              },
              ciDate,
            },
          ],
        };
      },
    },
    interface_with_methods: {
      title: 'methods should be excluded from interface when serializing',
      prepareForJson: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createPrepareForJson<ObjectWithMethods>();
      },
      stringifyJson: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createStringifyJson<ObjectWithMethods>();
      },
      restoreFromJson: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createRestoreFromJson<ObjectWithMethods>();
      },
      getTestData: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        const objWithMethod = {
          name: 'John',
          methodProp() {
            return 'method result';
          },
        } as ObjectWithMethods;
        return {values: [objWithMethod], deserializedValues: [{name: 'John'}]};
      },
    },
  },

  RECORDS: {
    index_property: {
      title: 'index property',
      prepareForJson: () => createPrepareForJson<{[key: string]: string}>(),
      stringifyJson: () => createStringifyJson<{[key: string]: string}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: string}>(),
      getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
    },
    index_property_and_prop: {
      title: 'interface with a single property and index property',
      prepareForJson: () => createPrepareForJson<{a: string; [key: string]: string}>(),
      stringifyJson: () => createStringifyJson<{a: string; [key: string]: string}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; [key: string]: string}>(),
      getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
    },
    index_property_extra: {
      title: 'index property with extra props and unions',
      prepareForJson: () => createPrepareForJson<{a: string; b: number; [key: string]: string | number}>(),
      stringifyJson: () => createStringifyJson<{a: string; b: number; [key: string]: string | number}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; b: number; [key: string]: string | number}>(),
      getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
    },
    multiple_index_props: {
      title: 'multiple index properties (symbol keys skipped)',
      prepareForJson: () => createPrepareForJson<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      stringifyJson: () => createStringifyJson<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      getTestData: () => {
        const objWithSymbolKeys = {
          key1: 'value1',
          key2: 'value2',
          [Symbol('key3')]: new Date(),
          [Symbol('key4')]: new Date(),
        };
        return {
          values: [{key1: 'value1', key2: 'value2'}, objWithSymbolKeys],
          deserializedValues: [
            {key1: 'value1', key2: 'value2'},
            {key1: 'value1', key2: 'value2'},
          ],
        };
      },
    },
    index_property_nested: {
      title: 'index property nested',
      prepareForJson: () => createPrepareForJson<{[key: string]: {[key: string]: number}}>(),
      stringifyJson: () => createStringifyJson<{[key: string]: {[key: string]: number}}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: {[key: string]: number}}>(),
      getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
    },
    index_property_nested_date: {
      title: 'index property nested with Date values',
      prepareForJson: () => createPrepareForJson<{[key: string]: {[key: string]: Date}}>(),
      stringifyJson: () => createStringifyJson<{[key: string]: {[key: string]: Date}}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: {[key: string]: Date}}>(),
      getTestData: () => ({
        values: [
          {
            key1: {
              nestedKey1: new Date('2000-08-06T02:13:00.000Z'),
              nestedKey2: new Date('2000-08-06T02:13:00.000Z'),
            },
          },
        ],
      }),
    },
    index_property_bigint: {
      title: 'index property with bigint values',
      prepareForJson: () => createPrepareForJson<{[key: string]: bigint}>(),
      stringifyJson: () => createStringifyJson<{[key: string]: bigint}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: string]: bigint}>(),
      getTestData: () => ({
        values: [
          {key1: 1n, key2: 2n},
          {hello: 1n, world: 2n},
        ],
      }),
    },
    index_property_non_root: {
      title: 'index property non-root',
      prepareForJson: () => createPrepareForJson<{b: string; c: {a: string; [key: string]: string}}>(),
      stringifyJson: () => createStringifyJson<{b: string; c: {a: string; [key: string]: string}}>(),
      restoreFromJson: () => createRestoreFromJson<{b: string; c: {a: string; [key: string]: string}}>(),
      getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
    },
  },

  TUPLES: {
    tuple: {
      title: 'tuple',
      prepareForJson: () => createPrepareForJson<[Date, number, string, null, string[], bigint]>(),
      stringifyJson: () => createStringifyJson<[Date, number, string, null, string[], bigint]>(),
      restoreFromJson: () => createRestoreFromJson<[Date, number, string, null, string[], bigint]>(),
      getTestData: () => ({
        values: [[new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
      }),
    },
    tuple_with_optional: {
      title: 'tuple with optional params',
      prepareForJson: () => createPrepareForJson<[number, bigint?, boolean?, number?]>(),
      stringifyJson: () => createStringifyJson<[number, bigint?, boolean?, number?]>(),
      restoreFromJson: () => createRestoreFromJson<[number, bigint?, boolean?, number?]>(),
      getTestData: () => ({
        values: [
          [3, undefined, true, 4],
          [446, undefined, undefined, undefined],
        ],
      }),
    },
    tuple_rest_parameter: {
      title: 'tuple rest parameter',
      prepareForJson: () => createPrepareForJson<[number, ...bigint[]]>(),
      stringifyJson: () => createStringifyJson<[number, ...bigint[]]>(),
      restoreFromJson: () => createRestoreFromJson<[number, ...bigint[]]>(),
      getTestData: () => ({values: [[34567, 1n, 2n, 3n], [3]]}),
    },
    tuple_with_non_serializable: {
      title: 'tuple with non serializable types are transformed to undefined',
      prepareForJson: () => createPrepareForJson<[number, () => any]>(),
      stringifyJson: () => createStringifyJson<[number, () => any]>(),
      restoreFromJson: () => createRestoreFromJson<[number, () => any]>(),
      getTestData: () => ({values: [[3, () => null]], deserializedValues: [[3, undefined]]}),
    },
    tuple_circular: {
      title: 'tuple circular',
      prepareForJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createPrepareForJson<TupleCircular>();
      },
      stringifyJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createStringifyJson<TupleCircular>();
      },
      restoreFromJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createRestoreFromJson<TupleCircular>();
      },
      getTestData: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const tDeep: TupleCircular = [
          new Date('2000-08-06T02:13:00.000Z'),
          456,
          'world',
          null,
          ['x', 'y', 'z'],
          BigInt(456),
          undefined,
        ];
        const typeValue: TupleCircular = [
          new Date('2000-08-06T02:13:00.000Z'),
          123,
          'hello',
          null,
          ['a', 'b', 'c'],
          BigInt(123),
          tDeep,
        ];
        return {values: [typeValue]};
      },
    },
    interface_circular_tuple: {
      title: 'interface circular tuple',
      prepareForJson: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createPrepareForJson<ICircularTuple>();
      },
      stringifyJson: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createStringifyJson<ICircularTuple>();
      },
      restoreFromJson: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createRestoreFromJson<ICircularTuple>();
      },
      getTestData: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
        const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
        return {values: [obj1, obj2]};
      },
    },
  },

  FUNCTIONS: {
    // Function parameter and return-type slicing uses TS utility types
    // (Parameters<typeof fn>, ReturnType<typeof fn>) rather than mion's
    // bespoke createSerializationParamsFn / createSerializationReturnFn
    // helpers. Same type-level slicing, no extra factories.
    parameters: {
      title: 'function parameters',
      prepareForJson: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createPrepareForJson<Parameters<typeof fnNoOptional>>();
      },
      stringifyJson: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createStringifyJson<Parameters<typeof fnNoOptional>>();
      },
      restoreFromJson: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createRestoreFromJson<Parameters<typeof fnNoOptional>>();
      },
      getTestData: () => ({
        values: [
          [3, true, 'hello'],
          [3, true, 'world'],
        ],
      }),
    },
    optional_params: {
      title: 'optional parameters',
      prepareForJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createPrepareForJson<Parameters<typeof fnOptionalParams>>();
      },
      stringifyJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createStringifyJson<Parameters<typeof fnOptionalParams>>();
      },
      restoreFromJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createRestoreFromJson<Parameters<typeof fnOptionalParams>>();
      },
      getTestData: () => {
        const d = new Date('2000-08-06T02:13:00.000Z');
        return {values: [[d, true], [d]]};
      },
    },
    function_return: {
      title: 'function return',
      prepareForJson: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createPrepareForJson<ReturnType<typeof fnOptionalParam>>();
      },
      stringifyJson: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createStringifyJson<ReturnType<typeof fnOptionalParam>>();
      },
      restoreFromJson: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createRestoreFromJson<ReturnType<typeof fnOptionalParam>>();
      },
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
    },
    function_with_rest_parameters: {
      title: 'function with rest parameters',
      prepareForJson: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createPrepareForJson<Parameters<typeof fnRestParams>>();
      },
      stringifyJson: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createStringifyJson<Parameters<typeof fnRestParams>>();
      },
      restoreFromJson: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createRestoreFromJson<Parameters<typeof fnRestParams>>();
      },
      getTestData: () => ({
        values: [
          [3, true, new Date('2000-08-06T02:13:00.000Z'), new Date('2000-08-06T02:13:00.000Z')],
          [3, true],
        ],
      }),
    },
    function_with_date_parameters: {
      title: 'function with Date parameters',
      prepareForJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createPrepareForJson<Parameters<typeof fnOptionalParams>>();
      },
      stringifyJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createStringifyJson<Parameters<typeof fnOptionalParams>>();
      },
      restoreFromJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createRestoreFromJson<Parameters<typeof fnOptionalParams>>();
      },
      getTestData: () => {
        const d = new Date('2000-08-06T02:13:00.000Z');
        return {values: [[d, true], [d]]};
      },
    },
    required_function_return: {
      title: 'required function return',
      prepareForJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createPrepareForJson<ReturnType<typeof fnOptionalParams>>();
      },
      stringifyJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createStringifyJson<ReturnType<typeof fnOptionalParams>>();
      },
      restoreFromJson: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createRestoreFromJson<ReturnType<typeof fnOptionalParams>>();
      },
      getTestData: () => ({values: [1n]}),
    },
    function_with_only_rest_parameters: {
      title: 'function with only rest parameters',
      prepareForJson: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createPrepareForJson<Parameters<typeof fnOnlyRestParams>>();
      },
      stringifyJson: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createStringifyJson<Parameters<typeof fnOnlyRestParams>>();
      },
      restoreFromJson: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createRestoreFromJson<Parameters<typeof fnOnlyRestParams>>();
      },
      getTestData: () => ({values: [[3, 2, 1], []]}),
    },
    non_serializable_params: {
      title: 'non serializable params',
      prepareForJson: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createPrepareForJson<Parameters<typeof fnWithCallback>>();
      },
      stringifyJson: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createStringifyJson<Parameters<typeof fnWithCallback>>();
      },
      restoreFromJson: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createRestoreFromJson<Parameters<typeof fnWithCallback>>();
      },
      getTestData: () => ({
        values: [
          [3, true, () => null],
          [3, true, undefined],
        ],
        deserializedValues: [
          [3, true, undefined],
          [3, true, undefined],
        ],
      }),
    },
    function_promise_return_type: {
      title: 'function returns a promise',
      description: 'Promise<T> as a return type — Promises are non-serializable in mion.',
      prepareForJson: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createPrepareForJson<ReturnType<typeof fnReturnsPromise>>();
      },
      stringifyJson: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createStringifyJson<ReturnType<typeof fnReturnsPromise>>();
      },
      restoreFromJson: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createRestoreFromJson<ReturnType<typeof fnReturnsPromise>>();
      },
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    function_return_type_is_function: {
      title: 'return type of a closure',
      description: 'fn returns another fn — non-serializable.',
      prepareForJson: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createPrepareForJson<ReturnType<typeof fnReturnsFunction>>();
      },
      stringifyJson: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createStringifyJson<ReturnType<typeof fnReturnsFunction>>();
      },
      restoreFromJson: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createRestoreFromJson<ReturnType<typeof fnReturnsFunction>>();
      },
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    call_signature_params: {
      title: 'call signature params',
      prepareForJson: () => createPrepareForJson<Parameters<{(a: number, b: boolean): string}>>(),
      stringifyJson: () => createStringifyJson<Parameters<{(a: number, b: boolean): string}>>(),
      restoreFromJson: () => createRestoreFromJson<Parameters<{(a: number, b: boolean): string}>>(),
      getTestData: () => ({values: [[3, true]]}),
    },
    call_signature_return: {
      title: 'call signature return',
      prepareForJson: () => createPrepareForJson<ReturnType<{(a: number, b: boolean): string}>>(),
      stringifyJson: () => createStringifyJson<ReturnType<{(a: number, b: boolean): string}>>(),
      restoreFromJson: () => createRestoreFromJson<ReturnType<{(a: number, b: boolean): string}>>(),
      getTestData: () => ({values: ['result']}),
    },
  },

  UTILITY_TYPES: {
    awaited: {
      title: 'Awaited<Promise<T>>',
      prepareForJson: () => createPrepareForJson<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      stringifyJson: () => createStringifyJson<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      restoreFromJson: () => createRestoreFromJson<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      getTestData: () => ({values: [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    exclude_atomic: {
      title: 'Exclude on atomic union',
      prepareForJson: () => createPrepareForJson<Exclude<'name' | 'age' | number, 'age'>>(),
      stringifyJson: () => createStringifyJson<Exclude<'name' | 'age' | number, 'age'>>(),
      restoreFromJson: () => createRestoreFromJson<Exclude<'name' | 'age' | number, 'age'>>(),
      getTestData: () => ({values: ['name', 3, 4]}),
    },
    exclude_objects: {
      title: 'Exclude on object union',
      prepareForJson: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createPrepareForJson<Exclude<Shape, Circle>>();
      },
      stringifyJson: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createStringifyJson<Exclude<Shape, Circle>>();
      },
      restoreFromJson: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createRestoreFromJson<Exclude<Shape, Circle>>();
      },
      getTestData: () => ({
        values: [
          {kind: 'square', x: 5},
          {kind: 'triangle', x: 5, y: 10},
        ],
      }),
    },
    required_properties: {
      title: 'Required<T>',
      prepareForJson: () => createPrepareForJson<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      stringifyJson: () => createStringifyJson<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      restoreFromJson: () => createRestoreFromJson<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      getTestData: () => ({
        values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}],
      }),
    },
    extract_atomic: {
      title: 'Extract on atomic union',
      prepareForJson: () => createPrepareForJson<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      stringifyJson: () => createStringifyJson<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      restoreFromJson: () => createRestoreFromJson<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      getTestData: () => ({values: ['name']}),
    },
    extract_objects: {
      title: 'Extract on object union',
      prepareForJson: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createPrepareForJson<Extract<Shape, ToExtract>>();
      },
      stringifyJson: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createStringifyJson<Extract<Shape, ToExtract>>();
      },
      restoreFromJson: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createRestoreFromJson<Extract<Shape, ToExtract>>();
      },
      getTestData: () => ({values: [{kind: 'square', x: 5}]}),
    },
    partial_properties: {
      title: 'Partial<T>',
      prepareForJson: () => createPrepareForJson<Partial<{name: string; age: number; createdAt: Date}>>(),
      stringifyJson: () => createStringifyJson<Partial<{name: string; age: number; createdAt: Date}>>(),
      restoreFromJson: () => createRestoreFromJson<Partial<{name: string; age: number; createdAt: Date}>>(),
      getTestData: () => {
        const createdAt = new Date('2000-08-06T02:13:00.000Z');
        return {values: [{name: 'John'}, {age: 30}, {createdAt}, {}]};
      },
    },
    pick_properties: {
      title: 'Pick<T, K>',
      prepareForJson: () =>
        createPrepareForJson<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      stringifyJson: () =>
        createStringifyJson<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      restoreFromJson: () =>
        createRestoreFromJson<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      getTestData: () => ({values: [{name: 'John', createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    omit_properties: {
      title: 'Omit<T, K>',
      prepareForJson: () => createPrepareForJson<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      stringifyJson: () => createStringifyJson<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      restoreFromJson: () => createRestoreFromJson<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      getTestData: () => ({values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    record_type: {
      title: 'Record<string, Date>',
      prepareForJson: () => createPrepareForJson<Record<string, Date>>(),
      stringifyJson: () => createStringifyJson<Record<string, Date>>(),
      restoreFromJson: () => createRestoreFromJson<Record<string, Date>>(),
      getTestData: () => ({
        values: [
          {
            key1: new Date('2000-08-06T02:13:00.000Z'),
            key2: new Date('2001-09-07T03:14:00.000Z'),
          },
          {},
        ],
      }),
    },
  },

  UNIONS: {
    union: {
      title: 'atomic union',
      prepareForJson: () => createPrepareForJson<Date | number | string | null | bigint>(),
      stringifyJson: () => createStringifyJson<Date | number | string | null | bigint>(),
      restoreFromJson: () => createRestoreFromJson<Date | number | string | null | bigint>(),
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, 3n]}),
    },
    union_array: {
      title: 'union of arrays',
      prepareForJson: () => createPrepareForJson<string[] | number[] | boolean[] | Date[]>(),
      stringifyJson: () => createStringifyJson<string[] | number[] | boolean[] | Date[]>(),
      restoreFromJson: () => createRestoreFromJson<string[] | number[] | boolean[] | Date[]>(),
      getTestData: () => ({
        values: [
          ['a', 'b', 'c'],
          [1, 2, 3],
          [true, false, true],
          [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')],
          [],
        ],
      }),
    },
    with_discriminator: {
      title: 'array of union with discriminator',
      prepareForJson: () => createPrepareForJson<(string | bigint | boolean | Date)[]>(),
      stringifyJson: () => createStringifyJson<(string | bigint | boolean | Date)[]>(),
      restoreFromJson: () => createRestoreFromJson<(string | bigint | boolean | Date)[]>(),
      getTestData: () => {
        const date = new Date('2000-08-06T02:13:00.000Z');
        return {
          values: [
            ['a', 'b', 'c'],
            [1n, 2n, 3n],
            [true, false, true],
            [1n, 'b', date],
          ],
        };
      },
    },
    union_object_with_discriminator: {
      title: 'union of object shapes',
      prepareForJson: () => createPrepareForJson<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      stringifyJson: () => createStringifyJson<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      getTestData: () => ({values: [{a: 'world', aa: true}, {c: 1n}, {d: 'hello'}, {}]}),
    },
    union_with_discriminator_property: {
      title: 'union with discriminator property',
      prepareForJson: () =>
        createPrepareForJson<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(),
      stringifyJson: () =>
        createStringifyJson<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(),
      restoreFromJson: () =>
        createRestoreFromJson<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(),
      getTestData: () => ({
        values: [
          {type: 'a', otherProp: true},
          {type: 'b', otherProp: 123},
          {type: 'c', otherProp: 'hello', time: new Date('2000-08-06T02:13:00.000Z')},
          {type: true, otherProp: 'typeD'},
        ],
      }),
    },
    union_mixed_with_discriminator: {
      title: 'union mixed arrays and objects',
      prepareForJson: () =>
        createPrepareForJson<
          string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
        >(),
      stringifyJson: () =>
        createStringifyJson<
          string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
        >(),
      restoreFromJson: () =>
        createRestoreFromJson<
          string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
        >(),
      getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}]}),
    },
    union_index_property_with_discriminator: {
      title: 'union with index property and discriminator',
      prepareForJson: () =>
        createPrepareForJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      stringifyJson: () =>
        createStringifyJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      restoreFromJson: () =>
        createRestoreFromJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}, {b: 1n, c: 2n}]}),
    },
    circular_union_with_discriminator: {
      title: 'Circular union with discriminator',
      prepareForJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createPrepareForJson<UnionC>();
      },
      stringifyJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createStringifyJson<UnionC>();
      },
      restoreFromJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createRestoreFromJson<UnionC>();
      },
      getTestData: () => {
        const date = new Date('2000-08-06T02:13:00.000Z');
        return {
          values: [
            new Date(date.getTime()),
            123,
            'hello',
            {a: {a: {}}},
            {},
            [],
            [[]],
            [123, 3, {b: 'hello'}],
            [123, 3, 'hello'],
            [[123], 3, [3, 'hello']],
          ],
        };
      },
    },
    union_with_methods: {
      title: 'union with methods — methods should be excluded',
      prepareForJson: () =>
        createPrepareForJson<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      stringifyJson: () =>
        createStringifyJson<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      restoreFromJson: () =>
        createRestoreFromJson<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      getTestData: () => {
        const objWithName = {
          name: 'John',
          getName() {
            return 'John';
          },
        };
        const objWithAge = {
          age: 25,
          getAge() {
            return 25;
          },
        };
        const objWithActive = {
          active: true,
          isActive() {
            return true;
          },
        };
        return {
          values: [objWithName, objWithAge, objWithActive],
          deserializedValues: [{name: 'John'}, {age: 25}, {active: true}],
        };
      },
    },
    union_with_any: {
      title: 'union with any — checked last as fallback',
      prepareForJson: () => createPrepareForJson<number | {name: string} | any>(),
      stringifyJson: () => createStringifyJson<number | {name: string} | any>(),
      restoreFromJson: () => createRestoreFromJson<number | {name: string} | any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [42, {name: 'test'}, 'fallback to any', true, null]}),
    },
    union_with_non_serializable: {
      title: 'union with non-serializable type throws',
      description: 'function in union — mion throws at JIT-compile time.',
      prepareForJson: () => createPrepareForJson<Date | number | string | (() => any)>(),
      stringifyJson: () => createStringifyJson<Date | number | string | (() => any)>(),
      restoreFromJson: () => createRestoreFromJson<Date | number | string | (() => any)>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },

    // ──────────────────────────────────────────────────────────────
    // Documented throw cases: mion's prepareForJson does NOT strip
    // extras (`03JsonObjects.spec.ts` strip extra params:
    //   `// expect(deserializedValues[i]).toEqual(deserialized);`
    //   `// native JSON.stringify do not strip extra params`).
    // When a union member matches an input that carries an extra
    // prop holding a non-serializable value (bigint, symbol), the
    // matched member's emit transforms only its declared props; the
    // extra survives into JSON.stringify, which throws. These cases
    // pin that contract — callers must shape their data to the
    // declared type, or apply a future stripUnknownProps pass before
    // serialize. The flag `jsonStringifyThrows` opts the case into
    // the throw-asserting adapter path.

    union_extra_bigint_prop_throws: {
      title: 'union member with extra bigint prop throws at JSON.stringify',
      description:
        'Input `{b: 123, c: 123n}` matches the `{b: number}` arm; mion preserves the structural extra `c: 123n` (no implicit strip). JSON.stringify then throws on the bigint. Contract: extras pass through unchanged — pre-strip them if they may carry non-serializable values.',
      prepareForJson: () => createPrepareForJson<{a: string} | {b: number}>(),
      stringifyJson: () => createStringifyJson<{a: string} | {b: number}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string} | {b: number}>(),
      jsonStringifyThrows: true,
      getTestData: () => ({values: [{b: 123, c: 123n}]}),
      // Safe-path adapter: stringifyJson strips the extra `c: 123n` in
      // the emit, so the round-trip succeeds with a declared-only
      // result. Captured here as a stringify-specific expectation.
      getTestDataForStringify: () => ({values: [{b: 123, c: 123n}], deserializedValues: [{b: 123}]}),
    },

    union_extra_symbol_prop_drops: {
      title: 'union member with extra symbol prop is dropped by JSON.stringify',
      description:
        'Same contract as `union_extra_bigint_prop_throws` but with a symbol extra. JSON.stringify silently drops symbols (returns `{"b":123}` — no throw), so this case round-trips with the extra silently lost. Rename from the original `_throws` name (which advertised a throw that never fires) for honesty.',
      prepareForJson: () => createPrepareForJson<{a: string} | {b: number}>(),
      stringifyJson: () => createStringifyJson<{a: string} | {b: number}>(),
      restoreFromJson: () => createRestoreFromJson<{a: string} | {b: number}>(),
      // Symbol-valued props are silently dropped by JSON.stringify
      // (per ECMAScript spec) — no throw, no round-trip mismatch
      // because the symbol was never reachable post-stringify
      // anyway. Documenting via `deserializedValues` instead of the
      // throw flag — the symbol prop vanishes, the rest survives.
      getTestData: () => ({
        values: [{b: 123, sym: Symbol('extra')}],
        deserializedValues: [{b: 123}],
      }),
    },
  },

  ITERABLES: {
    set_string: {
      title: 'Set<string>',
      prepareForJson: () => createPrepareForJson<Set<string>>(),
      stringifyJson: () => createStringifyJson<Set<string>>(),
      restoreFromJson: () => createRestoreFromJson<Set<string>>(),
      getTestData: () => ({values: [new Set<string>(['one', 'two', 'three'])]}),
    },
    set_small_object: {
      title: 'Set<SmallObject>',
      prepareForJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createPrepareForJson<Set<SmallObject>>();
      },
      stringifyJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createStringifyJson<Set<SmallObject>>();
      },
      restoreFromJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createRestoreFromJson<Set<SmallObject>>();
      },
      getTestData: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return {
          values: [
            new Set<SmallObject>([
              {prop1: 'value1', prop2: 1, prop3: true},
              {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')},
              {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)},
            ]),
          ],
        };
      },
    },
    objects_with_nested_sets: {
      title: 'objects with nested sets',
      prepareForJson: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createPrepareForJson<DeepWithSet>();
      },
      stringifyJson: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createStringifyJson<DeepWithSet>();
      },
      restoreFromJson: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createRestoreFromJson<DeepWithSet>();
      },
      getTestData: () => {
        const setB = new Set([
          {s: 'a', arr: [1, 2, 3]},
          {s: 'b', arr: [4, 5, 6]},
        ]);
        const setC = new Set([
          {s: 'a', arr: [1, 2, 3]},
          {s: 'b', arr: [4, 5, 6]},
        ]);
        return {values: [{a: 'a', b: setB, c: setC}]};
      },
    },
    map_string_number: {
      title: 'Map<string, number>',
      prepareForJson: () => createPrepareForJson<Map<string, number>>(),
      stringifyJson: () => createStringifyJson<Map<string, number>>(),
      restoreFromJson: () => createRestoreFromJson<Map<string, number>>(),
      getTestData: () => ({
        values: [
          new Map<string, number>([
            ['one', 1],
            ['two', 2],
            ['three', 3],
          ]),
        ],
      }),
    },
    map_string_small_object: {
      title: 'Map<string, SmallObject>',
      prepareForJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createPrepareForJson<Map<string, SmallObject>>();
      },
      stringifyJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createStringifyJson<Map<string, SmallObject>>();
      },
      restoreFromJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createRestoreFromJson<Map<string, SmallObject>>();
      },
      getTestData: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return {
          values: [
            new Map<string, SmallObject>([
              ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
              ['key2', {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}],
              ['key3', {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}],
            ]),
          ],
        };
      },
    },
    map_small_object_number: {
      title: 'Map<SmallObject, number>',
      prepareForJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createPrepareForJson<Map<SmallObject, number>>();
      },
      stringifyJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createStringifyJson<Map<SmallObject, number>>();
      },
      restoreFromJson: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createRestoreFromJson<Map<SmallObject, number>>();
      },
      getTestData: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return {
          values: [
            new Map<SmallObject, number>([
              [{prop1: 'value1', prop2: 1, prop3: true}, 1],
              [{prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}, 2],
              [{prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}, 3],
            ]),
          ],
        };
      },
    },
    objects_with_nested_maps: {
      title: 'objects with nested maps',
      prepareForJson: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createPrepareForJson<DeepWithMap>();
      },
      stringifyJson: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createStringifyJson<DeepWithMap>();
      },
      restoreFromJson: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createRestoreFromJson<DeepWithMap>();
      },
      getTestData: () => ({
        values: [
          {
            a: 'a',
            b: new Map([
              ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
              ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
            ]),
          },
        ],
      }),
    },
    map_with_bigint_keys: {
      title: 'Map with bigint keys',
      prepareForJson: () => createPrepareForJson<Map<bigint, number>>(),
      stringifyJson: () => createStringifyJson<Map<bigint, number>>(),
      restoreFromJson: () => createRestoreFromJson<Map<bigint, number>>(),
      getTestData: () => ({
        values: [
          new Map<bigint, number>([
            [1n, 1],
            [2n, 2],
            [3n, 3],
          ]),
        ],
      }),
    },
    map_with_date_values: {
      title: 'Map with Date values',
      prepareForJson: () => createPrepareForJson<Map<string, Date>>(),
      stringifyJson: () => createStringifyJson<Map<string, Date>>(),
      restoreFromJson: () => createRestoreFromJson<Map<string, Date>>(),
      getTestData: () => ({
        values: [
          new Map<string, Date>([
            ['date1', new Date('2000-08-06T02:13:00.000Z')],
            ['date2', new Date('2001-09-07T03:14:00.000Z')],
          ]),
        ],
      }),
    },
  },

  CIRCULAR_REFS: {
    circular_types: {
      title: 'circular objects',
      prepareForJson: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createPrepareForJson<CircularObject>();
      },
      stringifyJson: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createStringifyJson<CircularObject>();
      },
      restoreFromJson: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createRestoreFromJson<CircularObject>();
      },
      getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
    },
    circular_union_array: {
      title: 'CircularUnion array with discriminator',
      prepareForJson: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createPrepareForJson<CuArray>();
      },
      stringifyJson: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createStringifyJson<CuArray>();
      },
      restoreFromJson: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createRestoreFromJson<CuArray>();
      },
      getTestData: () => {
        const date = new Date('2000-08-06T02:13:00.000Z');
        return {
          values: [
            [date, 123, 'hello', ['a', 'b', 'c']],
            [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]],
            [],
          ],
        };
      },
    },
    circular_tuple: {
      title: 'CircularTuple object with discriminator',
      prepareForJson: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createPrepareForJson<CircularTuple>();
      },
      stringifyJson: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createStringifyJson<CircularTuple>();
      },
      restoreFromJson: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createRestoreFromJson<CircularTuple>();
      },
      getTestData: () => ({
        values: [{list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]}, {list: [1n, {list: [2n]}]}, {list: [1n]}],
      }),
    },
    circular_index: {
      title: 'CircularIndex object with discriminator',
      prepareForJson: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createPrepareForJson<CircularIndex>();
      },
      stringifyJson: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createStringifyJson<CircularIndex>();
      },
      restoreFromJson: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createRestoreFromJson<CircularIndex>();
      },
      getTestData: () => ({
        values: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
      }),
    },
    circular_deep: {
      title: 'CircularDeep object with discriminator',
      prepareForJson: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createPrepareForJson<CircularDeep>();
      },
      stringifyJson: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createStringifyJson<CircularDeep>();
      },
      restoreFromJson: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createRestoreFromJson<CircularDeep>();
      },
      getTestData: () => ({
        values: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
      }),
    },
    circular_tuple_complex: {
      title: 'Circular tuple with complex structure',
      prepareForJson: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createPrepareForJson<CircularTupleComplex>();
      },
      stringifyJson: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createStringifyJson<CircularTupleComplex>();
      },
      restoreFromJson: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createRestoreFromJson<CircularTupleComplex>();
      },
      getTestData: () => ({values: [[1n, [2n, [3n, [4n]]]], [1n, [2n]], [1n]]}),
    },
    object_with_circular_array: {
      title: 'object with circular array',
      prepareForJson: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createPrepareForJson<ObjCircularArr>();
      },
      stringifyJson: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createStringifyJson<ObjCircularArr>();
      },
      restoreFromJson: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createRestoreFromJson<ObjCircularArr>();
      },
      getTestData: () => ({
        values: [
          {
            a: 'hello',
            deep: {b: 'world', c: 123},
            d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
          },
        ],
      }),
    },
  },

  TEMPLATE_LITERALS: {
    url_string: {
      title: 'template literal as string type',
      prepareForJson: () => createPrepareForJson<`api/users/${number}`>(),
      stringifyJson: () => createStringifyJson<`api/users/${number}`>(),
      restoreFromJson: () => createRestoreFromJson<`api/users/${number}`>(),
      getTestData: () => ({
        values: [
          'api/users/0',
          'api/users/1',
          'api/users/42',
          'api/users/-7',
          'api/users/3.14',
          `api/users/${Number.MAX_SAFE_INTEGER}`,
        ],
      }),
    },
    url_in_object: {
      title: 'template literal as object property type',
      prepareForJson: () => createPrepareForJson<{url: `api/user/${number}`; method: string}>(),
      stringifyJson: () => createStringifyJson<{url: `api/user/${number}`; method: string}>(),
      restoreFromJson: () => createRestoreFromJson<{url: `api/user/${number}`; method: string}>(),
      getTestData: () => ({
        values: [
          {url: 'api/user/1', method: 'GET'},
          {url: 'api/user/42', method: 'POST'},
          {url: 'api/user/-7', method: 'DELETE'},
        ],
      }),
    },
    url_index_key: {
      title: 'template literal as index signature key',
      prepareForJson: () => createPrepareForJson<{[key: `api/${string}`]: number}>(),
      stringifyJson: () => createStringifyJson<{[key: `api/${string}`]: number}>(),
      restoreFromJson: () => createRestoreFromJson<{[key: `api/${string}`]: number}>(),
      getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
    },
    url_index_key_with_named: {
      title: 'template literal index key + sibling named property',
      prepareForJson: () => createPrepareForJson<{meta: string; [key: `api/${string}`]: string | number}>(),
      stringifyJson: () => createStringifyJson<{meta: string; [key: `api/${string}`]: string | number}>(),
      restoreFromJson: () => createRestoreFromJson<{meta: string; [key: `api/${string}`]: string | number}>(),
      getTestData: () => ({
        values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
      }),
    },
  },

  OTHERS: {
    promise_jsonStringify_error: {
      title: 'Promise top-level throws',
      prepareForJson: () => createPrepareForJson<Promise<string>>(),
      stringifyJson: () => createStringifyJson<Promise<string>>(),
      restoreFromJson: () => createRestoreFromJson<Promise<string>>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable: {
      title: 'non-serializable type throws (Int8Array)',
      prepareForJson: () => createPrepareForJson<Int8Array>(),
      stringifyJson: () => createStringifyJson<Int8Array>(),
      restoreFromJson: () => createRestoreFromJson<Int8Array>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_interface: {
      title: 'non-serializable inside interface throws',
      prepareForJson: () => createPrepareForJson<{a: Int8Array}>(),
      stringifyJson: () => createStringifyJson<{a: Int8Array}>(),
      restoreFromJson: () => createRestoreFromJson<{a: Int8Array}>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_array: {
      title: 'non-serializable inside array throws',
      prepareForJson: () => createPrepareForJson<Int8Array[]>(),
      stringifyJson: () => createStringifyJson<Int8Array[]>(),
      restoreFromJson: () => createRestoreFromJson<Int8Array[]>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_tuple: {
      title: 'non-serializable inside tuple throws',
      prepareForJson: () => createPrepareForJson<[Int8Array]>(),
      stringifyJson: () => createStringifyJson<[Int8Array]>(),
      restoreFromJson: () => createRestoreFromJson<[Int8Array]>(),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
  },

  // ──────────────────────────────────────────────────────────────
  // Cases whose entire purpose is to document the divergence
  // between the unsafe path (`prepareForJson + JSON.stringify`)
  // and the safe path (`stripUnknownKeys + prepareForJson +
  // JSON.stringify`). Both paths run against the SAME input; the
  // expected output diverges per the contract:
  //
  //   - Unsafe: extras pass through to JSON.stringify, which
  //     preserves JSON-compatible ones, throws on bigint extras,
  //     and silently drops symbol-/function-valued extras.
  //   - Safe: extras are stripped before serialise, so the output
  //     contains only declared keys regardless of what was on `v`.
  //
  // Each case provides `getTestData` (unsafe-path expectations)
  // and `getTestDataForStringify` when the safe path diverges
  // (otherwise the safe adapter falls back to `getTestData`).
  //
  // Cross-references: `OBJECTS.extras_passthrough_unsafe` is the
  // baseline case for prepareForJson preserves-extras; the union-
  // member analogs are `UNIONS.union_extra_bigint_prop_throws`
  // (unsafe throws) and `UNIONS.union_extra_symbol_prop_drops`
  // (unsafe drops because of JSON.stringify spec).
  EXTRA_PARAMS: {
    extras_passthrough_compatible: {
      title: 'JSON-compatible extra prop — unsafe preserves, safe strips',
      description:
        'Extra `extra: "hello"` is JSON-encodable (string). Unsafe path round-trips with the extra intact (prepareForJson never visits it, JSON.stringify keeps it). Safe path strips it before serialise — restored value contains only the declared key.',
      prepareForJson: () => createPrepareForJson<{declared: string}>(),
      stringifyJson: () => createStringifyJson<{declared: string}>(),
      restoreFromJson: () => createRestoreFromJson<{declared: string}>(),
      getTestData: () => ({
        values: [{declared: 'x', extra: 'hello'}],
        // Unsafe: extra preserved through round-trip.
      }),
      getTestDataForStringify: () => ({
        values: [{declared: 'x', extra: 'hello'}],
        deserializedValues: [{declared: 'x'}],
      }),
    },

    extras_throws_bigint: {
      title: 'bigint extra prop — unsafe throws at JSON.stringify, safe strips it',
      description:
        'Extra `extra: 123n` is not JSON-encodable. Unsafe path: prepareForJson never visits the extra, JSON.stringify throws on the bigint. Safe path: stripUnknownKeys removes the extra before prepareForJson runs, so the bigint never reaches JSON.stringify and the output is the clean declared-only shape.',
      prepareForJson: () => createPrepareForJson<{declared: string}>(),
      stringifyJson: () => createStringifyJson<{declared: string}>(),
      restoreFromJson: () => createRestoreFromJson<{declared: string}>(),
      jsonStringifyThrows: true,
      getTestData: () => ({values: [{declared: 'x', extra: 123n}]}),
      getTestDataForStringify: () => ({
        values: [{declared: 'x', extra: 123n}],
        deserializedValues: [{declared: 'x'}],
      }),
    },

    extras_dropped_symbol: {
      title: 'symbol-valued extra prop — both paths produce declared-only output',
      description:
        'Extra `sym: Symbol("x")` is silently dropped by JSON.stringify per ECMAScript spec (symbol-valued own props are non-enumerable for JSON purposes). Unsafe path: prepareForJson preserves it, JSON.stringify drops it. Safe path: strip removes it before stringify. Same observable, different mechanism — document the lossy round-trip in both paths.',
      prepareForJson: () => createPrepareForJson<{declared: string}>(),
      stringifyJson: () => createStringifyJson<{declared: string}>(),
      restoreFromJson: () => createRestoreFromJson<{declared: string}>(),
      getTestData: () => ({
        values: [{declared: 'x', sym: Symbol('extra')}],
        // JSON.stringify drops the symbol — restored shape has no `sym`.
        deserializedValues: [{declared: 'x'}],
      }),
      // Safe path produces the same output; no override needed.
    },

    extras_dropped_function: {
      title: 'function-valued extra prop — both paths produce declared-only output',
      description:
        'Extra `fn: () => 0` is silently dropped by JSON.stringify (function-valued props serialise to undefined and the key is omitted). Both paths produce declared-only output — strip removes the function on the safe path; JSON.stringify drops it on the unsafe path.',
      prepareForJson: () => createPrepareForJson<{declared: string}>(),
      stringifyJson: () => createStringifyJson<{declared: string}>(),
      restoreFromJson: () => createRestoreFromJson<{declared: string}>(),
      getTestData: () => ({
        values: [{declared: 'x', fn: () => 0}],
        deserializedValues: [{declared: 'x'}],
      }),
      // Safe path produces the same output; no override needed.
    },

    nested_extras_in_declared_child: {
      title: 'extras nested inside a declared composite child',
      description:
        'Extra `outer.extra` sits inside a declared `outer: {declared: string}` composite. Confirms the extras semantic recurses through declared composites: unsafe preserves the nested extra; safe strips it.',
      prepareForJson: () => createPrepareForJson<{outer: {declared: string}}>(),
      stringifyJson: () => createStringifyJson<{outer: {declared: string}}>(),
      restoreFromJson: () => createRestoreFromJson<{outer: {declared: string}}>(),
      getTestData: () => ({
        values: [{outer: {declared: 'x', extra: 'y'}}],
        // Unsafe: nested extra preserved.
      }),
      getTestDataForStringify: () => ({
        values: [{outer: {declared: 'x', extra: 'y'}}],
        deserializedValues: [{outer: {declared: 'x'}}],
      }),
    },
  },

  // LARGE_OBJECTS — realistic 30+-prop interfaces, multi-member
  // discriminated unions, mixed atomic+object unions, and deeply
  // nested shapes. The flat JSON family's headline optimisation is
  // skipping per-member isType walks at union dispatch, so the
  // object-union and mixed-union cases here are where the
  // serialisation bench should surface a measurable speedup.
  LARGE_OBJECTS: {
    wide_interface: {
      title: 'wide interface — 30 mixed-type properties',
      description:
        'Single interface with 30+ properties spanning scalars, Date, bigint, nested object — exercises the per-field walk cost without any union dispatch.',
      prepareForJson: () => {
        interface WideRecord {
          id: number;
          name: string;
          description: string;
          createdAt: Date;
          updatedAt: Date;
          isActive: boolean;
          score: number;
          rank: number;
          tag1: string;
          tag2: string;
          tag3: string;
          tag4: string;
          tag5: string;
          count1: number;
          count2: number;
          count3: number;
          flag1: boolean;
          flag2: boolean;
          flag3: boolean;
          big1: bigint;
          big2: bigint;
          alias: string;
          email: string;
          city: string;
          country: string;
          postal: string;
          width: number;
          height: number;
          weight: number;
          meta: {category: string; priority: number; lastSeen: Date};
        }
        return createPrepareForJson<WideRecord>();
      },
      stringifyJson: () => {
        interface WideRecord {
          id: number;
          name: string;
          description: string;
          createdAt: Date;
          updatedAt: Date;
          isActive: boolean;
          score: number;
          rank: number;
          tag1: string;
          tag2: string;
          tag3: string;
          tag4: string;
          tag5: string;
          count1: number;
          count2: number;
          count3: number;
          flag1: boolean;
          flag2: boolean;
          flag3: boolean;
          big1: bigint;
          big2: bigint;
          alias: string;
          email: string;
          city: string;
          country: string;
          postal: string;
          width: number;
          height: number;
          weight: number;
          meta: {category: string; priority: number; lastSeen: Date};
        }
        return createStringifyJson<WideRecord>();
      },
      restoreFromJson: () => {
        interface WideRecord {
          id: number;
          name: string;
          description: string;
          createdAt: Date;
          updatedAt: Date;
          isActive: boolean;
          score: number;
          rank: number;
          tag1: string;
          tag2: string;
          tag3: string;
          tag4: string;
          tag5: string;
          count1: number;
          count2: number;
          count3: number;
          flag1: boolean;
          flag2: boolean;
          flag3: boolean;
          big1: bigint;
          big2: bigint;
          alias: string;
          email: string;
          city: string;
          country: string;
          postal: string;
          width: number;
          height: number;
          weight: number;
          meta: {category: string; priority: number; lastSeen: Date};
        }
        return createRestoreFromJson<WideRecord>();
      },
      getTestData: () => {
        interface WideRecord {
          id: number;
          name: string;
          description: string;
          createdAt: Date;
          updatedAt: Date;
          isActive: boolean;
          score: number;
          rank: number;
          tag1: string;
          tag2: string;
          tag3: string;
          tag4: string;
          tag5: string;
          count1: number;
          count2: number;
          count3: number;
          flag1: boolean;
          flag2: boolean;
          flag3: boolean;
          big1: bigint;
          big2: bigint;
          alias: string;
          email: string;
          city: string;
          country: string;
          postal: string;
          width: number;
          height: number;
          weight: number;
          meta: {category: string; priority: number; lastSeen: Date};
        }
        const seed = 1;
        const record: WideRecord = {
          id: seed,
          name: `record-${seed}`,
          description: `Description for record ${seed} with extra body text`,
          createdAt: new Date('2024-01-15T12:00:00.000Z'),
          updatedAt: new Date('2024-06-15T12:00:00.000Z'),
          isActive: true,
          score: seed * 1.5,
          rank: seed % 100,
          tag1: `tag-a-${seed}`,
          tag2: `tag-b-${seed}`,
          tag3: `tag-c-${seed}`,
          tag4: `tag-d-${seed}`,
          tag5: `tag-e-${seed}`,
          count1: seed * 2,
          count2: seed * 3,
          count3: seed * 4,
          flag1: seed % 2 === 0,
          flag2: seed % 3 === 0,
          flag3: seed % 5 === 0,
          big1: BigInt(seed) * 1_000_000n,
          big2: BigInt(seed) * 9_999_999n,
          alias: `alias-${seed}`,
          email: `user${seed}@example.com`,
          city: 'Springfield',
          country: 'XX',
          postal: '00000',
          width: 1024,
          height: 768,
          weight: 12.5,
          meta: {category: 'default', priority: seed % 10, lastSeen: new Date('2024-12-01T00:00:00.000Z')},
        };
        return {values: [record]};
      },
    },
    object_union_5: {
      title: 'discriminated union of 5 large object members',
      description:
        'Five-member union of distinct event shapes. The flat encoder should win clearly here — non-flat runs an isType walk per candidate member.',
      prepareForJson: () => {
        interface ProductEvent {kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number;}
        interface UserEvent {kind: 'user'; id: string; username: string; email: string; signedUpAt: Date; loginCount: number; isPremium: boolean;}
        interface OrderEvent {kind: 'order'; id: string; total: number; itemCount: number; placedAt: Date; shipped: boolean; customerId: string;}
        interface PaymentEvent {kind: 'payment'; id: string; amount: number; currency: string; processedAt: Date; refunded: boolean; txId: string;}
        interface SessionEvent {kind: 'session'; id: string; userId: string; startedAt: Date; durationMs: number; ipHash: string; device: string;}
        type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
        return createPrepareForJson<LargeObjectUnion>();
      },
      stringifyJson: () => {
        interface ProductEvent {kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number;}
        interface UserEvent {kind: 'user'; id: string; username: string; email: string; signedUpAt: Date; loginCount: number; isPremium: boolean;}
        interface OrderEvent {kind: 'order'; id: string; total: number; itemCount: number; placedAt: Date; shipped: boolean; customerId: string;}
        interface PaymentEvent {kind: 'payment'; id: string; amount: number; currency: string; processedAt: Date; refunded: boolean; txId: string;}
        interface SessionEvent {kind: 'session'; id: string; userId: string; startedAt: Date; durationMs: number; ipHash: string; device: string;}
        type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
        return createStringifyJson<LargeObjectUnion>();
      },
      restoreFromJson: () => {
        interface ProductEvent {kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number;}
        interface UserEvent {kind: 'user'; id: string; username: string; email: string; signedUpAt: Date; loginCount: number; isPremium: boolean;}
        interface OrderEvent {kind: 'order'; id: string; total: number; itemCount: number; placedAt: Date; shipped: boolean; customerId: string;}
        interface PaymentEvent {kind: 'payment'; id: string; amount: number; currency: string; processedAt: Date; refunded: boolean; txId: string;}
        interface SessionEvent {kind: 'session'; id: string; userId: string; startedAt: Date; durationMs: number; ipHash: string; device: string;}
        type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
        return createRestoreFromJson<LargeObjectUnion>();
      },
      getTestData: () => {
        interface ProductEvent {kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number;}
        return {
          values: [
            {
              kind: 'product',
              id: 'p-1',
              sku: 'SKU-001',
              price: 19.99,
              available: true,
              releasedAt: new Date('2024-02-01T00:00:00.000Z'),
              stock: 42,
            } satisfies ProductEvent,
          ],
        };
      },
    },
    mixed_union_atomic_and_large_objects: {
      title: 'mixed union — atomic + large object members',
      description:
        'string | number | ProductEvent | UserEvent — exercises the flat encoder atomic short-circuit alongside the merged-object envelope.',
      prepareForJson: () => {
        interface ProductEvent {kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number;}
        interface UserEvent {kind: 'user'; id: string; username: string; email: string; signedUpAt: Date; loginCount: number; isPremium: boolean;}
        type MixedLargeUnion = string | number | ProductEvent | UserEvent;
        return createPrepareForJson<MixedLargeUnion>();
      },
      stringifyJson: () => {
        interface ProductEvent {kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number;}
        interface UserEvent {kind: 'user'; id: string; username: string; email: string; signedUpAt: Date; loginCount: number; isPremium: boolean;}
        type MixedLargeUnion = string | number | ProductEvent | UserEvent;
        return createStringifyJson<MixedLargeUnion>();
      },
      restoreFromJson: () => {
        interface ProductEvent {kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number;}
        interface UserEvent {kind: 'user'; id: string; username: string; email: string; signedUpAt: Date; loginCount: number; isPremium: boolean;}
        type MixedLargeUnion = string | number | ProductEvent | UserEvent;
        return createRestoreFromJson<MixedLargeUnion>();
      },
      getTestData: () => {
        interface ProductEvent {kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number;}
        return {
          values: [
            {
              kind: 'product',
              id: 'p-9',
              sku: 'SKU-999',
              price: 49.5,
              available: false,
              releasedAt: new Date('2024-04-10T00:00:00.000Z'),
              stock: 0,
            } satisfies ProductEvent,
          ],
        };
      },
    },
    deep_nested: {
      title: 'five-level deeply nested object with arrays of objects',
      description: 'Walks five levels of nested arrays of objects to amplify per-property overhead.',
      prepareForJson: () => {
        interface DeepNestedLeaf {id: number; value: string; when: Date;}
        interface DeepNestedLevel5 {name: string; leaves: DeepNestedLeaf[];}
        interface DeepNestedLevel4 {label: string; children: DeepNestedLevel5[];}
        interface DeepNestedLevel3 {group: string; branches: DeepNestedLevel4[];}
        interface DeepNestedLevel2 {category: string; groups: DeepNestedLevel3[];}
        interface DeepNestedLevel1 {root: string; categories: DeepNestedLevel2[];}
        return createPrepareForJson<DeepNestedLevel1>();
      },
      stringifyJson: () => {
        interface DeepNestedLeaf {id: number; value: string; when: Date;}
        interface DeepNestedLevel5 {name: string; leaves: DeepNestedLeaf[];}
        interface DeepNestedLevel4 {label: string; children: DeepNestedLevel5[];}
        interface DeepNestedLevel3 {group: string; branches: DeepNestedLevel4[];}
        interface DeepNestedLevel2 {category: string; groups: DeepNestedLevel3[];}
        interface DeepNestedLevel1 {root: string; categories: DeepNestedLevel2[];}
        return createStringifyJson<DeepNestedLevel1>();
      },
      restoreFromJson: () => {
        interface DeepNestedLeaf {id: number; value: string; when: Date;}
        interface DeepNestedLevel5 {name: string; leaves: DeepNestedLeaf[];}
        interface DeepNestedLevel4 {label: string; children: DeepNestedLevel5[];}
        interface DeepNestedLevel3 {group: string; branches: DeepNestedLevel4[];}
        interface DeepNestedLevel2 {category: string; groups: DeepNestedLevel3[];}
        interface DeepNestedLevel1 {root: string; categories: DeepNestedLevel2[];}
        return createRestoreFromJson<DeepNestedLevel1>();
      },
      getTestData: () => {
        interface DeepNestedLeaf {id: number; value: string; when: Date;}
        interface DeepNestedLevel5 {name: string; leaves: DeepNestedLeaf[];}
        interface DeepNestedLevel4 {label: string; children: DeepNestedLevel5[];}
        interface DeepNestedLevel3 {group: string; branches: DeepNestedLevel4[];}
        interface DeepNestedLevel2 {category: string; groups: DeepNestedLevel3[];}
        interface DeepNestedLevel1 {root: string; categories: DeepNestedLevel2[];}
        const leaf: DeepNestedLeaf = {id: 1, value: 'leaf', when: new Date('2024-01-01T00:00:00.000Z')};
        const level5: DeepNestedLevel5 = {name: 'l5', leaves: [leaf, leaf, leaf]};
        const level4: DeepNestedLevel4 = {label: 'l4', children: [level5, level5]};
        const level3: DeepNestedLevel3 = {group: 'l3', branches: [level4, level4]};
        const level2: DeepNestedLevel2 = {category: 'l2', groups: [level3, level3]};
        const level1: DeepNestedLevel1 = {root: 'l1', categories: [level2, level2]};
        return {values: [level1]};
      },
    },
    large_class_union: {
      title: 'discriminated union of three large class instances',
      description:
        'Three-member class union — restore decodes to plain objects (class instances do not survive JSON round-trip).',
      prepareForJson: () => {
        class LargeClassA {
          kind!: 'classA';
          alpha!: string;
          count!: number;
          flag!: boolean;
          when!: Date;
          total!: bigint;
          tags!: string[];
        }
        class LargeClassB {
          kind!: 'classB';
          beta!: string;
          ratio!: number;
          enabled!: boolean;
          releasedAt!: Date;
          score!: bigint;
          metadata!: {label: string; weight: number};
        }
        class LargeClassC {
          kind!: 'classC';
          gamma!: string;
          amount!: number;
          paid!: boolean;
          processedAt!: Date;
          txId!: string;
          steps!: number[];
        }
        type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
        return createPrepareForJson<LargeClassUnion>();
      },
      stringifyJson: () => {
        class LargeClassA {
          kind!: 'classA';
          alpha!: string;
          count!: number;
          flag!: boolean;
          when!: Date;
          total!: bigint;
          tags!: string[];
        }
        class LargeClassB {
          kind!: 'classB';
          beta!: string;
          ratio!: number;
          enabled!: boolean;
          releasedAt!: Date;
          score!: bigint;
          metadata!: {label: string; weight: number};
        }
        class LargeClassC {
          kind!: 'classC';
          gamma!: string;
          amount!: number;
          paid!: boolean;
          processedAt!: Date;
          txId!: string;
          steps!: number[];
        }
        type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
        return createStringifyJson<LargeClassUnion>();
      },
      restoreFromJson: () => {
        class LargeClassA {
          kind!: 'classA';
          alpha!: string;
          count!: number;
          flag!: boolean;
          when!: Date;
          total!: bigint;
          tags!: string[];
        }
        class LargeClassB {
          kind!: 'classB';
          beta!: string;
          ratio!: number;
          enabled!: boolean;
          releasedAt!: Date;
          score!: bigint;
          metadata!: {label: string; weight: number};
        }
        class LargeClassC {
          kind!: 'classC';
          gamma!: string;
          amount!: number;
          paid!: boolean;
          processedAt!: Date;
          txId!: string;
          steps!: number[];
        }
        type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
        return createRestoreFromJson<LargeClassUnion>();
      },
      getTestData: () => {
        class LargeClassA {
          kind!: 'classA';
          alpha!: string;
          count!: number;
          flag!: boolean;
          when!: Date;
          total!: bigint;
          tags!: string[];
        }
        const a = new LargeClassA();
        a.kind = 'classA';
        a.alpha = 'alpha-value';
        a.count = 42;
        a.flag = true;
        a.when = new Date('2024-03-15T08:30:00.000Z');
        a.total = 10_000n;
        a.tags = ['x', 'y', 'z'];
        return {
          values: [a],
          deserializedValues: [{...a}],
        };
      },
    },
  },
} as const satisfies Record<string, Record<string, SerializationCase>>;
