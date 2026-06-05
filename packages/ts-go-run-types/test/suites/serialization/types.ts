import type {BinaryDecoderFn, BinaryEncoderFn, JsonDecoderFn, JsonEncoderFn} from '@mionjs/ts-go-run-types';

/** One case in the JSON serialization suite. Mirrors mion's `SingleTest`
 *  but with our marker-based thunks in place of the raw RunType. **/
export interface SerializationCase {
  title: string;
  description?: string;

  /** Encoder thunks — one per `createJsonEncoder` strategy exercised by the
   *  suite (the field name IS the strategy):
   *  - `stripCloneEncoder` — strategy 'stripClone' (clone, strips extras; default).
   *  - `cloneEncoder` — strategy 'clone' (clone, preserves extras).
   *  - `stripMutateEncoder` — strategy 'stripMutate' (mutate, strips extras).
   *  - `mutateEncoder` — strategy 'mutate' (mutate, preserves extras).
   *  - `directEncoder` — strategy 'direct' (single-pass, always strips).
   *  Decoder pairing: every strip/direct encoder pairs with `stripDecoder`;
   *  `mutateEncoder` (preserve) pairs with `preserveDecoder` — the only path
   *  that preserves undeclared keys through the round-trip. **/
  stripCloneEncoder: () => JsonEncoderFn;
  cloneEncoder: () => JsonEncoderFn;
  stripMutateEncoder: () => JsonEncoderFn;
  directEncoder: () => JsonEncoderFn;
  mutateEncoder: () => JsonEncoderFn;

  /** Safe-mode only: when set, the case's input produces a JSON string
   *  that is not parseable by `JSON.parse` — e.g. number-at-root with
   *  `Infinity` (mion's `String(Infinity)` = `"Infinity"`). Mirrors
   *  mion's number-not-supported spec, which accepts either a throw OR
   *  a non-matching round-trip as a "value not supported by JSON"
   *  signal. The stripClone loop asserts the parse-throws instead of a
   *  deep-equal round-trip. The mutate loop ignores this flag — on
   *  that path `JSON.stringify(Infinity)` returns `"null"` (not a
   *  throw) and the case's own `deserializedValues` already handles
   *  the round-trip. **/
  safeAdapterStringifyJsonNotParseable?: boolean;

  /** Decoder thunks. `stripDecoder` builds `createJsonDecoder<T>()`
   *  (default strategy 'strip': undeclared keys become `undefined` via
   *  ukuWire before restoreFromJson). `preserveDecoder` builds
   *  `createJsonDecoder<T>(undefined, {strategy: 'preserve'})` —
   *  undeclared keys on the parsed value pass through to the restored
   *  result untouched. The round-trip adapter pairs each encoder
   *  shape with its corresponding decoder. **/
  stripDecoder: () => JsonDecoderFn;
  preserveDecoder: () => JsonDecoderFn;

  /** Sample values to round-trip via the **mutate** path
   *  (`prepareForJson + JSON.stringify` / `JSON.parse + restoreFromJson`).
   *  Required for every case.
   *
   *  Returns valid inputs for `prepareForJson`: the mutate path
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

  /** Optional override consumed by the **stripClone** path adapter
   *  (`stripUnknownKeys + prepareForJson + JSON.stringify` /
   *  `JSON.parse + (stripUnknownKeys | unknownKeyErrors) + restoreFromJson`).
   *
   *  Provide only when the stripClone path produces a different observable
   *  than the mutate path — typically when an input carries extras
   *  that are stripped pre-serialise (so `deserializedValues`
   *  reflects the cleaned shape). For ~90% of cases (no extras,
   *  identical behaviour between paths) leave this unset; the stripClone
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
