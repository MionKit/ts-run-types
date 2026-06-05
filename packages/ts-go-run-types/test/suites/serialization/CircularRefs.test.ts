// serialization / CircularRefs — every CIRCULAR_REFS case run through the JSON round-trip strategies
// (unsafe / safe / safeDirect) and the binary round-trip. One `it()` per strategy, inlined
// directly (no shared util runner); the deep-equality/clone infra rides `equalsHelpers`.
import {describe, expect, it} from 'vitest';
import {CIRCULAR_REFS} from './CircularRefs.ts';
import type {SerializationCase} from './types.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from '../../util/equalsHelpers.ts';

describe('serialization / CircularRefs', () => {
  for (const c of Object.values(CIRCULAR_REFS) as SerializationCase[]) {
    it(`unsafe — ${c.title}`, () => {
      if (c.factoryThrows) {
        expect(() => c.unsafeEncoder(), `${c.title}: unsafeEncoder factory must throw`).toThrow();
        expect(() => c.unsafeDecoder(), `${c.title}: unsafeDecoder factory must throw`).toThrow();
        return;
      }

      const label = `${c.title} [unsafe]`;

      // jsonStringifyThrows — unsafe-only contract: prepareForJson + JSON.stringify throws when a
      // non-serializable structural extra (bigint, …) survives prepareForJson.
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
          if (bestEffort) return;
          throw e;
        }
        // Top-level `undefined` serializes to the literal 'undefined' — skip the deep-equal half.
        if (serialized === undefined) return;
        if (bestEffort) return;
        const restored = decode(serialized);
        const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
        const {actual, expected} = normalizeForComparison(restored, expectedReference);
        expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
      });
    });

    it(`safe — ${c.title}`, () => {
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
        let preSnapshot: {ok: true; snapshot: unknown} | {ok: false};
        try {
          preSnapshot = {ok: true, snapshot: structuredClone(input)};
        } catch {
          preSnapshot = {ok: false};
        }

        let serialized: string | undefined;
        try {
          serialized = encode(input);
        } catch (e) {
          if (bestEffort) return;
          throw e;
        }

        // No-mutation invariant — safeEncoder's read-only contract. Skipped for cycles.
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
    });

    it(`safeDirect — ${c.title}`, () => {
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
        let preSnapshot: {ok: true; snapshot: unknown} | {ok: false};
        try {
          preSnapshot = {ok: true, snapshot: structuredClone(input)};
        } catch {
          preSnapshot = {ok: false};
        }

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

        // safeDirect single-pass stringifyJson emits `String(Infinity)` = "Infinity" at root —
        // unparseable by JSON.parse; assert the decoder throws.
        if (c.safeAdapterStringifyJsonNotParseable) {
          expect(
            () => decode(serialized as string),
            `${label}: values[${i}] expected decoder to throw (not valid JSON)`
          ).toThrow();
          return;
        }

        const restored = decode(serialized);
        const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
        const {actual, expected} = normalizeForComparison(restored, expectedReference);
        expect(actual, `${label}: values[${i}] round-trip should match expected reference`).toEqual(expected);
      });
    });

    it(`binary — ${c.title}`, () => {
      const factoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
      if (factoryThrows) {
        expect(() => c.binaryEncoder!(), `${c.title}: binaryEncoder factory must throw`).toThrow();
        expect(() => c.binaryDecoder!(), `${c.title}: binaryDecoder factory must throw`).toThrow();
        return;
      }

      const bestEffort = c.roundTripBestEffort ?? false;
      const encode = c.binaryEncoder!();
      const decode = c.binaryDecoder!();
      // Test-data: getBinaryTestData (explicit binary override) > getTestDataForStringify
      // (binary strips extras like the safe JSON path) > getTestData (fallback).
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
        // Byte-size assertion — locks in the format binary optimization (FormatInt8 → 1 byte, …).
        if (byteSizes && byteSizes[i] !== undefined) {
          expect(buf.byteLength, `${c.title}: values[${i}] encoded byte length`).toBe(byteSizes[i]);
        }
        const restored = decode(buf);
        const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
        const {actual, expected} = normalizeForComparison(restored, expectedReference);
        expect(actual, `${c.title}: values[${i}] binary round-trip should match expected reference`).toEqual(expected);
      });
    });
  }
});
