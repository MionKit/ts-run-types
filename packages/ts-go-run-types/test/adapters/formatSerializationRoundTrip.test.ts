// format serialization round-trip adapter — drives every STRING_FORMAT
// case in FORMAT_SERIALIZATION_SUITE through BOTH JSON encoder + decoder
// modes (unsafe / safe / safe-direct). Sibling of
// serializationRoundTrip.test.ts; shares the same `runSerializationCase`
// helper.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_SERIALIZATION_SUITE} from '../suites/format-serialization-suite.ts';
import {runSerializationCase as runCase} from '../util/serializationAsserts.ts';

describe('format serialization round-trip', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  for (const c of Object.values(FORMAT_SERIALIZATION_SUITE).flatMap((bucket) => Object.values(bucket))) {
    it(c.title, () => runCase(c));
  }

  it('all serialization round-trip tests ran', () => {
    expect(ranTests).toBe(
      Object.values(FORMAT_SERIALIZATION_SUITE).reduce((total, bucket) => total + Object.keys(bucket).length, 0)
    );
  });
});
