// serialization / Others — runs every OTHERS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {OTHERS} from './Others.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Others', () => {
  for (const c of Object.values(OTHERS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
