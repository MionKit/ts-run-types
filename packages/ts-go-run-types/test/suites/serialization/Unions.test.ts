// serialization / Unions — runs every UNIONS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {UNIONS} from './Unions.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Unions', () => {
  for (const c of Object.values(UNIONS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
