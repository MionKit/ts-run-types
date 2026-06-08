// Shared assertion helpers for the serialization adapters. Extracted so
// the atomic/collection serialization adapters and the format
// serialization adapters run the exact same round-trip logic against
// the `SerializationCase` shape — every JSON encoder × decoder pairing
// (10 combinations) plus the binary round-trip — with no copy-pasted
// assertion bodies. Each pairing is its own exported helper so the per-
// subgroup test files declare one `it()` per pairing.

import {expect} from 'vitest';
import type {SchemaThunk, SerializationCase} from '../suites/serialization/types.ts';
import {deepCloneForRoundTrip, isTemporalInstance, normalizeForComparison} from './equalsHelpers.ts';

/** Resolve a schema thunk to its factory, or `undefined` when omitted /
 *  'not-supported' (the variant then no-ops, like the validation suite). **/
function resolveSchemaThunk<F>(thunk: SchemaThunk<F> | undefined): (() => F) | undefined {
  if (!thunk || thunk === 'not-supported') return undefined;
  return thunk;
}

function safeStructuredClone(input: unknown): {ok: true; snapshot: unknown} | {ok: false} {
  // `structuredClone` doesn't throw on a Temporal instance but produces a
  // lossy `{}` (the value lives in internal slots it can't see), which would
  // make the no-mutation snapshot compare unequal to the original. Temporal
  // values are immutable, so there's no mutation to catch — skip the snapshot,
  // same as the throw path below (cycles, symbols, …).
  if (isTemporalInstance(input)) return {ok: false};
  try {
    return {ok: true, snapshot: structuredClone(input)};
  } catch {
    return {ok: false};
  }
}

type JsonEncoderKey = 'mutateEncoder' | 'cloneEncoder' | 'stripMutateEncoder' | 'stripCloneEncoder' | 'directEncoder';
type JsonDecoderKey = 'preserveDecoder' | 'stripDecoder';

interface JsonRoundTripOpts {
  /** Assert input is unchanged after encode. True for non-mutating
   *  encoders (clone, stripClone, direct). Skipped automatically when
   *  `structuredClone` refuses the input (cycles, symbols, …). **/
  assertNoMutation: boolean;
  /** Honour `c.jsonStringifyThrows`. True for mutate and clone — both
   *  preserve extras and route through `JSON.stringify`, which throws on
   *  bigint extras. False for stripMutate/stripClone (extras zeroed or
   *  removed before stringify) and direct (single-pass stringifyJson). **/
  jsonStringifyMayThrow: boolean;
  /** Honour `c.safeAdapterStringifyJsonNotParseable`. True only for the
   *  direct strategy — single-pass `stringifyJson` at root for Infinity /
   *  NaN emits `"Infinity"` which `JSON.parse` rejects. **/
  stringifyJsonMayBeUnparseable: boolean;
  /** When true, resolve test data as `getTestDataForStringify ?? getTestData`.
   *  When false, always use `getTestData` (extras-preserving paths). Only
   *  the two end-to-end preserving pairings — mutate+preserve and
   *  clone+preserve — use raw `getTestData`; every other pairing strips
   *  extras somewhere in the pipeline. **/
  useStringifyTestData: boolean;
}

