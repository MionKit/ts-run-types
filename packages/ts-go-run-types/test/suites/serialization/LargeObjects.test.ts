// serialization / LargeObjects — binary round-trip only. The JSON round-trip is intentionally
// not exercised for the large-object stress cases (the prior serializationRoundTrip runner
// included LARGE_OBJECTS in its spec but ran no JSON `it()` for it); binary is the representative
// codec here. Assertion logic inlined (no shared util runner); deep-equality rides equalsHelpers.
import {describe, expect, it} from 'vitest';
import {LARGE_OBJECTS} from './LargeObjects.ts';
import type {SerializationCase} from './types.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from '../../util/equalsHelpers.ts';

describe('serialization / LargeObjects', () => {
  for (const c of Object.values(LARGE_OBJECTS) as SerializationCase[]) {
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
    });
  }
});
