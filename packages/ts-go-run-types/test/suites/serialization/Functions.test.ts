// serialization / Functions — runs every FUNCTIONS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {FUNCTIONS} from './Functions.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Functions', () => {
  for (const c of Object.values(FUNCTIONS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
