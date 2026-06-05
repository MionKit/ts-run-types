// serialization / Atomic — runs every ATOMIC case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {ATOMIC} from './Atomic.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / Atomic', () => {
  for (const c of Object.values(ATOMIC)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
