// Serialization suite ported from
// mion/packages/run-types/src/rtCompilers/serialization-suite.ts.
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
  createBinaryDecoder,
  createBinaryEncoder,
  createJsonDecoder,
  createJsonEncoder,
  type BinaryDecoderFn,
  type BinaryEncoderFn,
  type JsonDecoderFn,
  type JsonEncoderFn,
} from '@mionjs/ts-go-run-types';

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

  /** Encoder thunks — one per encoder shape exercised by the suite.
   *  All five combinations of (strategy, stripExtras) are benched:
   *  - `safeEncoder` — strategy='clone', stripExtras=true (default).
   *  - `clonePreserveEncoder` — strategy='clone', stripExtras=false.
   *  - `mutateStripEncoder` — strategy='mutate', stripExtras=true.
   *  - `unsafeEncoder` — strategy='mutate', stripExtras=false.
   *  - `safeDirectEncoder` — strategy='direct' (stripExtras pinned true).
   *  Decoder pairing: `safeEncoder` / `clonePreserveEncoder` /
   *  `mutateStripEncoder` / `safeDirectEncoder` pair with `safeDecoder`;
   *  `unsafeEncoder` pairs with `unsafeDecoder` (the only path that
   *  preserves extras through the round-trip). **/
  safeEncoder: () => JsonEncoderFn;
  clonePreserveEncoder: () => JsonEncoderFn;
  mutateStripEncoder: () => JsonEncoderFn;
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
   *  (default `stripExtras: true`: undeclared keys become `undefined`
   *  via ukuWire before restoreFromJson). `unsafeDecoder` builds
   *  `createJsonDecoder<T>(undefined, {stripExtras: false})` —
   *  undeclared keys on the parsed value pass through to the restored
   *  result untouched. The round-trip adapter pairs each encoder
   *  shape with its corresponding decoder. **/
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

  /** When `createXxx<T>()` is rendered as an alwaysThrow cache entry
   *  by the Go pipeline (e.g. `never`, root `symbol`, function-typed
   *  tuple slot, Promise root, …). Calling the factory throws at the
   *  first lookup — the materialised throwing stub fires inside
   *  `lookupRTFn` before returning to the caller. Tests assert the
   *  throw at the thunk-invocation site rather than a successful
   *  round-trip. See docs/UNSUPPORTED-KINDS.md. **/
  factoryThrows?: boolean;

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

  /** Binary encoder thunk for this case. Mirrors the structure of the
   *  JSON encoder thunks (full type setup inline so the marker plugin
   *  can inject the runtype hash at the call site). The adapter pairs
   *  it with `binaryDecoder` for a deep-equal round-trip assertion. **/
  binaryEncoder?: () => BinaryEncoderFn;

  /** Binary decoder thunk. Must come paired with `binaryEncoder`. **/
  binaryDecoder?: () => BinaryDecoderFn;

  /** Override `factoryThrows` for binary alone. Use only when binary
   *  has a different unsupported-kind contract than JSON (e.g. a kind
   *  binary refuses but JSON accepts, or vice versa). Falls back to
   *  `factoryThrows` when unset. **/
  binaryFactoryThrows?: boolean;

  /** Override `getTestData` for binary alone. Use only when binary's
   *  round-trip diverges from JSON — e.g. bigint extras that
   *  JSON.stringify rejects but binary encodes natively. Falls back
   *  to `getTestData` when unset. **/
  getBinaryTestData?: () => {values: unknown[]; deserializedValues?: unknown[]};

  /** Optional expected encoded byte length per value, index-parallel to
   *  the resolved binary test-data `values`. When present, the binary
   *  adapter asserts `encode(value).byteLength === size[i]` — this is what
   *  locks in the format binary optimization (number int8→1, int16→2,
   *  …float64→8; bigint 64-bit→8). Omit for variable-length encodings
   *  (string-fallback bigint, objects, arrays). **/
  getBinaryByteSizes?: () => number[];
}

// Re-exports so the binary adapter (and any future suite consumer) can
// import the factory pair from the same module as `SERIALIZATION_SPEC`.
export {createBinaryEncoder, createBinaryDecoder};

