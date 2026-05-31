// serialization / UtilityTypes — runs every UTILITY_TYPES case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {UTILITY_TYPES} from './UtilityTypes.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / UtilityTypes', () => {
  for (const c of Object.values(UTILITY_TYPES)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
