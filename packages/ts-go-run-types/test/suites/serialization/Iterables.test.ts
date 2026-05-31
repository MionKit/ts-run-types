// serialization / Iterables — runs every ITERABLES case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {ITERABLES} from './Iterables.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Iterables', () => {
  for (const c of Object.values(ITERABLES)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
