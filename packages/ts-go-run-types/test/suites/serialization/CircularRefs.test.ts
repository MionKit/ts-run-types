// serialization / CircularRefs — runs every CIRCULAR_REFS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {CIRCULAR_REFS} from './CircularRefs.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / CircularRefs', () => {
  for (const c of Object.values(CIRCULAR_REFS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
