// serialization / Records — runs every RECORDS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {RECORDS} from './Records.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Records', () => {
  for (const c of Object.values(RECORDS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