// Shared encode→parse→decode loop. Each of the 10 JSON helpers below is
// a thin wrapper over this function, supplying the pairing-specific
// thunk keys + opts. Keeps the per-pairing surface small (one named
// exported helper, matching the helper-per-function form introduced in
// commit 8c95ad7) while sharing the contract handling.
function jsonRoundTrip(
  c: SerializationCase,
  encKey: JsonEncoderKey,
  decKey: JsonDecoderKey,
  encLabel: string,
  decLabel: string,
  opts: JsonRoundTripOpts
): void {
  const pair = `${encLabel} - ${decLabel}`;

  if (c.factoryThrows) {
    expect(() => c[encKey](), `${c.title} [${pair}]: ${encKey} factory must throw`).toThrow();
    expect(() => c[decKey](), `${c.title} [${pair}]: ${decKey} factory must throw`).toThrow();
    return;
  }

  const label = `${c.title} [${pair}]`;

  if (opts.jsonStringifyMayThrow && c.jsonStringifyThrows) {
    const encode = c[encKey]();
    const {values} = c.getTestData();
    values.forEach((reference, i) => {
      const input = deepCloneForRoundTrip(reference);
      expect(() => encode(input), `${label}: ${encKey}(values[${i}]) must throw`).toThrow();
    });
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = c[encKey]();
  const decode = c[decKey]();
  const getTestData = opts.useStringifyTestData ? (c.getTestDataForStringify ?? c.getTestData) : c.getTestData;
  const {values, deserializedValues} = getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const preSnapshot = opts.assertNoMutation ? safeStructuredClone(input) : undefined;

    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }

    if (preSnapshot?.ok) {
      expect(input, `${label}: values[${i}] — ${encLabel} encoder must not mutate input`).toEqual(preSnapshot.snapshot);
    }

    if (serialized === undefined) return;
    if (bestEffort) return;

    if (opts.stringifyJsonMayBeUnparseable && c.safeAdapterStringifyJsonNotParseable) {
      expect(() => decode(serialized as string), `${label}: values[${i}] expected decoder to throw (not valid JSON)`).toThrow();
      return;
    }

    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- 10 JSON pairings (encoder × decoder) ------------------

/** mutate encoder + preserve decoder — only pairing where extras survive
 *  end-to-end (encoder keeps them via prepareForJson, decoder keeps them). **/
export function assertMutatePreserveRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'mutateEncoder', 'preserveDecoder', 'mutate', 'preserve', {
    assertNoMutation: false,
    jsonStringifyMayThrow: true,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: false,
  });
}

/** mutate encoder + strip decoder — encoder preserves extras, decoder
 *  drops them. Uses the stringify test data (decoded shape is cleaned). **/
export function assertMutateStripRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'mutateEncoder', 'stripDecoder', 'mutate', 'strip', {
    assertNoMutation: false,
    jsonStringifyMayThrow: true,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** clone encoder + preserve decoder — extras survive end-to-end, like
 *  mutate+preserve, but the encoder must not mutate the input. **/
export function assertClonePreserveRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'cloneEncoder', 'preserveDecoder', 'clone', 'preserve', {
    assertNoMutation: true,
    jsonStringifyMayThrow: true,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: false,
  });
}

/** clone encoder + strip decoder — encoder preserves extras (non-mutating),
 *  decoder drops them. **/
export function assertCloneStripRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'cloneEncoder', 'stripDecoder', 'clone', 'strip', {
    assertNoMutation: true,
    jsonStringifyMayThrow: true,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** stripMutate encoder + preserve decoder — encoder zeroes extras to
 *  undefined in place (input still mutated, but extras are gone before
 *  stringify so jsonStringifyThrows never triggers). Observationally
 *  identical to stripMutate+strip — extras are gone at encode, so the
 *  preserve decoder has nothing extra to keep. **/
export function assertStripMutatePreserveRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'stripMutateEncoder', 'preserveDecoder', 'stripMutate', 'preserve', {
    assertNoMutation: false,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** stripMutate encoder + strip decoder — encoder zeroes extras in place,
 *  decoder also strips. **/
export function assertStripMutateStripRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'stripMutateEncoder', 'stripDecoder', 'stripMutate', 'strip', {
    assertNoMutation: false,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** stripClone encoder + preserve decoder — non-mutating, extras stripped
 *  at encode. Observationally identical to stripClone+strip. **/
export function assertStripClonePreserveRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'stripCloneEncoder', 'preserveDecoder', 'stripClone', 'preserve', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** stripClone encoder + strip decoder — non-mutating, extras stripped at
 *  both ends. The default serialization pair. **/
export function assertStripCloneStripRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'stripCloneEncoder', 'stripDecoder', 'stripClone', 'strip', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: false,
    useStringifyTestData: true,
  });
}

/** direct encoder + preserve decoder — direct strategy always strips at
 *  encode via single-pass stringifyJson, so the preserve decoder has
 *  nothing to preserve. Observationally identical to direct+strip. **/
export function assertDirectPreserveRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'directEncoder', 'preserveDecoder', 'direct', 'preserve', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: true,
    useStringifyTestData: true,
  });
}

/** direct encoder + strip decoder — single-pass stringifyJson, decoder
 *  strips at decode. **/
