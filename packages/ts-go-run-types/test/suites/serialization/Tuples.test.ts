// serialization / Tuples — runs every TUPLES case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {TUPLES} from './Tuples.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Tuples', () => {
  for (const c of Object.values(TUPLES)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
