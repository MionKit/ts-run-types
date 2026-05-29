// format binary round-trip adapter — the binary sibling of
// formatSerializationRoundTrip.test.ts. Drives every STRING_FORMAT case
// through `binaryEncoder` → `binaryDecoder` and asserts the decoded
// value deep-equals the original. Shares the `runBinaryRoundTripCase`
// helper with binaryRoundTrip.test.ts.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_SERIALIZATION_SUITE} from '../suites/format-serialization-suite.ts';
import {runBinaryRoundTripCase as runCase} from '../util/serializationAsserts.ts';

describe('format binary round-trip', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  for (const c of Object.values(FORMAT_SERIALIZATION_SUITE).flatMap((bucket) => Object.values(bucket))) {
    it(c.title, () => runCase(c));
  }

  it('all binary round-trip tests ran', () => {
    expect(ranTests).toBe(
      Object.values(FORMAT_SERIALIZATION_SUITE).reduce((total, bucket) => total + Object.keys(bucket).length, 0)
    );
  });
});
