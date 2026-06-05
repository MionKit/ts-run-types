// serialization / Arrays — runs every ARRAYS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {ARRAYS} from './Arrays.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Arrays', () => {
  for (const c of Object.values(ARRAYS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
