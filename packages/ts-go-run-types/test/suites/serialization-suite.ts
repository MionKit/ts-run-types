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

import {createJsonDecoder, createJsonEncoder, type JsonDecoderFn, type JsonEncoderFn} from '@mionjs/ts-go-run-types';

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

  /** Encoder thunks — one per mode of `createJsonEncoder`.
   *  - `safeEncoder` builds `createJsonEncoder<T>()` (default mode
   *    `'safe'`, prepareForJsonSafe + JSON.stringify — clones declared
   *    keys, strips extras, no input mutation, native stringify perf).
   *  - `safeDirectEncoder` builds `createJsonEncoder<T>(undefined,
   *    {mode: 'safeDirect'})` (single-pass stringifyJson — no
   *    intermediate object, no input mutation, slower than native).
   *  - `unsafeEncoder` builds `createJsonEncoder<T>(undefined, {mode:
   *    'unsafe'})` (prepareForJson + JSON.stringify — mutates v, lets
   *    extras leak through).
   *  The adapter pairs each encoder mode with its same-mode decoder
   *  (`safeEncoder`/`safeDirectEncoder` both pair with `safeDecoder`). **/
  safeEncoder: () => JsonEncoderFn;
  safeDirectEncoder: () => JsonEncoderFn;
  unsafeEncoder: () => JsonEncoderFn;

  /** Safe-mode only: when set, the case's input produces a JSON string
   *  that is not parseable by `JSON.parse` — e.g. number-at-root with
   *  `Infinity` (mion's `String(Infinity)` = `"Infinity"`). Mirrors
   *  mion's number-not-supported spec, which accepts either a throw OR
   *  a non-matching round-trip as a "value not supported by JSON"
   *  signal. The safe loop asserts the parse-throws instead of a
   *  deep-equal round-trip. The unsafe loop ignores this flag — on
   *  that path `JSON.stringify(Infinity)` returns `"null"` (not a
   *  throw) and the case's own `deserializedValues` already handles
   *  the round-trip. **/
  safeAdapterStringifyJsonNotParseable?: boolean;

  /** Decoder thunks. `safeDecoder` builds `createJsonDecoder<T>()`
   *  (default mode `'safe'`: undeclared keys become `undefined` via
   *  unknownKeysToUndefined before restoreFromJson). `unsafeDecoder`
   *  builds `createJsonDecoder<T>(undefined, {mode: 'unsafe'})` —
   *  undeclared keys on the parsed value pass through to the restored
   *  result untouched. The round-trip adapter pairs each encoder mode
   *  with its same-mode decoder. **/
  safeDecoder: () => JsonDecoderFn;
  unsafeDecoder: () => JsonDecoderFn;

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
      unsafeEncoder: () => createJsonEncoder<string>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<string>(),
      safeDirectEncoder: () => createJsonEncoder<string>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<string>(),
      unsafeDecoder: () => createJsonDecoder<string>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
    },
    number: {
      title: 'number',
      unsafeEncoder: () => createJsonEncoder<number>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<number>(),
      safeDirectEncoder: () => createJsonEncoder<number>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<number>(),
      unsafeDecoder: () => createJsonDecoder<number>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<number>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<number>(),
      safeDirectEncoder: () => createJsonEncoder<number>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<number>(),
      unsafeDecoder: () => createJsonDecoder<number>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<RegExp>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<RegExp>(),
      safeDirectEncoder: () => createJsonEncoder<RegExp>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<RegExp>(),
      unsafeDecoder: () => createJsonDecoder<RegExp>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [/abc/, /xyz/i, /\d+/g, /^[a-z]+$/]}),
    },
    bigint: {
      title: 'bigint',
      unsafeEncoder: () => createJsonEncoder<bigint>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<bigint>(),
      safeDirectEncoder: () => createJsonEncoder<bigint>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<bigint>(),
      unsafeDecoder: () => createJsonDecoder<bigint>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [1n]}),
    },
    boolean: {
      title: 'boolean',
      unsafeEncoder: () => createJsonEncoder<boolean>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<boolean>(),
      safeDirectEncoder: () => createJsonEncoder<boolean>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<boolean>(),
      unsafeDecoder: () => createJsonDecoder<boolean>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [true]}),
    },
    any: {
      title: 'any',
      unsafeEncoder: () => createJsonEncoder<any>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<any>(),
      safeDirectEncoder: () => createJsonEncoder<any>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<any>(),
      unsafeDecoder: () => createJsonDecoder<any>(undefined, {mode: 'unsafe'}),
      roundTripBestEffort: true,
      getTestData: () => ({values: [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]]}),
    },
    not_supported_any: {
      title: 'not supported in JSON stringify when any type is used',
      description:
        'undefined / Date / BigInt are not natively JSON-encodable when the type is `any` (no per-kind transform applies).',
      unsafeEncoder: () => createJsonEncoder<any>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<any>(),
      safeDirectEncoder: () => createJsonEncoder<any>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<any>(),
      unsafeDecoder: () => createJsonDecoder<any>(undefined, {mode: 'unsafe'}),
      roundTripBestEffort: true,
      getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
    },
    null: {
      title: 'null',
      unsafeEncoder: () => createJsonEncoder<null>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<null>(),
      safeDirectEncoder: () => createJsonEncoder<null>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<null>(),
      unsafeDecoder: () => createJsonDecoder<null>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [null]}),
    },
    undefined: {
      title: 'undefined',
      unsafeEncoder: () => createJsonEncoder<undefined>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<undefined>(),
      safeDirectEncoder: () => createJsonEncoder<undefined>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<undefined>(),
      unsafeDecoder: () => createJsonDecoder<undefined>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [undefined]}),
    },
    date: {
      title: 'date',
      unsafeEncoder: () => createJsonEncoder<Date>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Date>(),
      safeDirectEncoder: () => createJsonEncoder<Date>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Date>(),
      unsafeDecoder: () => createJsonDecoder<Date>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
    },
    enum_color: {
      title: 'enum',
      unsafeEncoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createJsonEncoder<Color>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createJsonEncoder<Color>();
      },
      safeDirectEncoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createJsonEncoder<Color>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createJsonDecoder<Color>();
      },
      unsafeDecoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createJsonDecoder<Color>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => createJsonEncoder<symbol>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<symbol>(),
      safeDirectEncoder: () => createJsonEncoder<symbol>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<symbol>(),
      unsafeDecoder: () => createJsonDecoder<symbol>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [Symbol('foo'), Symbol()]}),
    },
    object: {
      title: 'object',
      unsafeEncoder: () => createJsonEncoder<object>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<object>(),
      safeDirectEncoder: () => createJsonEncoder<object>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<object>(),
      unsafeDecoder: () => createJsonDecoder<object>(undefined, {mode: 'unsafe'}),
      roundTripBestEffort: true,
      getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
    },
    void: {
      title: 'void',
      unsafeEncoder: () => createJsonEncoder<void>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<void>(),
      safeDirectEncoder: () => createJsonEncoder<void>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<void>(),
      unsafeDecoder: () => createJsonDecoder<void>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [undefined]}),
    },
    never: {
      title: 'never',
      description: 'never type cannot be JSON-encoded or decoded — invoking the factory throws.',
      unsafeEncoder: () => createJsonEncoder<never>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<never>(),
      safeDirectEncoder: () => createJsonEncoder<never>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<never>(),
      unsafeDecoder: () => createJsonDecoder<never>(undefined, {mode: 'unsafe'}),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    literal_string: {
      title: 'string literal',
      unsafeEncoder: () => createJsonEncoder<'hello'>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<'hello'>(),
      safeDirectEncoder: () => createJsonEncoder<'hello'>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<'hello'>(),
      unsafeDecoder: () => createJsonDecoder<'hello'>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: ['hello']}),
    },
    literal_number: {
      title: 'number literal',
      unsafeEncoder: () => createJsonEncoder<42>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<42>(),
      safeDirectEncoder: () => createJsonEncoder<42>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<42>(),
      unsafeDecoder: () => createJsonDecoder<42>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [42]}),
    },
    literal_boolean: {
      title: 'boolean literal',
      unsafeEncoder: () => createJsonEncoder<true>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<true>(),
      safeDirectEncoder: () => createJsonEncoder<true>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<true>(),
      unsafeDecoder: () => createJsonDecoder<true>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [true]}),
    },
    literal_regexp: {
      title: 'regexp literal',
      unsafeEncoder: () => {
        const reg = /abc/;
        return createJsonEncoder<typeof reg>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        const reg = /abc/;
        return createJsonEncoder<typeof reg>();
      },
      safeDirectEncoder: () => {
        const reg = /abc/;
        return createJsonEncoder<typeof reg>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        const reg = /abc/;
        return createJsonDecoder<typeof reg>();
      },
      unsafeDecoder: () => {
        const reg = /abc/;
        return createJsonDecoder<typeof reg>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({values: [/abc/]}),
    },
  },

  ARRAYS: {
    array: {
      title: 'array',
      unsafeEncoder: () => createJsonEncoder<string[]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<string[]>(),
      safeDirectEncoder: () => createJsonEncoder<string[]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<string[]>(),
      unsafeDecoder: () => createJsonDecoder<string[]>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [['hello', 'world'], []]}),
    },
    array_date: {
      title: 'array of dates',
      unsafeEncoder: () => createJsonEncoder<Date[]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Date[]>(),
      safeDirectEncoder: () => createJsonEncoder<Date[]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Date[]>(),
      unsafeDecoder: () => createJsonDecoder<Date[]>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({
        values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
      }),
    },
    undefined_in_array: {
      title: 'undefined is serialized as null in array',
      unsafeEncoder: () => createJsonEncoder<undefined[]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<undefined[]>(),
      safeDirectEncoder: () => createJsonEncoder<undefined[]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<undefined[]>(),
      unsafeDecoder: () => createJsonDecoder<undefined[]>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [[undefined, undefined]]}),
    },
    multi_dimensional: {
      title: 'multi dimensional array',
      unsafeEncoder: () => createJsonEncoder<string[][]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<string[][]>(),
      safeDirectEncoder: () => createJsonEncoder<string[][]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<string[][]>(),
      unsafeDecoder: () => createJsonDecoder<string[][]>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
    },
    non_serializable_in_array: {
      title: 'non serializable items throws an error',
      description: 'symbol[] should throw at JIT-compile time per mion semantic.',
      unsafeEncoder: () => createJsonEncoder<symbol[]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<symbol[]>(),
      safeDirectEncoder: () => createJsonEncoder<symbol[]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<symbol[]>(),
      unsafeDecoder: () => createJsonDecoder<symbol[]>(undefined, {mode: 'unsafe'}),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    array_circular: {
      title: 'array circular',
      unsafeEncoder: () => {
        type CircularArray = CircularArray[];
        return createJsonEncoder<CircularArray>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type CircularArray = CircularArray[];
        return createJsonEncoder<CircularArray>();
      },
      safeDirectEncoder: () => {
        type CircularArray = CircularArray[];
        return createJsonEncoder<CircularArray>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type CircularArray = CircularArray[];
        return createJsonDecoder<CircularArray>();
      },
      unsafeDecoder: () => {
        type CircularArray = CircularArray[];
        return createJsonDecoder<CircularArray>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () =>
        createJsonEncoder<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(undefined, {mode: 'unsafe'}),
      safeEncoder: () =>
        createJsonEncoder<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () =>
        createJsonDecoder<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(),
      unsafeDecoder: () =>
        createJsonDecoder<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createJsonEncoder<ManyOptional>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createJsonEncoder<ManyOptional>();
      },
      safeDirectEncoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createJsonEncoder<ManyOptional>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createJsonDecoder<ManyOptional>();
      },
      unsafeDecoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createJsonDecoder<ManyOptional>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({
        values: [{a0: 0, a1: 1, b0: 16, a8: 8, b7: 23, b15: 31}, {a0: 0, b8: 24}, {}],
      }),
    },
    class: {
      title: 'class',
      unsafeEncoder: () => {
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
        return createJsonEncoder<MySerializableClass>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
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
        return createJsonEncoder<MySerializableClass>();
      },
      safeDirectEncoder: () => {
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
        return createJsonEncoder<MySerializableClass>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
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
        return createJsonDecoder<MySerializableClass>();
      },
      unsafeDecoder: () => {
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
        return createJsonDecoder<MySerializableClass>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createJsonEncoder<ExtendedClass>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createJsonEncoder<ExtendedClass>();
      },
      safeDirectEncoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createJsonEncoder<ExtendedClass>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createJsonDecoder<ExtendedClass>();
      },
      unsafeDecoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createJsonDecoder<ExtendedClass>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
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
        return createJsonEncoder<NonSerializableClass>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
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
        return createJsonEncoder<NonSerializableClass>();
      },
      safeDirectEncoder: () => {
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
        return createJsonEncoder<NonSerializableClass>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
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
        return createJsonDecoder<NonSerializableClass>();
      },
      unsafeDecoder: () => {
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
        return createJsonDecoder<NonSerializableClass>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: string; b: number; c: undefined}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: string; b: number; c: undefined}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; b: number; c: undefined}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({
        values: [{a: 'hello', b: 42, c: undefined}],
        deserializedValues: [{a: 'hello', b: 42}],
      }),
    },
    optional_properties_order: {
      title: 'optional properties order',
      unsafeEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: string; b?: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: string; b?: string}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; b?: string}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}]}),
    },
    all_optional_fields: {
      title: 'all optional fields',
      unsafeEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a?: string; b?: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a?: string; b?: string}>(),
      unsafeDecoder: () => createJsonDecoder<{a?: string; b?: string}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}, {}]}),
    },
    extras_passthrough_unsafe: {
      title: 'unsafe path preserves extras (mion semantic — JSON.stringify does not strip)',
      description:
        "Canonical baseline for the `prepareForJson + JSON.stringify` path: declared children get transformed, structural extras (both top-level and nested-in-declared-composites) pass through unchanged. Mirrors mion's `03JsonObjects.spec.ts` strip-extras case where the strip expectation is explicitly commented out (`// native JSON.stringify do not strip extra params`). The safe path (`stripUnknownKeys + prepareForJson + JSON.stringify`) strips the extras — that divergence is exercised in EXTRA_PARAMS.",
      unsafeEncoder: () =>
        createJsonEncoder<{
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
        }>(undefined, {mode: 'unsafe'}),
      safeEncoder: () =>
        createJsonEncoder<{
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
      safeDirectEncoder: () =>
        createJsonEncoder<{
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
        }>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () =>
        createJsonDecoder<{
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
      unsafeDecoder: () =>
        createJsonDecoder<{
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
        }>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createJsonEncoder<ICircular>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createJsonEncoder<ICircular>();
      },
      safeDirectEncoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createJsonEncoder<ICircular>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createJsonDecoder<ICircular>();
      },
      unsafeDecoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createJsonDecoder<ICircular>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
    },
    interface_circular_array: {
      title: 'interface circular array',
      unsafeEncoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createJsonEncoder<ICircularArray>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createJsonEncoder<ICircularArray>();
      },
      safeDirectEncoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createJsonEncoder<ICircularArray>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createJsonDecoder<ICircularArray>();
      },
      unsafeDecoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createJsonDecoder<ICircularArray>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createJsonEncoder<ICircularDeep>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createJsonEncoder<ICircularDeep>();
      },
      safeDirectEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createJsonEncoder<ICircularDeep>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createJsonDecoder<ICircularDeep>();
      },
      unsafeDecoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createJsonDecoder<ICircularDeep>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createJsonEncoder<RootNotCircular>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createJsonEncoder<RootNotCircular>();
      },
      safeDirectEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createJsonEncoder<RootNotCircular>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createJsonDecoder<RootNotCircular>();
      },
      unsafeDecoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createJsonDecoder<RootNotCircular>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
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
        return createJsonEncoder<RootCircular>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
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
        return createJsonEncoder<RootCircular>();
      },
      safeDirectEncoder: () => {
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
        return createJsonEncoder<RootCircular>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
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
        return createJsonDecoder<RootCircular>();
      },
      unsafeDecoder: () => {
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
        return createJsonDecoder<RootCircular>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createJsonEncoder<ObjectWithMethods>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createJsonEncoder<ObjectWithMethods>();
      },
      safeDirectEncoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createJsonEncoder<ObjectWithMethods>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createJsonDecoder<ObjectWithMethods>();
      },
      unsafeDecoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createJsonDecoder<ObjectWithMethods>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{[key: string]: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: string}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: string]: string}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
    },
    index_property_and_prop: {
      title: 'interface with a single property and index property',
      unsafeEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
    },
    index_property_extra: {
      title: 'index property with extra props and unions',
      unsafeEncoder: () => createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
    },
    multiple_index_props: {
      title: 'multiple index properties (symbol keys skipped)',
      unsafeEncoder: () =>
        createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
    },
    index_property_nested_date: {
      title: 'index property nested with Date values',
      unsafeEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{[key: string]: bigint}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: bigint}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: string]: bigint}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({
        values: [
          {key1: 1n, key2: 2n},
          {hello: 1n, world: 2n},
        ],
      }),
    },
    index_property_non_root: {
      title: 'index property non-root',
      unsafeEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
      unsafeDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
    },
  },

  TUPLES: {
    tuple: {
      title: 'tuple',
      unsafeEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(),
      safeDirectEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<[Date, number, string, null, string[], bigint]>(),
      unsafeDecoder: () => createJsonDecoder<[Date, number, string, null, string[], bigint]>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({
        values: [[new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
      }),
    },
    tuple_with_optional: {
      title: 'tuple with optional params',
      unsafeEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(),
      safeDirectEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<[number, bigint?, boolean?, number?]>(),
      unsafeDecoder: () => createJsonDecoder<[number, bigint?, boolean?, number?]>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({
        values: [
          [3, undefined, true, 4],
          [446, undefined, undefined, undefined],
        ],
      }),
    },
    tuple_rest_parameter: {
      title: 'tuple rest parameter',
      unsafeEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<[number, ...bigint[]]>(),
      safeDirectEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<[number, ...bigint[]]>(),
      unsafeDecoder: () => createJsonDecoder<[number, ...bigint[]]>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [[34567, 1n, 2n, 3n], [3]]}),
    },
    tuple_with_non_serializable: {
      title: 'tuple with non serializable types are transformed to undefined',
      unsafeEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<[number, () => any]>(),
      safeDirectEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<[number, () => any]>(),
      unsafeDecoder: () => createJsonDecoder<[number, () => any]>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [[3, () => null]], deserializedValues: [[3, undefined]]}),
    },
    tuple_circular: {
      title: 'tuple circular',
      unsafeEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonEncoder<TupleCircular>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonEncoder<TupleCircular>();
      },
      safeDirectEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonEncoder<TupleCircular>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonDecoder<TupleCircular>();
      },
      unsafeDecoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonDecoder<TupleCircular>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createJsonEncoder<ICircularTuple>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createJsonEncoder<ICircularTuple>();
      },
      safeDirectEncoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createJsonEncoder<ICircularTuple>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createJsonDecoder<ICircularTuple>();
      },
      unsafeDecoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createJsonDecoder<ICircularTuple>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createJsonEncoder<Parameters<typeof fnNoOptional>>();
      },
      safeDirectEncoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createJsonDecoder<Parameters<typeof fnNoOptional>>();
      },
      unsafeDecoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createJsonDecoder<Parameters<typeof fnNoOptional>>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>();
      },
      safeDirectEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonDecoder<Parameters<typeof fnOptionalParams>>();
      },
      unsafeDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonDecoder<Parameters<typeof fnOptionalParams>>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => {
        const d = new Date('2000-08-06T02:13:00.000Z');
        return {values: [[d, true], [d]]};
      },
    },
    function_return: {
      title: 'function return',
      unsafeEncoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParam>>();
      },
      safeDirectEncoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonDecoder<ReturnType<typeof fnOptionalParam>>();
      },
      unsafeDecoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonDecoder<ReturnType<typeof fnOptionalParam>>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
    },
    function_with_rest_parameters: {
      title: 'function with rest parameters',
      unsafeEncoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnRestParams>>();
      },
      safeDirectEncoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createJsonDecoder<Parameters<typeof fnRestParams>>();
      },
      unsafeDecoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createJsonDecoder<Parameters<typeof fnRestParams>>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>();
      },
      safeDirectEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonDecoder<Parameters<typeof fnOptionalParams>>();
      },
      unsafeDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonDecoder<Parameters<typeof fnOptionalParams>>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => {
        const d = new Date('2000-08-06T02:13:00.000Z');
        return {values: [[d, true], [d]]};
      },
    },
    required_function_return: {
      title: 'required function return',
      unsafeEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParams>>();
      },
      safeDirectEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonDecoder<ReturnType<typeof fnOptionalParams>>();
      },
      unsafeDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonDecoder<ReturnType<typeof fnOptionalParams>>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({values: [1n]}),
    },
    function_with_only_rest_parameters: {
      title: 'function with only rest parameters',
      unsafeEncoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>();
      },
      safeDirectEncoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createJsonDecoder<Parameters<typeof fnOnlyRestParams>>();
      },
      unsafeDecoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createJsonDecoder<Parameters<typeof fnOnlyRestParams>>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({values: [[3, 2, 1], []]}),
    },
    non_serializable_params: {
      title: 'non serializable params',
      unsafeEncoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnWithCallback>>();
      },
      safeDirectEncoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonDecoder<Parameters<typeof fnWithCallback>>();
      },
      unsafeDecoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonDecoder<Parameters<typeof fnWithCallback>>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>();
      },
      safeDirectEncoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createJsonDecoder<ReturnType<typeof fnReturnsPromise>>();
      },
      unsafeDecoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createJsonDecoder<ReturnType<typeof fnReturnsPromise>>(undefined, {mode: 'unsafe'});
      },
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    function_return_type_is_function: {
      title: 'return type of a closure',
      description: 'fn returns another fn — non-serializable.',
      unsafeEncoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>();
      },
      safeDirectEncoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createJsonDecoder<ReturnType<typeof fnReturnsFunction>>();
      },
      unsafeDecoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createJsonDecoder<ReturnType<typeof fnReturnsFunction>>(undefined, {mode: 'unsafe'});
      },
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    call_signature_params: {
      title: 'call signature params',
      unsafeEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(),
      safeDirectEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Parameters<{(a: number, b: boolean): string}>>(),
      unsafeDecoder: () => createJsonDecoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [[3, true]]}),
    },
    call_signature_return: {
      title: 'call signature return',
      unsafeEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(),
      safeDirectEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<ReturnType<{(a: number, b: boolean): string}>>(),
      unsafeDecoder: () => createJsonDecoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: ['result']}),
    },
  },

  UTILITY_TYPES: {
    awaited: {
      title: 'Awaited<Promise<T>>',
      unsafeEncoder: () => createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      unsafeDecoder: () => createJsonDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    exclude_atomic: {
      title: 'Exclude on atomic union',
      unsafeEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(),
      safeDirectEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Exclude<'name' | 'age' | number, 'age'>>(),
      unsafeDecoder: () => createJsonDecoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: ['name', 3, 4]}),
    },
    exclude_objects: {
      title: 'Exclude on object union',
      unsafeEncoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createJsonEncoder<Exclude<Shape, Circle>>();
      },
      safeDirectEncoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createJsonDecoder<Exclude<Shape, Circle>>();
      },
      unsafeDecoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createJsonDecoder<Exclude<Shape, Circle>>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () =>
        createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({
        values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}],
      }),
    },
    extract_atomic: {
      title: 'Extract on atomic union',
      unsafeEncoder: () =>
        createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: ['name']}),
    },
    extract_objects: {
      title: 'Extract on object union',
      unsafeEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonEncoder<Extract<Shape, ToExtract>>();
      },
      safeDirectEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonDecoder<Extract<Shape, ToExtract>>();
      },
      unsafeDecoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonDecoder<Extract<Shape, ToExtract>>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({values: [{kind: 'square', x: 5}]}),
    },
    partial_properties: {
      title: 'Partial<T>',
      unsafeEncoder: () => createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Partial<{name: string; age: number; createdAt: Date}>>(),
      unsafeDecoder: () => createJsonDecoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {mode: 'unsafe'}),
      getTestData: () => {
        const createdAt = new Date('2000-08-06T02:13:00.000Z');
        return {values: [{name: 'John'}, {age: 30}, {createdAt}, {}]};
      },
    },
    pick_properties: {
      title: 'Pick<T, K>',
      unsafeEncoder: () =>
        createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
          mode: 'unsafe',
        }),
      safeEncoder: () =>
        createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
          mode: 'safeDirect',
        }),
      safeDecoder: () =>
        createJsonDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
          mode: 'unsafe',
        }),
      getTestData: () => ({values: [{name: 'John', createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    omit_properties: {
      title: 'Omit<T, K>',
      unsafeEncoder: () =>
        createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
          mode: 'unsafe',
        }),
      safeEncoder: () => createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
          mode: 'safeDirect',
        }),
      safeDecoder: () => createJsonDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
          mode: 'unsafe',
        }),
      getTestData: () => ({values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    record_type: {
      title: 'Record<string, Date>',
      unsafeEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Record<string, Date>>(),
      safeDirectEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Record<string, Date>>(),
      unsafeDecoder: () => createJsonDecoder<Record<string, Date>>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(),
      safeDirectEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Date | number | string | null | bigint>(),
      unsafeDecoder: () => createJsonDecoder<Date | number | string | null | bigint>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, 3n]}),
    },
    union_array: {
      title: 'union of arrays',
      unsafeEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(),
      safeDirectEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<string[] | number[] | boolean[] | Date[]>(),
      unsafeDecoder: () => createJsonDecoder<string[] | number[] | boolean[] | Date[]>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(),
      safeDirectEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<(string | bigint | boolean | Date)[]>(),
      unsafeDecoder: () => createJsonDecoder<(string | bigint | boolean | Date)[]>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () =>
        createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{a: 'world', aa: true}, {c: 1n}, {d: 'hello'}, {}]}),
    },
    union_with_discriminator_property: {
      title: 'union with discriminator property',
      unsafeEncoder: () =>
        createJsonEncoder<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(undefined, {mode: 'unsafe'}),
      safeEncoder: () =>
        createJsonEncoder<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(),
      safeDirectEncoder: () =>
        createJsonEncoder<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(undefined, {mode: 'safeDirect'}),
      safeDecoder: () =>
        createJsonDecoder<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(),
      unsafeDecoder: () =>
        createJsonDecoder<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
          undefined,
          {mode: 'unsafe'}
        ),
      safeEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
          undefined,
          {mode: 'safeDirect'}
        ),
      safeDecoder: () =>
        createJsonDecoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      unsafeDecoder: () =>
        createJsonDecoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
          undefined,
          {mode: 'unsafe'}
        ),
      getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}]}),
    },
    union_index_property_with_discriminator: {
      title: 'union with index property and discriminator',
      unsafeEncoder: () =>
        createJsonEncoder<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(undefined, {mode: 'unsafe'}),
      safeEncoder: () =>
        createJsonEncoder<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      safeDirectEncoder: () =>
        createJsonEncoder<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(undefined, {mode: 'safeDirect'}),
      safeDecoder: () =>
        createJsonDecoder<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      unsafeDecoder: () =>
        createJsonDecoder<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}, {b: 1n, c: 2n}]}),
    },
    circular_union_with_discriminator: {
      title: 'Circular union with discriminator',
      unsafeEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonEncoder<UnionC>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonEncoder<UnionC>();
      },
      safeDirectEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonEncoder<UnionC>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonDecoder<UnionC>();
      },
      unsafeDecoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonDecoder<UnionC>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () =>
        createJsonEncoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(undefined, {mode: 'unsafe'}),
      safeEncoder: () =>
        createJsonEncoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      safeDirectEncoder: () =>
        createJsonEncoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(undefined, {mode: 'safeDirect'}),
      safeDecoder: () =>
        createJsonDecoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      unsafeDecoder: () =>
        createJsonDecoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<number | {name: string} | any>(),
      safeDirectEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<number | {name: string} | any>(),
      unsafeDecoder: () => createJsonDecoder<number | {name: string} | any>(undefined, {mode: 'unsafe'}),
      roundTripBestEffort: true,
      getTestData: () => ({values: [42, {name: 'test'}, 'fallback to any', true, null]}),
    },
    union_with_non_serializable: {
      title: 'union with non-serializable type throws',
      description: 'function in union — mion throws at JIT-compile time.',
      unsafeEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(),
      safeDirectEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Date | number | string | (() => any)>(),
      unsafeDecoder: () => createJsonDecoder<Date | number | string | (() => any)>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: string} | {b: number}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: string} | {b: number}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string} | {b: number}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: string} | {b: number}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: string} | {b: number}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string} | {b: number}>(undefined, {mode: 'unsafe'}),
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

    // ----------------------------------------------------------------
    // Flattened-union shared-prop cases. When two union members declare
    // a property with the same name, the flattened shape treats that
    // property as a union of the per-member declared types. Round-trip
    // is all-or-nothing per member: encode AND decode must dispatch to
    // the matched member and apply that member's per-prop transform —
    // never compose transforms across members. Each case exercises
    // both encoder modes against both decoder modes via the adapter.
    // ----------------------------------------------------------------

    shared_prop_same_type: {
      title: 'shared prop — same declared type in both members (Date)',
      description:
        'Discriminator `kind` selects the member; shared prop `at: Date` has the identical transform on both branches, so the round-trip only needs to prove that the dispatch does not lose the prop or double-transform it.',
      unsafeEncoder: () =>
        createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
          mode: 'unsafe',
        }),
      safeEncoder: () =>
        createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
          mode: 'safeDirect',
        }),
      safeDecoder: () =>
        createJsonDecoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
          mode: 'unsafe',
        }),
      getTestData: () => ({
        values: [
          {kind: 'created', at: new Date('2000-08-06T02:13:00.000Z'), by: 'alice'},
          {kind: 'updated', at: new Date('2001-09-07T03:14:00.000Z'), reviewers: ['bob', 'carol']},
        ],
      }),
    },

    shared_prop_divergent_date_string: {
      title: 'shared prop — Date in one member, string in the other',
      description:
        'Discriminator `kind` resolves which member matched. Shared prop `when: Date | string` MUST take the matched-member transform: `kind:event` → Date↔ISO; `kind:note` → raw string passthrough. Composing both transforms would corrupt either branch (a `Date.toISOString()` reapplied to a plain string, or a string parsed as Date when it should not be).',
      unsafeEncoder: () =>
        createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
          mode: 'unsafe',
        }),
      safeEncoder: () =>
        createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
          mode: 'safeDirect',
        }),
      safeDecoder: () =>
        createJsonDecoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
          mode: 'unsafe',
        }),
      getTestData: () => ({
        values: [
          {kind: 'event', when: new Date('2000-08-06T02:13:00.000Z'), label: 'kickoff'},
          {kind: 'note', when: 'tomorrow morning', label: 'reminder'},
        ],
      }),
    },

    shared_prop_divergent_bigint_number: {
      title: 'shared prop — bigint in one member, number in the other',
      description:
        'Discriminator `form` resolves the member. Shared prop `id: bigint | number` must follow the matched-member transform: `form:big` → bigint↔string; `form:small` → raw number. Other shared prop `label: string` is identical on both branches and must survive either dispatch.',
      unsafeEncoder: () =>
        createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
          mode: 'unsafe',
        }),
      safeEncoder: () =>
        createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
          mode: 'safeDirect',
        }),
      safeDecoder: () =>
        createJsonDecoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
          mode: 'unsafe',
        }),
      getTestData: () => ({
        values: [
          {form: 'big', id: 9007199254740993n, label: 'beyond Number.MAX_SAFE_INTEGER'},
          {form: 'small', id: 42, label: 'fits in number'},
        ],
      }),
    },

    shared_prop_no_discriminator_structural: {
      title: 'shared prop — no literal discriminator, member resolved structurally',
      description:
        'No tag-like literal field. Members differentiated by (a) shared prop `a` having divergent type (string vs boolean — a sub-union) and (b) unique companion props (`b: number` vs `c: Date`). The encoder/decoder dispatch must work purely on shape: which member’s required props match the input. Verifies the dispatch is not silently relying on a literal-discriminator fast path.',
      unsafeEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: string; b: number} | {a: boolean; c: Date}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({
        values: [
          {a: 'hello', b: 7},
          {a: true, c: new Date('2000-08-06T02:13:00.000Z')},
        ],
      }),
    },
  },

  ITERABLES: {
    set_string: {
      title: 'Set<string>',
      unsafeEncoder: () => createJsonEncoder<Set<string>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Set<string>>(),
      safeDirectEncoder: () => createJsonEncoder<Set<string>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Set<string>>(),
      unsafeDecoder: () => createJsonDecoder<Set<string>>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [new Set<string>(['one', 'two', 'three'])]}),
    },
    set_small_object: {
      title: 'Set<SmallObject>',
      unsafeEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Set<SmallObject>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Set<SmallObject>>();
      },
      safeDirectEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Set<SmallObject>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonDecoder<Set<SmallObject>>();
      },
      unsafeDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonDecoder<Set<SmallObject>>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createJsonEncoder<DeepWithSet>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createJsonEncoder<DeepWithSet>();
      },
      safeDirectEncoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createJsonEncoder<DeepWithSet>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createJsonDecoder<DeepWithSet>();
      },
      unsafeDecoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createJsonDecoder<DeepWithSet>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Map<string, number>>(),
      safeDirectEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Map<string, number>>(),
      unsafeDecoder: () => createJsonDecoder<Map<string, number>>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<string, SmallObject>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<string, SmallObject>>();
      },
      safeDirectEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<string, SmallObject>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonDecoder<Map<string, SmallObject>>();
      },
      unsafeDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonDecoder<Map<string, SmallObject>>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<SmallObject, number>>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<SmallObject, number>>();
      },
      safeDirectEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<SmallObject, number>>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonDecoder<Map<SmallObject, number>>();
      },
      unsafeDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonDecoder<Map<SmallObject, number>>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createJsonEncoder<DeepWithMap>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createJsonEncoder<DeepWithMap>();
      },
      safeDirectEncoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createJsonEncoder<DeepWithMap>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createJsonDecoder<DeepWithMap>();
      },
      unsafeDecoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createJsonDecoder<DeepWithMap>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Map<bigint, number>>(),
      safeDirectEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Map<bigint, number>>(),
      unsafeDecoder: () => createJsonDecoder<Map<bigint, number>>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Map<string, Date>>(),
      safeDirectEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Map<string, Date>>(),
      unsafeDecoder: () => createJsonDecoder<Map<string, Date>>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonEncoder<CircularObject>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonEncoder<CircularObject>();
      },
      safeDirectEncoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonEncoder<CircularObject>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonDecoder<CircularObject>();
      },
      unsafeDecoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonDecoder<CircularObject>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
    },
    circular_union_array: {
      title: 'CircularUnion array with discriminator',
      unsafeEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonEncoder<CuArray>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonEncoder<CuArray>();
      },
      safeDirectEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonEncoder<CuArray>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonDecoder<CuArray>();
      },
      unsafeDecoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonDecoder<CuArray>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createJsonEncoder<CircularTuple>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createJsonEncoder<CircularTuple>();
      },
      safeDirectEncoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createJsonEncoder<CircularTuple>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createJsonDecoder<CircularTuple>();
      },
      unsafeDecoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createJsonDecoder<CircularTuple>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({
        values: [{list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]}, {list: [1n, {list: [2n]}]}, {list: [1n]}],
      }),
    },
    circular_index: {
      title: 'CircularIndex object with discriminator',
      unsafeEncoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createJsonEncoder<CircularIndex>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createJsonEncoder<CircularIndex>();
      },
      safeDirectEncoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createJsonEncoder<CircularIndex>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createJsonDecoder<CircularIndex>();
      },
      unsafeDecoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createJsonDecoder<CircularIndex>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({
        values: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
      }),
    },
    circular_deep: {
      title: 'CircularDeep object with discriminator',
      unsafeEncoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createJsonEncoder<CircularDeep>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createJsonEncoder<CircularDeep>();
      },
      safeDirectEncoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createJsonEncoder<CircularDeep>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createJsonDecoder<CircularDeep>();
      },
      unsafeDecoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createJsonDecoder<CircularDeep>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({
        values: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
      }),
    },
    circular_tuple_complex: {
      title: 'Circular tuple with complex structure',
      unsafeEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonEncoder<CircularTupleComplex>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonEncoder<CircularTupleComplex>();
      },
      safeDirectEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonEncoder<CircularTupleComplex>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonDecoder<CircularTupleComplex>();
      },
      unsafeDecoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonDecoder<CircularTupleComplex>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => ({values: [[1n, [2n, [3n, [4n]]]], [1n, [2n]], [1n]]}),
    },
    object_with_circular_array: {
      title: 'object with circular array',
      unsafeEncoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createJsonEncoder<ObjCircularArr>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createJsonEncoder<ObjCircularArr>();
      },
      safeDirectEncoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createJsonEncoder<ObjCircularArr>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createJsonDecoder<ObjCircularArr>();
      },
      unsafeDecoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createJsonDecoder<ObjCircularArr>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<`api/users/${number}`>(),
      safeDirectEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<`api/users/${number}`>(),
      unsafeDecoder: () => createJsonDecoder<`api/users/${number}`>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(),
      unsafeDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
    },
    url_index_key_with_named: {
      title: 'template literal index key + sibling named property',
      unsafeEncoder: () =>
        createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {mode: 'unsafe'}),
      getTestData: () => ({
        values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
      }),
    },
  },

  OTHERS: {
    promise_jsonStringify_error: {
      title: 'Promise top-level throws',
      unsafeEncoder: () => createJsonEncoder<Promise<string>>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Promise<string>>(),
      safeDirectEncoder: () => createJsonEncoder<Promise<string>>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Promise<string>>(),
      unsafeDecoder: () => createJsonDecoder<Promise<string>>(undefined, {mode: 'unsafe'}),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable: {
      title: 'non-serializable type throws (Int8Array)',
      unsafeEncoder: () => createJsonEncoder<Int8Array>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Int8Array>(),
      safeDirectEncoder: () => createJsonEncoder<Int8Array>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Int8Array>(),
      unsafeDecoder: () => createJsonDecoder<Int8Array>(undefined, {mode: 'unsafe'}),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_interface: {
      title: 'non-serializable inside interface throws',
      unsafeEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{a: Int8Array}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{a: Int8Array}>(),
      unsafeDecoder: () => createJsonDecoder<{a: Int8Array}>(undefined, {mode: 'unsafe'}),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_array: {
      title: 'non-serializable inside array throws',
      unsafeEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<Int8Array[]>(),
      safeDirectEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<Int8Array[]>(),
      unsafeDecoder: () => createJsonDecoder<Int8Array[]>(undefined, {mode: 'unsafe'}),
      throwsAtCompile: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_tuple: {
      title: 'non-serializable inside tuple throws',
      unsafeEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<[Int8Array]>(),
      safeDirectEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<[Int8Array]>(),
      unsafeDecoder: () => createJsonDecoder<[Int8Array]>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{declared: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{declared: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{declared: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{declared: string}>(),
      unsafeDecoder: () => createJsonDecoder<{declared: string}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{declared: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{declared: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{declared: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{declared: string}>(),
      unsafeDecoder: () => createJsonDecoder<{declared: string}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{declared: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{declared: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{declared: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{declared: string}>(),
      unsafeDecoder: () => createJsonDecoder<{declared: string}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{declared: string}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{declared: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{declared: string}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{declared: string}>(),
      unsafeDecoder: () => createJsonDecoder<{declared: string}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {mode: 'unsafe'}),
      safeEncoder: () => createJsonEncoder<{outer: {declared: string}}>(),
      safeDirectEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {mode: 'safeDirect'}),
      safeDecoder: () => createJsonDecoder<{outer: {declared: string}}>(),
      unsafeDecoder: () => createJsonDecoder<{outer: {declared: string}}>(undefined, {mode: 'unsafe'}),
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
      unsafeEncoder: () => {
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
        return createJsonEncoder<WideRecord>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
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
        return createJsonEncoder<WideRecord>();
      },
      safeDirectEncoder: () => {
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
        return createJsonEncoder<WideRecord>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
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
        return createJsonDecoder<WideRecord>();
      },
      unsafeDecoder: () => {
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
        return createJsonDecoder<WideRecord>(undefined, {mode: 'unsafe'});
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
      unsafeEncoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        interface OrderEvent {
          kind: 'order';
          id: string;
          total: number;
          itemCount: number;
          placedAt: Date;
          shipped: boolean;
          customerId: string;
        }
        interface PaymentEvent {
          kind: 'payment';
          id: string;
          amount: number;
          currency: string;
          processedAt: Date;
          refunded: boolean;
          txId: string;
        }
        interface SessionEvent {
          kind: 'session';
          id: string;
          userId: string;
          startedAt: Date;
          durationMs: number;
          ipHash: string;
          device: string;
        }
        type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
        return createJsonEncoder<LargeObjectUnion>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        interface OrderEvent {
          kind: 'order';
          id: string;
          total: number;
          itemCount: number;
          placedAt: Date;
          shipped: boolean;
          customerId: string;
        }
        interface PaymentEvent {
          kind: 'payment';
          id: string;
          amount: number;
          currency: string;
          processedAt: Date;
          refunded: boolean;
          txId: string;
        }
        interface SessionEvent {
          kind: 'session';
          id: string;
          userId: string;
          startedAt: Date;
          durationMs: number;
          ipHash: string;
          device: string;
        }
        type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
        return createJsonEncoder<LargeObjectUnion>();
      },
      safeDirectEncoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        interface OrderEvent {
          kind: 'order';
          id: string;
          total: number;
          itemCount: number;
          placedAt: Date;
          shipped: boolean;
          customerId: string;
        }
        interface PaymentEvent {
          kind: 'payment';
          id: string;
          amount: number;
          currency: string;
          processedAt: Date;
          refunded: boolean;
          txId: string;
        }
        interface SessionEvent {
          kind: 'session';
          id: string;
          userId: string;
          startedAt: Date;
          durationMs: number;
          ipHash: string;
          device: string;
        }
        type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
        return createJsonEncoder<LargeObjectUnion>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        interface OrderEvent {
          kind: 'order';
          id: string;
          total: number;
          itemCount: number;
          placedAt: Date;
          shipped: boolean;
          customerId: string;
        }
        interface PaymentEvent {
          kind: 'payment';
          id: string;
          amount: number;
          currency: string;
          processedAt: Date;
          refunded: boolean;
          txId: string;
        }
        interface SessionEvent {
          kind: 'session';
          id: string;
          userId: string;
          startedAt: Date;
          durationMs: number;
          ipHash: string;
          device: string;
        }
        type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
        return createJsonDecoder<LargeObjectUnion>();
      },
      unsafeDecoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        interface OrderEvent {
          kind: 'order';
          id: string;
          total: number;
          itemCount: number;
          placedAt: Date;
          shipped: boolean;
          customerId: string;
        }
        interface PaymentEvent {
          kind: 'payment';
          id: string;
          amount: number;
          currency: string;
          processedAt: Date;
          refunded: boolean;
          txId: string;
        }
        interface SessionEvent {
          kind: 'session';
          id: string;
          userId: string;
          startedAt: Date;
          durationMs: number;
          ipHash: string;
          device: string;
        }
        type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
        return createJsonDecoder<LargeObjectUnion>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
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
      unsafeEncoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        type MixedLargeUnion = string | number | ProductEvent | UserEvent;
        return createJsonEncoder<MixedLargeUnion>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        type MixedLargeUnion = string | number | ProductEvent | UserEvent;
        return createJsonEncoder<MixedLargeUnion>();
      },
      safeDirectEncoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        type MixedLargeUnion = string | number | ProductEvent | UserEvent;
        return createJsonEncoder<MixedLargeUnion>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        type MixedLargeUnion = string | number | ProductEvent | UserEvent;
        return createJsonDecoder<MixedLargeUnion>();
      },
      unsafeDecoder: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
        interface UserEvent {
          kind: 'user';
          id: string;
          username: string;
          email: string;
          signedUpAt: Date;
          loginCount: number;
          isPremium: boolean;
        }
        type MixedLargeUnion = string | number | ProductEvent | UserEvent;
        return createJsonDecoder<MixedLargeUnion>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => {
        interface ProductEvent {
          kind: 'product';
          id: string;
          sku: string;
          price: number;
          available: boolean;
          releasedAt: Date;
          stock: number;
        }
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
      unsafeEncoder: () => {
        interface DeepNestedLeaf {
          id: number;
          value: string;
          when: Date;
        }
        interface DeepNestedLevel5 {
          name: string;
          leaves: DeepNestedLeaf[];
        }
        interface DeepNestedLevel4 {
          label: string;
          children: DeepNestedLevel5[];
        }
        interface DeepNestedLevel3 {
          group: string;
          branches: DeepNestedLevel4[];
        }
        interface DeepNestedLevel2 {
          category: string;
          groups: DeepNestedLevel3[];
        }
        interface DeepNestedLevel1 {
          root: string;
          categories: DeepNestedLevel2[];
        }
        return createJsonEncoder<DeepNestedLevel1>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
        interface DeepNestedLeaf {
          id: number;
          value: string;
          when: Date;
        }
        interface DeepNestedLevel5 {
          name: string;
          leaves: DeepNestedLeaf[];
        }
        interface DeepNestedLevel4 {
          label: string;
          children: DeepNestedLevel5[];
        }
        interface DeepNestedLevel3 {
          group: string;
          branches: DeepNestedLevel4[];
        }
        interface DeepNestedLevel2 {
          category: string;
          groups: DeepNestedLevel3[];
        }
        interface DeepNestedLevel1 {
          root: string;
          categories: DeepNestedLevel2[];
        }
        return createJsonEncoder<DeepNestedLevel1>();
      },
      safeDirectEncoder: () => {
        interface DeepNestedLeaf {
          id: number;
          value: string;
          when: Date;
        }
        interface DeepNestedLevel5 {
          name: string;
          leaves: DeepNestedLeaf[];
        }
        interface DeepNestedLevel4 {
          label: string;
          children: DeepNestedLevel5[];
        }
        interface DeepNestedLevel3 {
          group: string;
          branches: DeepNestedLevel4[];
        }
        interface DeepNestedLevel2 {
          category: string;
          groups: DeepNestedLevel3[];
        }
        interface DeepNestedLevel1 {
          root: string;
          categories: DeepNestedLevel2[];
        }
        return createJsonEncoder<DeepNestedLevel1>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
        interface DeepNestedLeaf {
          id: number;
          value: string;
          when: Date;
        }
        interface DeepNestedLevel5 {
          name: string;
          leaves: DeepNestedLeaf[];
        }
        interface DeepNestedLevel4 {
          label: string;
          children: DeepNestedLevel5[];
        }
        interface DeepNestedLevel3 {
          group: string;
          branches: DeepNestedLevel4[];
        }
        interface DeepNestedLevel2 {
          category: string;
          groups: DeepNestedLevel3[];
        }
        interface DeepNestedLevel1 {
          root: string;
          categories: DeepNestedLevel2[];
        }
        return createJsonDecoder<DeepNestedLevel1>();
      },
      unsafeDecoder: () => {
        interface DeepNestedLeaf {
          id: number;
          value: string;
          when: Date;
        }
        interface DeepNestedLevel5 {
          name: string;
          leaves: DeepNestedLeaf[];
        }
        interface DeepNestedLevel4 {
          label: string;
          children: DeepNestedLevel5[];
        }
        interface DeepNestedLevel3 {
          group: string;
          branches: DeepNestedLevel4[];
        }
        interface DeepNestedLevel2 {
          category: string;
          groups: DeepNestedLevel3[];
        }
        interface DeepNestedLevel1 {
          root: string;
          categories: DeepNestedLevel2[];
        }
        return createJsonDecoder<DeepNestedLevel1>(undefined, {mode: 'unsafe'});
      },
      getTestData: () => {
        interface DeepNestedLeaf {
          id: number;
          value: string;
          when: Date;
        }
        interface DeepNestedLevel5 {
          name: string;
          leaves: DeepNestedLeaf[];
        }
        interface DeepNestedLevel4 {
          label: string;
          children: DeepNestedLevel5[];
        }
        interface DeepNestedLevel3 {
          group: string;
          branches: DeepNestedLevel4[];
        }
        interface DeepNestedLevel2 {
          category: string;
          groups: DeepNestedLevel3[];
        }
        interface DeepNestedLevel1 {
          root: string;
          categories: DeepNestedLevel2[];
        }
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
      unsafeEncoder: () => {
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
        return createJsonEncoder<LargeClassUnion>(undefined, {mode: 'unsafe'});
      },
      safeEncoder: () => {
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
        return createJsonEncoder<LargeClassUnion>();
      },
      safeDirectEncoder: () => {
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
        return createJsonEncoder<LargeClassUnion>(undefined, {mode: 'safeDirect'});
      },
      safeDecoder: () => {
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
        return createJsonDecoder<LargeClassUnion>();
      },
      unsafeDecoder: () => {
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
        return createJsonDecoder<LargeClassUnion>(undefined, {mode: 'unsafe'});
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
