// Shared assertion helpers for the serialization adapters. Extracted so
// the atomic/collection serialization adapters and the format
// serialization adapters run the exact same round-trip logic against
// the `SerializationCase` shape — JSON (unsafe / safe / safe-direct)
// and binary — with no copy-pasted assertion bodies.

import {expect} from 'vitest';
import type {SerializationCase} from '../suites/serialization/types.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from './equalsHelpers.ts';

function safeStructuredClone(input: unknown): {ok: true; snapshot: unknown} | {ok: false} {
  try {
    return {ok: true, snapshot: structuredClone(input)};
  } catch {
    return {ok: false};
  }
}

// The three JSON round-trip strategies (unsafe / safe / safe-direct) and the
// binary round-trip are each their own exported helper, so a per-subgroup test
// file declares one `it()` per strategy calling its helper. Each helper owns its
// `factoryThrows` contract — for a root-unsupported kind every `createXxx<T>()`
// factory throws on first call (the Go pipeline emits an alwaysThrow cache entry
// whose throwing stub fires at the factory-call site). See docs/UNSUPPORTED-KINDS.md.

// ---------- UNSAFE encode path ------------------------------------

export function assertUnsafeRoundTrip(c: SerializationCase): void {
  if (c.factoryThrows) {
    expect(() => c.unsafeEncoder(), `${c.title}: unsafeEncoder factory must throw`).toThrow();
    expect(() => c.unsafeDecoder(), `${c.title}: unsafeDecoder factory must throw`).toThrow();
    return;
  }

  const label = `${c.title} [unsafe]`;

  // jsonStringifyThrows — unsafe-only contract. The unsafe encoder
  // composes prepareForJson + JSON.stringify; when the input carries a
  // non-serializable structural extra (bigint, …) that prepareForJson
  // doesn't strip, the internal JSON.stringify throws. Documents mion's
  // "extras pass through" semantic.
  if (c.jsonStringifyThrows) {
    const encode = c.unsafeEncoder();
    const {values} = c.getTestData();
    values.forEach((reference, i) => {
      const input = deepCloneForRoundTrip(reference);
      expect(() => encode(input), `${label}: unsafeEncoder(values[${i}]) must throw`).toThrow();
    });
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = c.unsafeEncoder();
  const decode = c.unsafeDecoder();
  const {values, deserializedValues} = c.getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      // Best-effort types accept JSON failures — the broad-type contract
      // is "if a value is JSON-supported it survives".
      if (bestEffort) return;
      throw e;
    }
    // Top-level `undefined` inputs serialize to the literal string
    // 'undefined' (per createJsonEncoder's coercion). Skip the
    // deep-equal half for those.
    if (serialized === undefined) return;
    if (bestEffort) return;
    const restored = decode(serialized);
    // `deserializedValues` holds the expected restored shape when the
    // round-trip is intentionally asymmetric (functions → undefined,
    // class instances → plain objects, etc).
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- SAFE encode path (clone strategy, JSON.stringify) -----

export function assertSafeRoundTrip(c: SerializationCase): void {
  if (c.factoryThrows) {
    expect(() => c.safeEncoder(), `${c.title}: safeEncoder factory must throw`).toThrow();
    expect(() => c.safeDecoder(), `${c.title}: safeDecoder factory must throw`).toThrow();
    return;
  }

  const label = `${c.title} [safe]`;
  const bestEffort = c.roundTripBestEffort ?? false;
  const getTestData = c.getTestDataForStringify ?? c.getTestData;
  const encode = c.safeEncoder();
  const decode = c.safeDecoder();
  const {values, deserializedValues} = getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const preSnapshot = safeStructuredClone(input);

    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }

    // No-mutation invariant — load-bearing for safeEncoder's
    // read-only contract. Skipped for shapes structuredClone refuses
    // (cycles).
    if (preSnapshot.ok) {
      expect(input, `${label}: values[${i}] — safeEncoder must not mutate input`).toEqual(preSnapshot.snapshot);
    }

    if (serialized === undefined) return;
    if (bestEffort) return;

    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- SAFE-DIRECT encode path (single-pass stringifyJson) ---

export function assertSafeDirectRoundTrip(c: SerializationCase): void {
  if (c.factoryThrows) {
    expect(() => c.safeDirectEncoder(), `${c.title}: safeDirectEncoder factory must throw`).toThrow();
    expect(() => c.safeDecoder(), `${c.title}: safeDecoder factory must throw`).toThrow();
    return;
  }

  const label = `${c.title} [safeDirect]`;
  const bestEffort = c.roundTripBestEffort ?? false;
  const getTestData = c.getTestDataForStringify ?? c.getTestData;
  const encode = c.safeDirectEncoder();
  const decode = c.safeDecoder();
  const {values, deserializedValues} = getTestData();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    const preSnapshot = safeStructuredClone(input);

    let serialized: string | undefined;
    try {
      serialized = encode(input);
    } catch (e) {
      if (bestEffort) return;
      throw e;
    }

    if (preSnapshot.ok) {
      expect(input, `${label}: values[${i}] — safeDirectEncoder must not mutate input`).toEqual(preSnapshot.snapshot);
    }

    if (serialized === undefined) return;
    if (bestEffort) return;

    if (c.safeAdapterStringifyJsonNotParseable) {
      // safeDirect uses single-pass stringifyJson which at root for
      // Infinity / NaN emits `String(Infinity)` = `"Infinity"` —
      // unparseable by JSON.parse. Assert the decoder throws.
      expect(() => decode(serialized as string), `${label}: values[${i}] expected decoder to throw (not valid JSON)`).toThrow();
      return;
    }

    const restored = decode(serialized);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
  });
}

// ---------- BINARY round-trip -------------------------------------

/** Drives a case through `binaryEncoder` → `binaryDecoder` and asserts
 *  the decoded value deep-equals the original (or the per-case
 *  `deserializedValues` override when the round-trip is asymmetric).
 *  Requires `binaryEncoder` + `binaryDecoder` thunks to be present. **/
export function runBinaryRoundTripCase(c: SerializationCase): void {
  const factoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
  if (factoryThrows) {
    expect(() => c.binaryEncoder!(), `${c.title}: binaryEncoder factory must throw`).toThrow();
    expect(() => c.binaryDecoder!(), `${c.title}: binaryDecoder factory must throw`).toThrow();
    return;
  }

  const bestEffort = c.roundTripBestEffort ?? false;
  const encode = c.binaryEncoder!();
  const decode = c.binaryDecoder!();
  // Test-data resolution:
  //  1. `getBinaryTestData` — explicit binary override, wins.
  //  2. `getTestDataForStringify` — binary strips extras at encode (only
  //     declared props go through), same as the safe JSON path.
  //  3. `getTestData` — fallback for cases with no stringify-specific
  //     expectation.
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
    // Byte-size assertion — locks in the format binary optimization (a
    // FormatInt8 must encode to 1 byte, FormatBigInt64 to 8, …). Only
    // asserted when the case declares an expected size for this index.
    if (byteSizes && byteSizes[i] !== undefined) {
      expect(buf.byteLength, `${c.title}: values[${i}] encoded byte length`).toBe(byteSizes[i]);
    }
    const restored = decode(buf);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title}: values[${i}] binary round-trip should match expected reference`).toEqual(expected);
  });
}