export const SERIALIZATION_SPEC = {
  ATOMIC: {
    string: {
      title: 'string',
      unsafeEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<string>(),
      safeDirectEncoder: () => createJsonEncoder<string>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<string>(),
      unsafeDecoder: () => createJsonDecoder<string>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<string>(),
      binaryDecoder: () => createBinaryDecoder<string>(),
      getTestData: () => ({values: ['hello', '', 'world', '', '你好', 'مرحبا', 'Здравствуйте', '🌍🚀✨']}),
    },
    number: {
      title: 'number',
      unsafeEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<number>(),
      safeDirectEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<number>(),
      unsafeDecoder: () => createJsonDecoder<number>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<number>(),
      binaryDecoder: () => createBinaryDecoder<number>(),
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
      unsafeEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<number>(),
      safeDirectEncoder: () => createJsonEncoder<number>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<number>(),
      unsafeDecoder: () => createJsonDecoder<number>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<number>(),
      binaryDecoder: () => createBinaryDecoder<number>(),
      // Binary writes float64, which preserves Infinity/NaN natively —
      // no conversion to null like JSON.stringify does.
      getBinaryTestData: () => ({
        values: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
        deserializedValues: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN],
      }),
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
      unsafeEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<RegExp>(),
      safeDirectEncoder: () => createJsonEncoder<RegExp>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<RegExp>(),
      unsafeDecoder: () => createJsonDecoder<RegExp>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<RegExp>(),
      binaryDecoder: () => createBinaryDecoder<RegExp>(),
      getTestData: () => ({values: [/abc/, /xyz/i, /\d+/g, /^[a-z]+$/]}),
    },
    bigint: {
      title: 'bigint',
      unsafeEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<bigint>(),
      safeDirectEncoder: () => createJsonEncoder<bigint>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<bigint>(),
      unsafeDecoder: () => createJsonDecoder<bigint>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<bigint>(),
      binaryDecoder: () => createBinaryDecoder<bigint>(),
      getTestData: () => ({values: [1n]}),
    },
    boolean: {
      title: 'boolean',
      unsafeEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<boolean>(),
      safeDirectEncoder: () => createJsonEncoder<boolean>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<boolean>(),
      unsafeDecoder: () => createJsonDecoder<boolean>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<boolean>(),
      binaryDecoder: () => createBinaryDecoder<boolean>(),
      getTestData: () => ({values: [true]}),
    },
    any: {
      title: 'any',
      unsafeEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<any>(),
      safeDirectEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<any>(),
      unsafeDecoder: () => createJsonDecoder<any>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<any>(),
      binaryDecoder: () => createBinaryDecoder<any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [42, 'hello', true, null, 0, -1, 1.1, {a: 1, b: 2}, [1, 2, 3, null]]}),
    },
    not_supported_any: {
      title: 'not supported in JSON stringify when any type is used',
      description:
        'undefined / Date / BigInt are not natively JSON-encodable when the type is `any` (no per-kind transform applies).',
      unsafeEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<any>(),
      safeDirectEncoder: () => createJsonEncoder<any>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<any>(),
      unsafeDecoder: () => createJsonDecoder<any>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<any>(),
      binaryDecoder: () => createBinaryDecoder<any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [undefined, [undefined, 123, null], new Date('2000-08-06T02:13:00.000Z'), BigInt(1)]}),
    },
    null: {
      title: 'null',
      unsafeEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<null>(),
      safeDirectEncoder: () => createJsonEncoder<null>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<null>(),
      unsafeDecoder: () => createJsonDecoder<null>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<null>(),
      binaryDecoder: () => createBinaryDecoder<null>(),
      getTestData: () => ({values: [null]}),
    },
    undefined: {
      title: 'undefined',
      unsafeEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<undefined>(),
      safeDirectEncoder: () => createJsonEncoder<undefined>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<undefined>(),
      unsafeDecoder: () => createJsonDecoder<undefined>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<undefined>(),
      binaryDecoder: () => createBinaryDecoder<undefined>(),
      getTestData: () => ({values: [undefined]}),
    },
    date: {
      title: 'date',
      unsafeEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Date>(),
      safeDirectEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Date>(),
      unsafeDecoder: () => createJsonDecoder<Date>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Date>(),
      binaryDecoder: () => createBinaryDecoder<Date>(),
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
        return createJsonEncoder<Color>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createJsonEncoder<Color>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createJsonEncoder<Color>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Color>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Color>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createBinaryEncoder<Color>();
      },
      binaryDecoder: () => {
        enum Color {
          Red = 'red',
          Green = 'green',
          Blue = 'blue',
        }
        return createBinaryDecoder<Color>();
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
      description:
        'symbol at root is unsupported — identity does not survive JSON or binary round-trips, so the factory is rendered as alwaysThrow. See docs/UNSUPPORTED-KINDS.md.',
      unsafeEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<symbol>(),
      safeDirectEncoder: () => createJsonEncoder<symbol>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<symbol>(),
      unsafeDecoder: () => createJsonDecoder<symbol>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<symbol>(),
      binaryDecoder: () => createBinaryDecoder<symbol>(),
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    object: {
      title: 'object',
      unsafeEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<object>(),
      safeDirectEncoder: () => createJsonEncoder<object>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<object>(),
      unsafeDecoder: () => createJsonDecoder<object>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<object>(),
      binaryDecoder: () => createBinaryDecoder<object>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [{a: 42, b: 'hello'}, null]}),
    },
    void: {
      title: 'void',
      unsafeEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<void>(),
      safeDirectEncoder: () => createJsonEncoder<void>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<void>(),
      unsafeDecoder: () => createJsonDecoder<void>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<void>(),
      binaryDecoder: () => createBinaryDecoder<void>(),
      getTestData: () => ({values: [undefined]}),
    },
    never: {
      title: 'never',
      description: 'never type cannot be JSON-encoded or decoded — invoking the factory throws.',
      unsafeEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<never>(),
      safeDirectEncoder: () => createJsonEncoder<never>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<never>(),
      unsafeDecoder: () => createJsonDecoder<never>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<never>(),
      binaryDecoder: () => createBinaryDecoder<never>(),
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    literal_string: {
      title: 'string literal',
      unsafeEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<'hello'>(),
      safeDirectEncoder: () => createJsonEncoder<'hello'>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<'hello'>(),
      unsafeDecoder: () => createJsonDecoder<'hello'>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<'hello'>(),
      binaryDecoder: () => createBinaryDecoder<'hello'>(),
      getTestData: () => ({values: ['hello']}),
    },
    literal_number: {
      title: 'number literal',
      unsafeEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<42>(),
      safeDirectEncoder: () => createJsonEncoder<42>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<42>(),
      unsafeDecoder: () => createJsonDecoder<42>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<42>(),
      binaryDecoder: () => createBinaryDecoder<42>(),
      getTestData: () => ({values: [42]}),
    },
    literal_boolean: {
      title: 'boolean literal',
      unsafeEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<true>(),
      safeDirectEncoder: () => createJsonEncoder<true>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<true>(),
      unsafeDecoder: () => createJsonDecoder<true>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<true>(),
      binaryDecoder: () => createBinaryDecoder<true>(),
      getTestData: () => ({values: [true]}),
    },
    literal_regexp: {
      title: 'regexp literal',
      unsafeEncoder: () => {
        const reg = /abc/;
        return createJsonEncoder<typeof reg>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        const reg = /abc/;
        return createJsonEncoder<typeof reg>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        const reg = /abc/;
        return createJsonEncoder<typeof reg>(undefined, {strategy: 'mutate', stripExtras: true});
      },
      safeEncoder: () => {
        const reg = /abc/;
        return createJsonEncoder<typeof reg>();
      },
      safeDirectEncoder: () => {
        const reg = /abc/;
        return createJsonEncoder<typeof reg>(undefined, {strategy: 'direct'});
      },
      safeDecoder: () => {
        const reg = /abc/;
        return createJsonDecoder<typeof reg>();
      },
      unsafeDecoder: () => {
        const reg = /abc/;
        return createJsonDecoder<typeof reg>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        const reg = /abc/;
        return createBinaryEncoder<typeof reg>();
      },
      binaryDecoder: () => {
        const reg = /abc/;
        return createBinaryDecoder<typeof reg>();
      },
      getTestData: () => ({values: [/abc/]}),
    },
  },

  ARRAYS: {
    array: {
      title: 'array',
      unsafeEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<string[]>(),
      safeDirectEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<string[]>(),
      unsafeDecoder: () => createJsonDecoder<string[]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<string[]>(),
      binaryDecoder: () => createBinaryDecoder<string[]>(),
      getTestData: () => ({values: [['hello', 'world'], []]}),
    },
    array_date: {
      title: 'array of dates',
      unsafeEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Date[]>(),
      safeDirectEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Date[]>(),
      unsafeDecoder: () => createJsonDecoder<Date[]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Date[]>(),
      binaryDecoder: () => createBinaryDecoder<Date[]>(),
      getTestData: () => ({
        values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
      }),
    },
    undefined_in_array: {
      title: 'undefined is serialized as null in array',
      unsafeEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<undefined[]>(),
      safeDirectEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<undefined[]>(),
      unsafeDecoder: () => createJsonDecoder<undefined[]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<undefined[]>(),
      binaryDecoder: () => createBinaryDecoder<undefined[]>(),
      getTestData: () => ({values: [[undefined, undefined]]}),
    },
    multi_dimensional: {
      title: 'multi dimensional array',
      unsafeEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<string[][]>(),
      safeDirectEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<string[][]>(),
      unsafeDecoder: () => createJsonDecoder<string[][]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<string[][]>(),
      binaryDecoder: () => createBinaryDecoder<string[][]>(),
      getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
    },
    non_serializable_in_array: {
      title: 'non serializable items throws an error',
      description: 'symbol[] should throw at RT-compile time per mion semantic.',
      unsafeEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<symbol[]>(),
      safeDirectEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<symbol[]>(),
      unsafeDecoder: () => createJsonDecoder<symbol[]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<symbol[]>(),
      binaryDecoder: () => createBinaryDecoder<symbol[]>(),
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    array_circular: {
      title: 'array circular',
      unsafeEncoder: () => {
        type CircularArray = CircularArray[];
        return createJsonEncoder<CircularArray>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type CircularArray = CircularArray[];
        return createJsonEncoder<CircularArray>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type CircularArray = CircularArray[];
        return createJsonEncoder<CircularArray>(undefined, {strategy: 'mutate', stripExtras: true});
      },
      safeEncoder: () => {
        type CircularArray = CircularArray[];
        return createJsonEncoder<CircularArray>();
      },
      safeDirectEncoder: () => {
        type CircularArray = CircularArray[];
        return createJsonEncoder<CircularArray>(undefined, {strategy: 'direct'});
      },
      safeDecoder: () => {
        type CircularArray = CircularArray[];
        return createJsonDecoder<CircularArray>();
      },
      unsafeDecoder: () => {
        type CircularArray = CircularArray[];
        return createJsonDecoder<CircularArray>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type CircularArray = CircularArray[];
        return createBinaryEncoder<CircularArray>();
      },
      binaryDecoder: () => {
        type CircularArray = CircularArray[];
        return createBinaryDecoder<CircularArray>();
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
        }>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(undefined, {strategy: 'mutate', stripExtras: true}),
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
        }>(undefined, {strategy: 'direct'}),
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
        }>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () =>
        createBinaryEncoder<{
          startDate: Date;
          quantity: number;
          name: string;
          nullValue: null;
          big: bigint;
          stringArray: string[];
          "weird prop name \n?>'\\\t\r": string;
          optionalString?: string;
        }>(),
      binaryDecoder: () =>
        createBinaryDecoder<{
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
      unsafeEncoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createJsonEncoder<ManyOptional>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createJsonEncoder<ManyOptional>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createJsonEncoder<ManyOptional>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ManyOptional>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ManyOptional>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createBinaryEncoder<ManyOptional>();
      },
      binaryDecoder: () => {
        type N = number;
        // prettier-ignore
        type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
        return createBinaryDecoder<ManyOptional>();
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
        return createJsonEncoder<MySerializableClass>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
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
        return createJsonEncoder<MySerializableClass>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
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
        return createJsonEncoder<MySerializableClass>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<MySerializableClass>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<MySerializableClass>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
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
        return createBinaryEncoder<MySerializableClass>();
      },
      binaryDecoder: () => {
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
        return createBinaryDecoder<MySerializableClass>();
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
        return createJsonEncoder<ExtendedClass>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createJsonEncoder<ExtendedClass>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createJsonEncoder<ExtendedClass>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ExtendedClass>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ExtendedClass>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createBinaryEncoder<ExtendedClass>();
      },
      binaryDecoder: () => {
        class BaseClass {
          baseProp: string = 'base';
        }
        class ExtendedClass extends BaseClass {
          extendedProp: string = 'extended';
        }
        return createBinaryDecoder<ExtendedClass>();
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
        return createJsonEncoder<NonSerializableClass>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
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
        return createJsonEncoder<NonSerializableClass>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
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
        return createJsonEncoder<NonSerializableClass>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<NonSerializableClass>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<NonSerializableClass>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
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
        return createBinaryEncoder<NonSerializableClass>();
      },
      binaryDecoder: () => {
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
        return createBinaryDecoder<NonSerializableClass>();
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
      unsafeEncoder: () =>
        createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{a: string; b: number; c: undefined}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: string; b: number; c: undefined}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; b: number; c: undefined}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: string; b: number; c: undefined}>(),
      binaryDecoder: () => createBinaryDecoder<{a: string; b: number; c: undefined}>(),
      getTestData: () => ({
        values: [{a: 'hello', b: 42, c: undefined}],
        deserializedValues: [{a: 'hello', b: 42}],
      }),
    },
    optional_properties_order: {
      title: 'optional properties order',
      unsafeEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{a: string; b?: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: string; b?: string}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; b?: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: string; b?: string}>(),
      binaryDecoder: () => createBinaryDecoder<{a: string; b?: string}>(),
      getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}]}),
    },
    all_optional_fields: {
      title: 'all optional fields',
      unsafeEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{a?: string; b?: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a?: string; b?: string}>(),
      unsafeDecoder: () => createJsonDecoder<{a?: string; b?: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a?: string; b?: string}>(),
      binaryDecoder: () => createBinaryDecoder<{a?: string; b?: string}>(),
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
        }>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
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
        }>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
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
        }>(undefined, {strategy: 'mutate', stripExtras: true}),
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
        }>(undefined, {strategy: 'direct'}),
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
        }>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () =>
        createBinaryEncoder<{
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
      binaryDecoder: () =>
        createBinaryDecoder<{
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
      unsafeEncoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createJsonEncoder<ICircular>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createJsonEncoder<ICircular>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createJsonEncoder<ICircular>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ICircular>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ICircular>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createBinaryEncoder<ICircular>();
      },
      binaryDecoder: () => {
        interface ICircular {
          name: string;
          child?: ICircular;
        }
        return createBinaryDecoder<ICircular>();
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
        return createJsonEncoder<ICircularArray>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createJsonEncoder<ICircularArray>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createJsonEncoder<ICircularArray>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ICircularArray>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ICircularArray>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createBinaryEncoder<ICircularArray>();
      },
      binaryDecoder: () => {
        interface ICircularArray {
          name: string;
          children?: ICircularArray[];
        }
        return createBinaryDecoder<ICircularArray>();
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
        return createJsonEncoder<ICircularDeep>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createJsonEncoder<ICircularDeep>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createJsonEncoder<ICircularDeep>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ICircularDeep>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ICircularDeep>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createBinaryEncoder<ICircularDeep>();
      },
      binaryDecoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {
            hello: string;
            child?: ICircularDeep;
          };
        }
        return createBinaryDecoder<ICircularDeep>();
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
        return createJsonEncoder<RootNotCircular>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createJsonEncoder<RootNotCircular>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createJsonEncoder<RootNotCircular>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<RootNotCircular>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<RootNotCircular>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createBinaryEncoder<RootNotCircular>();
      },
      binaryDecoder: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createBinaryDecoder<RootNotCircular>();
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
        return createJsonEncoder<RootCircular>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
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
        return createJsonEncoder<RootCircular>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
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
        return createJsonEncoder<RootCircular>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<RootCircular>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<RootCircular>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
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
        return createBinaryEncoder<RootCircular>();
      },
      binaryDecoder: () => {
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
        return createBinaryDecoder<RootCircular>();
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
        return createJsonEncoder<ObjectWithMethods>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createJsonEncoder<ObjectWithMethods>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createJsonEncoder<ObjectWithMethods>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ObjectWithMethods>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ObjectWithMethods>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createBinaryEncoder<ObjectWithMethods>();
      },
      binaryDecoder: () => {
        interface ObjectWithMethods {
          name: string;
          methodProp: () => any;
        }
        return createBinaryDecoder<ObjectWithMethods>();
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
      unsafeEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{[key: string]: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: string}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: string]: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{[key: string]: string}>(),
      binaryDecoder: () => createBinaryDecoder<{[key: string]: string}>(),
      getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
    },
    index_property_and_prop: {
      title: 'interface with a single property and index property',
      unsafeEncoder: () =>
        createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: string; [key: string]: string}>(),
      binaryDecoder: () => createBinaryDecoder<{a: string; [key: string]: string}>(),
      getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
    },
    index_property_extra: {
      title: 'index property with extra props and unions',
      unsafeEncoder: () =>
        createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: string; b: number; [key: string]: string | number}>(),
      binaryDecoder: () => createBinaryDecoder<{a: string; b: number; [key: string]: string | number}>(),
      getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
    },
    multiple_index_props: {
      title: 'multiple index properties (symbol keys skipped)',
      unsafeEncoder: () =>
        createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
      binaryDecoder: () => createBinaryDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
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
      unsafeEncoder: () =>
        createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: number}}>(),
      binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: number}}>(),
      getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
    },
    index_property_nested_date: {
      title: 'index property nested with Date values',
      unsafeEncoder: () =>
        createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: Date}}>(),
      binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: Date}}>(),
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
      unsafeEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{[key: string]: bigint}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{[key: string]: bigint}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: string]: bigint}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{[key: string]: bigint}>(),
      binaryDecoder: () => createBinaryDecoder<{[key: string]: bigint}>(),
      getTestData: () => ({
        values: [
          {key1: 1n, key2: 2n},
          {hello: 1n, world: 2n},
        ],
      }),
    },
    index_property_non_root: {
      title: 'index property non-root',
      unsafeEncoder: () =>
        createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
      unsafeDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
      binaryDecoder: () => createBinaryDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
      getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
    },
  },

  TUPLES: {
    tuple: {
      title: 'tuple',
      unsafeEncoder: () =>
        createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(),
      safeDirectEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<[Date, number, string, null, string[], bigint]>(),
      unsafeDecoder: () => createJsonDecoder<[Date, number, string, null, string[], bigint]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<[Date, number, string, null, string[], bigint]>(),
      binaryDecoder: () => createBinaryDecoder<[Date, number, string, null, string[], bigint]>(),
      getTestData: () => ({
        values: [[new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
      }),
    },
    tuple_with_optional: {
      title: 'tuple with optional params',
      unsafeEncoder: () =>
        createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(),
      safeDirectEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<[number, bigint?, boolean?, number?]>(),
      unsafeDecoder: () => createJsonDecoder<[number, bigint?, boolean?, number?]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<[number, bigint?, boolean?, number?]>(),
      binaryDecoder: () => createBinaryDecoder<[number, bigint?, boolean?, number?]>(),
      getTestData: () => ({
        values: [
          [3, undefined, true, 4],
          [446, undefined, undefined, undefined],
        ],
      }),
    },
    tuple_rest_parameter: {
      title: 'tuple rest parameter',
      unsafeEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<[number, ...bigint[]]>(),
      safeDirectEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<[number, ...bigint[]]>(),
      unsafeDecoder: () => createJsonDecoder<[number, ...bigint[]]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<[number, ...bigint[]]>(),
      binaryDecoder: () => createBinaryDecoder<[number, ...bigint[]]>(),
      getTestData: () => ({values: [[34567, 1n, 2n, 3n], [3]]}),
    },
    tuple_with_non_serializable: {
      title: 'tuple with function-typed slot — alwaysThrow',
      description:
        'Function-typed tuple slots are unsupported at every serialization family: tuple positions are structural, so the previous silent drop produced lossy output (functions became null / undefined depending on path). The factory is now rendered as alwaysThrow.',
      unsafeEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<[number, () => any]>(),
      safeDirectEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<[number, () => any]>(),
      unsafeDecoder: () => createJsonDecoder<[number, () => any]>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<[number, () => any]>(),
      binaryDecoder: () => createBinaryDecoder<[number, () => any]>(),
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    tuple_circular: {
      title: 'tuple circular',
      unsafeEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonEncoder<TupleCircular>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonEncoder<TupleCircular>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonEncoder<TupleCircular>(undefined, {strategy: 'mutate', stripExtras: true});
      },
      safeEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonEncoder<TupleCircular>();
      },
      safeDirectEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonEncoder<TupleCircular>(undefined, {strategy: 'direct'});
      },
      safeDecoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonDecoder<TupleCircular>();
      },
      unsafeDecoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createJsonDecoder<TupleCircular>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createBinaryEncoder<TupleCircular>();
      },
      binaryDecoder: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createBinaryDecoder<TupleCircular>();
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
        return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ICircularTuple>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createBinaryEncoder<ICircularTuple>();
      },
      binaryDecoder: () => {
        interface ICircularTuple {
          name: string;
          parent?: [string, ICircularTuple];
        }
        return createBinaryDecoder<ICircularTuple>();
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
        return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createBinaryEncoder<Parameters<typeof fnNoOptional>>();
      },
      binaryDecoder: () => {
        function fnNoOptional(a: number, b: boolean, c: string): Date {
          return new Date(a);
        }
        return createBinaryDecoder<Parameters<typeof fnNoOptional>>();
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
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createBinaryEncoder<Parameters<typeof fnOptionalParams>>();
      },
      binaryDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createBinaryDecoder<Parameters<typeof fnOptionalParams>>();
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
        return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createBinaryEncoder<ReturnType<typeof fnOptionalParam>>();
      },
      binaryDecoder: () => {
        function fnOptionalParam(a: number, b: boolean, c?: string): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createBinaryDecoder<ReturnType<typeof fnOptionalParam>>();
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
        return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createBinaryEncoder<Parameters<typeof fnRestParams>>();
      },
      binaryDecoder: () => {
        function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
          void rest;
          void a;
          void b;
          return new Date(0);
        }
        return createBinaryDecoder<Parameters<typeof fnRestParams>>();
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
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createBinaryEncoder<Parameters<typeof fnOptionalParams>>();
      },
      binaryDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createBinaryDecoder<Parameters<typeof fnOptionalParams>>();
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
        return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createBinaryEncoder<ReturnType<typeof fnOptionalParams>>();
      },
      binaryDecoder: () => {
        function fnOptionalParams(a: Date, b?: boolean): bigint {
          void a;
          void b;
          return 1n;
        }
        return createBinaryDecoder<ReturnType<typeof fnOptionalParams>>();
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
        return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createBinaryEncoder<Parameters<typeof fnOnlyRestParams>>();
      },
      binaryDecoder: () => {
        function fnOnlyRestParams(...rest: number[]): Date {
          void rest;
          return new Date(0);
        }
        return createBinaryDecoder<Parameters<typeof fnOnlyRestParams>>();
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
        return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createBinaryEncoder<Parameters<typeof fnWithCallback>>();
      },
      binaryDecoder: () => {
        function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
          void a;
          void b;
          void c;
          return new Date(0);
        }
        return createBinaryDecoder<Parameters<typeof fnWithCallback>>();
      },
      // Parameters<typeof fnWithCallback> resolves to a tuple ending
      // in `() => null`. Function-typed tuple slots are unsupported in
      // every family now (previously JSON silently dropped them, binary
      // threw); both paths render as alwaysThrow.
      factoryThrows: true,
      getTestData: () => ({values: []}),
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
        return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createBinaryEncoder<ReturnType<typeof fnReturnsPromise>>();
      },
      binaryDecoder: () => {
        function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
          void a;
          void b;
          void c;
          return Promise.resolve(new Date(0));
        }
        return createBinaryDecoder<ReturnType<typeof fnReturnsPromise>>();
      },
      factoryThrows: true,
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
        return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createBinaryEncoder<ReturnType<typeof fnReturnsFunction>>();
      },
      binaryDecoder: () => {
        function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
          void a;
          void b;
          void c;
          return () => new Date(0);
        }
        return createBinaryDecoder<ReturnType<typeof fnReturnsFunction>>();
      },
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    call_signature_params: {
      title: 'call signature params',
      unsafeEncoder: () =>
        createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(),
      safeDirectEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Parameters<{(a: number, b: boolean): string}>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Parameters<{(a: number, b: boolean): string}>>(),
      binaryDecoder: () => createBinaryDecoder<Parameters<{(a: number, b: boolean): string}>>(),
      getTestData: () => ({values: [[3, true]]}),
    },
    call_signature_return: {
      title: 'call signature return',
      unsafeEncoder: () =>
        createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(),
      safeDirectEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<ReturnType<{(a: number, b: boolean): string}>>(),
      unsafeDecoder: () =>
        createJsonDecoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<ReturnType<{(a: number, b: boolean): string}>>(),
      binaryDecoder: () => createBinaryDecoder<ReturnType<{(a: number, b: boolean): string}>>(),
      getTestData: () => ({values: ['result']}),
    },
  },

  UTILITY_TYPES: {
    awaited: {
      title: 'Awaited<Promise<T>>',
      unsafeEncoder: () =>
        createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      binaryDecoder: () => createBinaryDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
      getTestData: () => ({values: [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    exclude_atomic: {
      title: 'Exclude on atomic union',
      unsafeEncoder: () =>
        createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(),
      safeDirectEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Exclude<'name' | 'age' | number, 'age'>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Exclude<'name' | 'age' | number, 'age'>>(),
      binaryDecoder: () => createBinaryDecoder<Exclude<'name' | 'age' | number, 'age'>>(),
      getTestData: () => ({values: ['name', 3, 4]}),
    },
    exclude_objects: {
      title: 'Exclude on object union',
      unsafeEncoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Exclude<Shape, Circle>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createBinaryEncoder<Exclude<Shape, Circle>>();
      },
      binaryDecoder: () => {
        type Circle = {kind: 'circle'; radius: number};
        type Square = {kind: 'square'; x: number};
        type Triangle = {kind: 'triangle'; x: number; y: number};
        type Shape = Circle | Square | Triangle;
        return createBinaryDecoder<Exclude<Shape, Circle>>();
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
        createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      binaryEncoder: () => createBinaryEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      binaryDecoder: () => createBinaryDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
      getTestData: () => ({
        values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}],
      }),
    },
    extract_atomic: {
      title: 'Extract on atomic union',
      unsafeEncoder: () =>
        createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      binaryEncoder: () => createBinaryEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      binaryDecoder: () => createBinaryDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      getTestData: () => ({values: ['name']}),
    },
    extract_objects: {
      title: 'Extract on object union',
      unsafeEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'mutate', stripExtras: true});
      },
      safeEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonEncoder<Extract<Shape, ToExtract>>();
      },
      safeDirectEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'direct'});
      },
      safeDecoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonDecoder<Extract<Shape, ToExtract>>();
      },
      unsafeDecoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createJsonDecoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createBinaryEncoder<Extract<Shape, ToExtract>>();
      },
      binaryDecoder: () => {
        type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
        return createBinaryDecoder<Extract<Shape, ToExtract>>();
      },
      getTestData: () => ({values: [{kind: 'square', x: 5}]}),
    },
    partial_properties: {
      title: 'Partial<T>',
      unsafeEncoder: () =>
        createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Partial<{name: string; age: number; createdAt: Date}>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      binaryEncoder: () => createBinaryEncoder<Partial<{name: string; age: number; createdAt: Date}>>(),
      binaryDecoder: () => createBinaryDecoder<Partial<{name: string; age: number; createdAt: Date}>>(),
      getTestData: () => {
        const createdAt = new Date('2000-08-06T02:13:00.000Z');
        return {values: [{name: 'John'}, {age: 30}, {createdAt}, {}]};
      },
    },
    pick_properties: {
      title: 'Pick<T, K>',
      unsafeEncoder: () =>
        createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () =>
        createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
          strategy: 'direct',
        }),
      safeDecoder: () =>
        createJsonDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
          stripExtras: false,
        }),
      binaryEncoder: () =>
        createBinaryEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      binaryDecoder: () =>
        createBinaryDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
      getTestData: () => ({values: [{name: 'John', createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    omit_properties: {
      title: 'Omit<T, K>',
      unsafeEncoder: () =>
        createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
          strategy: 'direct',
        }),
      safeDecoder: () => createJsonDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      unsafeDecoder: () =>
        createJsonDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
          stripExtras: false,
        }),
      binaryEncoder: () => createBinaryEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      binaryDecoder: () => createBinaryDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
      getTestData: () => ({values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
    },
    record_type: {
      title: 'Record<string, Date>',
      unsafeEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Record<string, Date>>(),
      safeDirectEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Record<string, Date>>(),
      unsafeDecoder: () => createJsonDecoder<Record<string, Date>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Record<string, Date>>(),
      binaryDecoder: () => createBinaryDecoder<Record<string, Date>>(),
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
      unsafeEncoder: () =>
        createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(),
      safeDirectEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Date | number | string | null | bigint>(),
      unsafeDecoder: () => createJsonDecoder<Date | number | string | null | bigint>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Date | number | string | null | bigint>(),
      binaryDecoder: () => createBinaryDecoder<Date | number | string | null | bigint>(),
      getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, 3n]}),
    },
    union_array: {
      title: 'union of arrays',
      unsafeEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(),
      safeDirectEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<string[] | number[] | boolean[] | Date[]>(),
      unsafeDecoder: () => createJsonDecoder<string[] | number[] | boolean[] | Date[]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<string[] | number[] | boolean[] | Date[]>(),
      binaryDecoder: () => createBinaryDecoder<string[] | number[] | boolean[] | Date[]>(),
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
      unsafeEncoder: () =>
        createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(),
      safeDirectEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<(string | bigint | boolean | Date)[]>(),
      unsafeDecoder: () => createJsonDecoder<(string | bigint | boolean | Date)[]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<(string | bigint | boolean | Date)[]>(),
      binaryDecoder: () => createBinaryDecoder<(string | bigint | boolean | Date)[]>(),
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
        createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
      binaryDecoder: () => createBinaryDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
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
        >(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(undefined, {strategy: 'mutate', stripExtras: true}),
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
        >(undefined, {strategy: 'direct'}),
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
        >(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () =>
        createBinaryEncoder<
          | {type: 'a'; otherProp: boolean}
          | {type: 'b'; otherProp: number}
          | {type: 'c'; otherProp: string; time: Date}
          | {type: boolean; otherProp: string}
        >(),
      binaryDecoder: () =>
        createBinaryDecoder<
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
      unsafeEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
          undefined,
          {strategy: 'mutate', stripExtras: false}
        ),
      clonePreserveEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
          undefined,
          {strategy: 'clone', stripExtras: false}
        ),
      mutateStripEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
          undefined,
          {strategy: 'mutate', stripExtras: true}
        ),
      safeEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
          undefined,
          {strategy: 'direct'}
        ),
      safeDecoder: () =>
        createJsonDecoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      unsafeDecoder: () =>
        createJsonDecoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
          undefined,
          {stripExtras: false}
        ),
      binaryEncoder: () =>
        createBinaryEncoder<
          string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
        >(),
      binaryDecoder: () =>
        createBinaryDecoder<
          string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}
        >(),
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
        >(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(undefined, {strategy: 'mutate', stripExtras: true}),
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
        >(undefined, {strategy: 'direct'}),
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
        >(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () =>
        createBinaryEncoder<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      binaryDecoder: () =>
        createBinaryDecoder<
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
      unsafeEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonEncoder<UnionC>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonEncoder<UnionC>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonEncoder<UnionC>(undefined, {strategy: 'mutate', stripExtras: true});
      },
      safeEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonEncoder<UnionC>();
      },
      safeDirectEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonEncoder<UnionC>(undefined, {strategy: 'direct'});
      },
      safeDecoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonDecoder<UnionC>();
      },
      unsafeDecoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createJsonDecoder<UnionC>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createBinaryEncoder<UnionC>();
      },
      binaryDecoder: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createBinaryDecoder<UnionC>();
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
        >(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () =>
        createJsonEncoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      safeDirectEncoder: () =>
        createJsonEncoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(undefined, {strategy: 'direct'}),
      safeDecoder: () =>
        createJsonDecoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      unsafeDecoder: () =>
        createJsonDecoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () =>
        createBinaryEncoder<
          {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
        >(),
      binaryDecoder: () =>
        createBinaryDecoder<
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
      unsafeEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<number | {name: string} | any>(),
      safeDirectEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<number | {name: string} | any>(),
      unsafeDecoder: () => createJsonDecoder<number | {name: string} | any>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<number | {name: string} | any>(),
      binaryDecoder: () => createBinaryDecoder<number | {name: string} | any>(),
      roundTripBestEffort: true,
      getTestData: () => ({values: [42, {name: 'test'}, 'fallback to any', true, null]}),
    },
    union_with_non_serializable: {
      title: 'union with non-serializable type throws',
      description: 'function in union — mion throws at RT-compile time.',
      unsafeEncoder: () =>
        createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(),
      safeDirectEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Date | number | string | (() => any)>(),
      unsafeDecoder: () =>
        createJsonDecoder<Date | number | string | (() => any)>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Date | number | string | (() => any)>(),
      binaryDecoder: () => createBinaryDecoder<Date | number | string | (() => any)>(),
      factoryThrows: true,
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
      unsafeEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{a: string} | {b: number}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: string} | {b: number}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string} | {b: number}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: string} | {b: number}>(),
      binaryDecoder: () => createBinaryDecoder<{a: string} | {b: number}>(),
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
      unsafeEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{a: string} | {b: number}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: string} | {b: number}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string} | {b: number}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: string} | {b: number}>(),
      binaryDecoder: () => createBinaryDecoder<{a: string} | {b: number}>(),
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
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () =>
        createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
          strategy: 'direct',
        }),
      safeDecoder: () =>
        createJsonDecoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
          stripExtras: false,
        }),
      binaryEncoder: () =>
        createBinaryEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
      binaryDecoder: () =>
        createBinaryDecoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
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
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () =>
        createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
          strategy: 'direct',
        }),
      safeDecoder: () =>
        createJsonDecoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
          stripExtras: false,
        }),
      binaryEncoder: () =>
        createBinaryEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
      binaryDecoder: () =>
        createBinaryDecoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
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
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () =>
        createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
          strategy: 'direct',
        }),
      safeDecoder: () =>
        createJsonDecoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
          stripExtras: false,
        }),
      binaryEncoder: () =>
        createBinaryEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
      binaryDecoder: () =>
        createBinaryDecoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
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
      unsafeEncoder: () =>
        createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: string; b: number} | {a: boolean; c: Date}>(),
      unsafeDecoder: () => createJsonDecoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: string; b: number} | {a: boolean; c: Date}>(),
      binaryDecoder: () => createBinaryDecoder<{a: string; b: number} | {a: boolean; c: Date}>(),
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
      unsafeEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Set<string>>(),
      safeDirectEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Set<string>>(),
      unsafeDecoder: () => createJsonDecoder<Set<string>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Set<string>>(),
      binaryDecoder: () => createBinaryDecoder<Set<string>>(),
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
        return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Set<SmallObject>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createBinaryEncoder<Set<SmallObject>>();
      },
      binaryDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createBinaryDecoder<Set<SmallObject>>();
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
        return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<DeepWithSet>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createBinaryEncoder<DeepWithSet>();
      },
      binaryDecoder: () => {
        type Set1 = Set<{s: string; arr: number[]}>;
        interface DeepWithSet {
          a: string;
          b: Set1;
          c: Set1;
        }
        return createBinaryDecoder<DeepWithSet>();
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
      unsafeEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Map<string, number>>(),
      safeDirectEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Map<string, number>>(),
      unsafeDecoder: () => createJsonDecoder<Map<string, number>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Map<string, number>>(),
      binaryDecoder: () => createBinaryDecoder<Map<string, number>>(),
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
        return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Map<string, SmallObject>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createBinaryEncoder<Map<string, SmallObject>>();
      },
      binaryDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createBinaryDecoder<Map<string, SmallObject>>();
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
        return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<Map<SmallObject, number>>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      binaryEncoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createBinaryEncoder<Map<SmallObject, number>>();
      },
      binaryDecoder: () => {
        interface SmallObject {
          prop1: string;
          prop2: number;
          prop3: boolean;
          prop4?: Date;
          prop5?: bigint;
        }
        return createBinaryDecoder<Map<SmallObject, number>>();
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
        return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<DeepWithMap>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createBinaryEncoder<DeepWithMap>();
      },
      binaryDecoder: () => {
        interface DeepWithMap {
          a: string;
          b: Map<string, {sm: {s: string; arr: number[]}}>;
        }
        return createBinaryDecoder<DeepWithMap>();
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
      unsafeEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Map<bigint, number>>(),
      safeDirectEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Map<bigint, number>>(),
      unsafeDecoder: () => createJsonDecoder<Map<bigint, number>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Map<bigint, number>>(),
      binaryDecoder: () => createBinaryDecoder<Map<bigint, number>>(),
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
      unsafeEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Map<string, Date>>(),
      safeDirectEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Map<string, Date>>(),
      unsafeDecoder: () => createJsonDecoder<Map<string, Date>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Map<string, Date>>(),
      binaryDecoder: () => createBinaryDecoder<Map<string, Date>>(),
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
        return createJsonEncoder<CircularObject>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonEncoder<CircularObject>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonEncoder<CircularObject>(undefined, {strategy: 'mutate', stripExtras: true});
      },
      safeEncoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonEncoder<CircularObject>();
      },
      safeDirectEncoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonEncoder<CircularObject>(undefined, {strategy: 'direct'});
      },
      safeDecoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonDecoder<CircularObject>();
      },
      unsafeDecoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createJsonDecoder<CircularObject>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createBinaryEncoder<CircularObject>();
      },
      binaryDecoder: () => {
        type CircularObject = {name: string; child?: CircularObject};
        return createBinaryDecoder<CircularObject>();
      },
      getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
    },
    circular_union_array: {
      title: 'CircularUnion array with discriminator',
      unsafeEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonEncoder<CuArray>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonEncoder<CuArray>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonEncoder<CuArray>(undefined, {strategy: 'mutate', stripExtras: true});
      },
      safeEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonEncoder<CuArray>();
      },
      safeDirectEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonEncoder<CuArray>(undefined, {strategy: 'direct'});
      },
      safeDecoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonDecoder<CuArray>();
      },
      unsafeDecoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createJsonDecoder<CuArray>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createBinaryEncoder<CuArray>();
      },
      binaryDecoder: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createBinaryDecoder<CuArray>();
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
        return createJsonEncoder<CircularTuple>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createJsonEncoder<CircularTuple>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createJsonEncoder<CircularTuple>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<CircularTuple>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<CircularTuple>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createBinaryEncoder<CircularTuple>();
      },
      binaryDecoder: () => {
        interface CircularTuple {
          list: [bigint, CircularTuple?];
        }
        return createBinaryDecoder<CircularTuple>();
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
        return createJsonEncoder<CircularIndex>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createJsonEncoder<CircularIndex>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createJsonEncoder<CircularIndex>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<CircularIndex>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<CircularIndex>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createBinaryEncoder<CircularIndex>();
      },
      binaryDecoder: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createBinaryDecoder<CircularIndex>();
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
        return createJsonEncoder<CircularDeep>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createJsonEncoder<CircularDeep>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createJsonEncoder<CircularDeep>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<CircularDeep>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<CircularDeep>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createBinaryEncoder<CircularDeep>();
      },
      binaryDecoder: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createBinaryDecoder<CircularDeep>();
      },
      getTestData: () => ({
        values: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
      }),
    },
    circular_tuple_complex: {
      title: 'Circular tuple with complex structure',
      unsafeEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'mutate', stripExtras: true});
      },
      safeEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonEncoder<CircularTupleComplex>();
      },
      safeDirectEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'direct'});
      },
      safeDecoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonDecoder<CircularTupleComplex>();
      },
      unsafeDecoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createJsonDecoder<CircularTupleComplex>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createBinaryEncoder<CircularTupleComplex>();
      },
      binaryDecoder: () => {
        type CircularTupleComplex = [bigint, CircularTupleComplex?];
        return createBinaryDecoder<CircularTupleComplex>();
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
        return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<ObjCircularArr>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createBinaryEncoder<ObjCircularArr>();
      },
      binaryDecoder: () => {
        type ObjCircularArr = {
          a: string;
          deep?: {b: string; c: number};
          d?: ObjCircularArr[];
        };
        return createBinaryDecoder<ObjCircularArr>();
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
      unsafeEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<`api/users/${number}`>(),
      safeDirectEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<`api/users/${number}`>(),
      unsafeDecoder: () => createJsonDecoder<`api/users/${number}`>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<`api/users/${number}`>(),
      binaryDecoder: () => createBinaryDecoder<`api/users/${number}`>(),
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
      unsafeEncoder: () =>
        createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(),
      unsafeDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{url: `api/user/${number}`; method: string}>(),
      binaryDecoder: () => createBinaryDecoder<{url: `api/user/${number}`; method: string}>(),
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
      unsafeEncoder: () =>
        createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(),
      safeDirectEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(),
      unsafeDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{[key: `api/${string}`]: number}>(),
      binaryDecoder: () => createBinaryDecoder<{[key: `api/${string}`]: number}>(),
      getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
    },
    url_index_key_with_named: {
      title: 'template literal index key + sibling named property',
      unsafeEncoder: () =>
        createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{meta: string; [key: `api/${string}`]: string | number}>(),
      binaryDecoder: () => createBinaryDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
      getTestData: () => ({
        values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
      }),
    },
  },

  OTHERS: {
    promise_jsonStringify_error: {
      title: 'Promise top-level throws',
      unsafeEncoder: () => createJsonEncoder<Promise<string>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Promise<string>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Promise<string>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Promise<string>>(),
      safeDirectEncoder: () => createJsonEncoder<Promise<string>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Promise<string>>(),
      unsafeDecoder: () => createJsonDecoder<Promise<string>>(undefined, {strategy: 'mutate', stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Promise<string>>(),
      binaryDecoder: () => createBinaryDecoder<Promise<string>>(),
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    non_serializable: {
      title: 'non-serializable type throws (Int8Array)',
      unsafeEncoder: () => createJsonEncoder<Int8Array>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Int8Array>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Int8Array>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Int8Array>(),
      safeDirectEncoder: () => createJsonEncoder<Int8Array>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Int8Array>(),
      unsafeDecoder: () => createJsonDecoder<Int8Array>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Int8Array>(),
      binaryDecoder: () => createBinaryDecoder<Int8Array>(),
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_interface: {
      title: 'non-serializable inside interface throws',
      unsafeEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{a: Int8Array}>(),
      safeDirectEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{a: Int8Array}>(),
      unsafeDecoder: () => createJsonDecoder<{a: Int8Array}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{a: Int8Array}>(),
      binaryDecoder: () => createBinaryDecoder<{a: Int8Array}>(),
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_array: {
      title: 'non-serializable inside array throws',
      unsafeEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<Int8Array[]>(),
      safeDirectEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<Int8Array[]>(),
      unsafeDecoder: () => createJsonDecoder<Int8Array[]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<Int8Array[]>(),
      binaryDecoder: () => createBinaryDecoder<Int8Array[]>(),
      factoryThrows: true,
      getTestData: () => ({values: []}),
    },
    non_serializable_tuple: {
      title: 'non-serializable inside tuple throws',
      unsafeEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<[Int8Array]>(),
      safeDirectEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<[Int8Array]>(),
      unsafeDecoder: () => createJsonDecoder<[Int8Array]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<[Int8Array]>(),
      binaryDecoder: () => createBinaryDecoder<[Int8Array]>(),
      factoryThrows: true,
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
      unsafeEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{declared: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{declared: string}>(),
      unsafeDecoder: () => createJsonDecoder<{declared: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
      binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
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
      unsafeEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{declared: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{declared: string}>(),
      unsafeDecoder: () => createJsonDecoder<{declared: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
      binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
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
      unsafeEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{declared: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{declared: string}>(),
      unsafeDecoder: () => createJsonDecoder<{declared: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
      binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
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
      unsafeEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{declared: string}>(),
      safeDirectEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{declared: string}>(),
      unsafeDecoder: () => createJsonDecoder<{declared: string}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
      binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
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
      unsafeEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<{outer: {declared: string}}>(),
      safeDirectEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{outer: {declared: string}}>(),
      unsafeDecoder: () => createJsonDecoder<{outer: {declared: string}}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{outer: {declared: string}}>(),
      binaryDecoder: () => createBinaryDecoder<{outer: {declared: string}}>(),
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
        return createJsonEncoder<WideRecord>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
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
        return createJsonEncoder<WideRecord>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
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
        return createJsonEncoder<WideRecord>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<WideRecord>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<WideRecord>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
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
        return createBinaryEncoder<WideRecord>();
      },
      binaryDecoder: () => {
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
        return createBinaryDecoder<WideRecord>();
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
        return createJsonEncoder<LargeObjectUnion>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
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
        return createJsonEncoder<LargeObjectUnion>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
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
        return createJsonEncoder<LargeObjectUnion>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<LargeObjectUnion>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<LargeObjectUnion>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
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
        return createBinaryEncoder<LargeObjectUnion>();
      },
      binaryDecoder: () => {
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
        return createBinaryDecoder<LargeObjectUnion>();
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
        return createJsonEncoder<MixedLargeUnion>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
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
        return createJsonEncoder<MixedLargeUnion>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
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
        return createJsonEncoder<MixedLargeUnion>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<MixedLargeUnion>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<MixedLargeUnion>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
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
        return createBinaryEncoder<MixedLargeUnion>();
      },
      binaryDecoder: () => {
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
        return createBinaryDecoder<MixedLargeUnion>();
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
        return createJsonEncoder<DeepNestedLevel1>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
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
        return createJsonEncoder<DeepNestedLevel1>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
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
        return createJsonEncoder<DeepNestedLevel1>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<DeepNestedLevel1>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<DeepNestedLevel1>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
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
        return createBinaryEncoder<DeepNestedLevel1>();
      },
      binaryDecoder: () => {
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
        return createBinaryDecoder<DeepNestedLevel1>();
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
        return createJsonEncoder<LargeClassUnion>(undefined, {strategy: 'mutate', stripExtras: false});
      },
      clonePreserveEncoder: () => {
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
        return createJsonEncoder<LargeClassUnion>(undefined, {strategy: 'clone', stripExtras: false});
      },
      mutateStripEncoder: () => {
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
        return createJsonEncoder<LargeClassUnion>(undefined, {strategy: 'mutate', stripExtras: true});
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
        return createJsonEncoder<LargeClassUnion>(undefined, {strategy: 'direct'});
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
        return createJsonDecoder<LargeClassUnion>(undefined, {stripExtras: false});
      },
      binaryEncoder: () => {
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
        return createBinaryEncoder<LargeClassUnion>();
      },
      binaryDecoder: () => {
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
        return createBinaryDecoder<LargeClassUnion>();
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