export function assertDirectStripRoundTrip(c: SerializationCase): void {
  jsonRoundTrip(c, 'directEncoder', 'stripDecoder', 'direct', 'strip', {
    assertNoMutation: true,
    jsonStringifyMayThrow: false,
    stringifyJsonMayBeUnparseable: true,
    useStringifyTestData: true,
  });
}

// ---------- BINARY round-trip -------------------------------------

/** Drives a case through `binaryEncoder` → `binaryDecoder` and asserts
 *  the decoded value deep-equals the original (or the per-case
 *  `deserializedValues` override when the round-trip is asymmetric).
 *  Requires `binaryEncoder` + `binaryDecoder` thunks to be present. **/
export function assertBinaryRoundTrip(c: SerializationCase): void {
  const factoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
  if (factoryThrows) {
    expect(() => c.binaryEncoder!(), `${c.title}: binaryEncoder factory must throw`).toThrow();
    expect(() => c.binaryDecoder!(), `${c.title}: binaryDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = c.binaryEncoder!();
  const decode = c.binaryDecoder!();
  const testDataThunk = c.getBinaryTestData ?? c.getTestDataForStringify ?? c.getTestData;
  const {values, deserializedValues} = testDataThunk();
  const byteSizes = c.getBinaryByteSizes?.();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let buf;
    try {
      buf = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (bestEffort) return;
    if (byteSizes && byteSizes[i] !== undefined) {
      expect(buf.byteLength, `${c.title}: values[${i}] encoded byte length`).toBe(byteSizes[i]);
    }
    const restored = decode(buf);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title}: values[${i}] binary round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- value-first SCHEMA round-trips -------------------------
// The schema thunks (`schemaEncoder` / `schemaDecoder` / `schemaBinaryEncoder`
// / `schemaBinaryDecoder`) build their `RT.*` model inline and feed it through
// the factory's value-first overload. These two helpers pair them for a
// representative round-trip — proving the value-first path resolves a working
// factory — without re-testing every strategy (those are covered type-first).

/** Value-first JSON round-trip — pairs `schemaEncoder` (default stripClone) +
 *  `schemaDecoder` (default strip) and asserts a deep-equal round-trip on the
 *  case's samples. No-op when either thunk is omitted or 'not-supported'. **/
export function assertSchemaJsonRoundTrip(c: SerializationCase): void {
  const encThunk = resolveSchemaThunk(c.schemaEncoder);
  const decThunk = resolveSchemaThunk(c.schemaDecoder);
  if (!encThunk || !decThunk) return;

  if (c.factoryThrows) {
    expect(() => encThunk(), `${c.title} [schema/json]: schemaEncoder factory must throw`).toThrow();
    expect(() => decThunk(), `${c.title} [schema/json]: schemaDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = encThunk();
  const decode = decThunk();
  // stripClone strips extras at encode, so the decoded shape matches the
  // cleaned stringify test data (same resolution as the stripClone pairings).
  const {values, deserializedValues} = (c.getTestDataForStringify ?? c.getTestData)();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (serialized === undefined || bestEffort) return;
    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title} [schema/json]: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

/** Value-first binary round-trip — pairs `schemaBinaryEncoder` +
 *  `schemaBinaryDecoder`. No-op when either thunk is omitted or 'not-supported'. **/
export function assertSchemaBinaryRoundTrip(c: SerializationCase): void {
  const encThunk = resolveSchemaThunk(c.schemaBinaryEncoder);
  const decThunk = resolveSchemaThunk(c.schemaBinaryDecoder);
  if (!encThunk || !decThunk) return;

  const factoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
  if (factoryThrows) {
    expect(() => encThunk(), `${c.title} [schema/binary]: schemaBinaryEncoder factory must throw`).toThrow();
    expect(() => decThunk(), `${c.title} [schema/binary]: schemaBinaryDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = encThunk();
  const decode = decThunk();
  const testDataThunk = c.getBinaryTestData ?? c.getTestDataForStringify ?? c.getTestData;
  const {values, deserializedValues} = testDataThunk();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let buf;
    try {
      buf = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }
    if (bestEffort) return;
    const restored = decode(buf);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title} [schema/binary]: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}
