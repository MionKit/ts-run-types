// format-serialization / NumberFormat — runs every NUMBER_FORMAT case through JSON and binary round-trips.
import {describe, it} from 'vitest';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {runSerializationCase, runBinaryRoundTripCase} from '../../util/serializationAsserts.ts';

describe('format-serialization / NumberFormat', () => {
  for (const c of Object.values(NUMBER_FORMAT)) {
    it(`json round-trip — ${c.title}`, () => runSerializationCase(c));
    it(`binary round-trip — ${c.title}`, () => runBinaryRoundTripCase(c));
  }
});
