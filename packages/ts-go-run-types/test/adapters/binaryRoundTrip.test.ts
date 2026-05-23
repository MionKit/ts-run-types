// Binary round-trip adapter — drives every case in `SERIALIZATION_SPEC`
// through `binaryEncoder` → `binaryDecoder` and asserts the decoded
// value deep-equals the original (or the per-case `deserializedValues`
// override when round-trip is asymmetric — class instances becoming
// plain objects, functions in tuples becoming undefined, etc).
//
// Coverage parity: this adapter is the binary sibling of
// `serializationRoundTrip.test.ts`. The two run against the same
// `SERIALIZATION_SPEC`, so binary inherits every JSON case
// automatically — Parameters<typeof fn>, ReturnType<typeof fn>,
// circular refs, the lot. Cases where binary semantics diverge from
// JSON (e.g. bigint extras that JSON.stringify rejects but binary
// encodes natively) provide a `getBinaryTestData` override; cases
// where binary's alwaysThrow set differs from JSON's (e.g. a kind
// binary refuses but JSON accepts) provide a `binaryFactoryThrows`
// override.
//
// Strict coverage guard: a final `it()` per category asserts that
// EVERY case has `binaryEncoder` + `binaryDecoder` populated. Adding a
// case to `SERIALIZATION_SPEC` without binary thunks will surface as a
// failing test, not a silent skip.

import {describe, expect, it} from 'vitest';
import {SERIALIZATION_SPEC, type SerializationCase} from '../suites/serialization-suite.ts';
import {deepCloneForRoundTrip, normalizeForComparison} from '../util/equalsHelpers.ts';

function runCase(c: SerializationCase): void {
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
  //     declared props go through), same as the safe JSON path; reusing
  //     stringify's cleaned `deserializedValues` saves a case-by-case
  //     copy.
  //  3. `getTestData` — fallback for the ~90% of cases with no
  //     stringify-specific expectation.
  const testDataThunk = c.getBinaryTestData ?? c.getTestDataForStringify ?? c.getTestData;
  const {values, deserializedValues} = testDataThunk();

  values.forEach((reference, i) => {
    const input = deepCloneForRoundTrip(reference);
    let buf;
    try {
      buf = encode(input);
    } catch (e) {
      // Best-effort types (any / unknown / object) accept binary failures
      // the same way the JSON adapter does — the contract is "if a value
      // is supported it survives", not "every value survives".
      if (bestEffort) return;
      throw e;
    }
    if (bestEffort) {
      // For best-effort cases the encoder succeeding is the contract;
      // skip the round-trip equality check.
      return;
    }
    const restored = decode(buf);
    const expectedReference = deserializedValues !== undefined ? deserializedValues[i] : reference;
    const {actual, expected} = normalizeForComparison(restored, expectedReference);
    expect(actual, `${c.title}: values[${i}] binary round-trip should match expected reference`).toEqual(expected);
  });
}

// Per-category drive — generates one `describe` block per top-level
// bucket in `SERIALIZATION_SPEC` and one `it` per case. Plus a final
// `it` per category that hard-asserts every case in the bucket has
// binary thunks defined.
for (const [bucketName, bucket] of Object.entries(SERIALIZATION_SPEC) as Array<[string, Record<string, SerializationCase>]>) {
  describe(`binary round-trip: ${bucketName}`, () => {
    for (const [, c] of Object.entries(bucket)) {
      if (!c.binaryEncoder || !c.binaryDecoder) {
        // Surface missing coverage as a failure — adapter contract is
        // every case in the spec gets binary thunks.
        it(`${c.title}: has binary thunks`, () => {
          expect(c.binaryEncoder, `${c.title}: missing binaryEncoder thunk`).toBeTypeOf('function');
          expect(c.binaryDecoder, `${c.title}: missing binaryDecoder thunk`).toBeTypeOf('function');
        });
        continue;
      }
      it(c.title, () => runCase(c));
    }
  });
}
