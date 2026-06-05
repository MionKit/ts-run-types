// serialization / ExtraParams — runs every EXTRA_PARAMS case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {EXTRA_PARAMS} from './ExtraParams.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('serialization / ExtraParams', () => {
  for (const c of Object.values(EXTRA_PARAMS)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
