// serialization / Objects — runs every OBJECTS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {OBJECTS} from './Objects.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Objects', () => {
  for (const c of Object.values(OBJECTS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
