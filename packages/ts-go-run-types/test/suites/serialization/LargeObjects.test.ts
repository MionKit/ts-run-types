// serialization / LargeObjects — binary round-trip only. The JSON round-trip is intentionally
// not exercised for the large-object stress cases (the prior serializationRoundTrip runner
// included LARGE_OBJECTS in its spec but ran no JSON `it()` for it); binary is the representative
// codec here.
import {describe, it} from 'vitest';
import {LARGE_OBJECTS} from './LargeObjects.ts';
import {runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / LargeObjects', () => {
  for (const c of Object.values(LARGE_OBJECTS)) {
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
