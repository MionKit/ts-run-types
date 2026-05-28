// format serialization round-trip adapter — drives every STRING_FORMAT
// case in FORMAT_SERIALIZATION_SUITE through BOTH JSON encoder + decoder
// modes (unsafe / safe / safe-direct). Sibling of
// serializationRoundTrip.test.ts; shares the same `runSerializationCase`
// helper.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_SERIALIZATION_SUITE} from '../suites/format-serialization-suite.ts';
import {runSerializationCase as runCase} from '../util/serializationAsserts.ts';

describe('format serialization round-trip / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  for (const c of Object.values(FORMAT_SERIALIZATION_SUITE.STRING_FORMAT)) {
    it(c.title, () => runCase(c));
  }

  it('all STRING_FORMAT serialization round-trip tests ran', () => {
    expect(ranTests).toBe(Object.keys(FORMAT_SERIALIZATION_SUITE.STRING_FORMAT).length);
  });
});
